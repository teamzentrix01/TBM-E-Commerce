import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient } from "@/lib/db";
import { requireEcommerceUser } from "@/lib/ecommerceAuth";
import {
  captureRazorpayPayment,
  fetchRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from "@/lib/razorpay";
import {
  markRazorpayPaymentCaptured,
  moneyToPaise,
} from "@/lib/paymentStore";

export async function POST(request) {
  let client;
  try {
    await ensureEcommerceSchema();
    const auth = await requireEcommerceUser();
    if (auth.error) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: 401 },
      );
    }

    const body = await request.json();
    const orderId = Number(body.orderId);
    const gatewayOrderId = String(body.razorpay_order_id || "");
    const gatewayPaymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (!orderId || !gatewayOrderId || !gatewayPaymentId || !signature) {
      return NextResponse.json(
        { success: false, message: "Complete payment proof is required" },
        { status: 400 },
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT
         p.id AS payment_id,
         p.gateway_order_id,
         p.amount,
         o.id AS order_id,
         o.user_id,
         o.order_number,
         o.store_name,
         o.status AS order_status,
         o.payment_status AS order_payment_status,
         o.grand_total
       FROM ecommerce_payments p
       INNER JOIN ecommerce_orders o ON o.id = p.order_id
       WHERE o.id = $1 AND o.user_id = $2 AND p.provider = 'razorpay'
       FOR UPDATE OF p, o`,
      [orderId, auth.user.id],
    );
    const record = result.rows[0];
    if (!record) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Payment order not found" },
        { status: 404 },
      );
    }
    if (record.order_payment_status === "paid") {
      await client.query("COMMIT");
      return NextResponse.json({
        success: true,
        data: {
          order: {
            id: record.order_id,
            order_number: record.order_number,
            store_name: record.store_name,
            status: record.order_status,
            payment_status: "paid",
            grand_total: Number(record.grand_total),
          },
        },
      });
    }
    if (
      record.order_status !== "payment_pending" ||
      gatewayOrderId !== record.gateway_order_id ||
      !verifyRazorpayPaymentSignature({
        gatewayOrderId: record.gateway_order_id,
        gatewayPaymentId,
        signature,
      })
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Payment verification failed" },
        { status: 400 },
      );
    }

    let payment = await fetchRazorpayPayment(gatewayPaymentId);
    if (payment.status === "authorized") {
      payment = await captureRazorpayPayment(
        gatewayPaymentId,
        moneyToPaise(record.amount),
      );
    }
    if (payment.status !== "captured") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Payment has not been captured" },
        { status: 409 },
      );
    }

    await client.query(
      `UPDATE ecommerce_payments
       SET gateway_signature = $2
       WHERE id = $1`,
      [record.payment_id, signature],
    );
    await markRazorpayPaymentCaptured(client, record, payment);
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      data: {
        order: {
          id: record.order_id,
          order_number: record.order_number,
          store_name: record.store_name,
          status: "pending_store_acceptance",
          payment_status: "paid",
          grand_total: Number(record.grand_total),
        },
      },
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[verify razorpay payment]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to verify payment" },
      { status: error.status || 500 },
    );
  } finally {
    client?.release();
  }
}

