import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient } from "@/lib/db";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { markRazorpayPaymentCaptured } from "@/lib/paymentStore";

export async function POST(request) {
  let client;
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        { success: false, message: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    const event = JSON.parse(rawBody);
    await ensureEcommerceSchema();

    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) {
        return NextResponse.json({ success: true, ignored: true });
      }

      client = await getClient();
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT
           p.id AS payment_id,
           p.gateway_order_id,
           p.amount,
           o.id AS order_id,
           o.status AS order_status,
           o.payment_status AS order_payment_status
         FROM ecommerce_payments p
         INNER JOIN ecommerce_orders o ON o.id = p.order_id
         WHERE p.provider = 'razorpay' AND p.gateway_order_id = $1
         FOR UPDATE OF p, o`,
        [payment.order_id],
      );
      if (result.rows[0]) {
        await markRazorpayPaymentCaptured(client, result.rows[0], payment);
      }
      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    }

    if (["refund.processed", "refund.failed"].includes(event.event)) {
      const refund = event.payload?.refund?.entity;
      if (!refund?.payment_id) {
        return NextResponse.json({ success: true, ignored: true });
      }
      const refundStatus =
        event.event === "refund.processed" ? "refunded" : "refund_failed";
      client = await getClient();
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE ecommerce_payments
         SET refund_id = $2,
             refund_status = $3,
             status = $3,
             provider_payload = $4::jsonb,
             refunded_at = CASE WHEN $3 = 'refunded' THEN NOW() ELSE refunded_at END,
             updated_at = NOW()
         WHERE provider = 'razorpay' AND gateway_payment_id = $1
         RETURNING order_id`,
        [
          refund.payment_id,
          refund.id || null,
          refundStatus,
          JSON.stringify(refund),
        ],
      );
      if (result.rows[0]) {
        await client.query(
          `UPDATE ecommerce_orders
           SET payment_status = $2, updated_at = NOW()
           WHERE id = $1`,
          [result.rows[0].order_id, refundStatus],
        );
      }
      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[razorpay webhook]", error);
    return NextResponse.json(
      { success: false, message: "Webhook processing failed" },
      { status: error.status || 500 },
    );
  } finally {
    client?.release();
  }
}
