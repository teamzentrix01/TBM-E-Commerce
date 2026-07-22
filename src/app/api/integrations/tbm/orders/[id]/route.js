import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient } from "@/lib/db";
import {
  deliveryOtp,
  secureEqual,
  verifyIntegrationKey,
} from "@/lib/ecommerceAuth";
import { getOrder, ORDER_TRANSITIONS } from "@/lib/ecommerceOrders";
import { moneyToPaise } from "@/lib/paymentStore";
import { createRazorpayRefund } from "@/lib/razorpay";

const ACTION_STATUS = {
  accept: "accepted",
  reject: "rejected",
  start_picking: "picking",
  mark_packed: "packed",
  mark_billed: "billed",
  dispatch: "dispatched",
  deliver: "delivered",
  cancel: "cancelled",
};

async function handleDeliveryAction(id, body) {
  let client;
  try {
    client = await getClient();
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT id, store_id, status, delivery_agent_id
       FROM ecommerce_orders
       WHERE id = $1
       FOR UPDATE`,
      [Number(id)],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }
    if (body.storeId && Number(body.storeId) !== Number(order.store_id)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Order does not belong to this store" },
        { status: 403 },
      );
    }

    if (body.action === "assign_rider") {
      if (
        !["accepted", "picking", "packed", "billed"].includes(order.status)
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "Rider cannot be assigned at this stage" },
          { status: 409 },
        );
      }
      const agentId = Number(body.agentId);
      const agentUserId = Number(body.agentUserId);
      const agentName = String(body.agentName || "").trim();
      if (!agentId || !agentUserId || !agentName) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "Valid delivery rider is required" },
          { status: 400 },
        );
      }
      await client.query(
        `UPDATE ecommerce_orders
         SET delivery_agent_id = $2,
             delivery_agent_user_id = $3,
             delivery_agent_name = $4,
             delivery_agent_phone = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [
          Number(id),
          agentId,
          agentUserId,
          agentName.slice(0, 160),
          String(body.agentPhone || "").slice(0, 30) || null,
        ],
      );
    } else {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const agentId = Number(body.agentId);
      if (
        !agentId ||
        agentId !== Number(order.delivery_agent_id) ||
        order.status !== "dispatched" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "Invalid rider location update" },
          { status: 403 },
        );
      }
      const accuracy = Number(body.accuracy || 0) || null;
      await client.query(
        `UPDATE ecommerce_orders
         SET rider_latitude = $2,
             rider_longitude = $3,
             rider_location_accuracy_m = $4,
             rider_location_updated_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [Number(id), latitude, longitude, accuracy],
      );
      await client.query(
        `INSERT INTO ecommerce_delivery_location_events
           (order_id, delivery_agent_id, latitude, longitude, accuracy_m)
         VALUES ($1, $2, $3, $4, $5)`,
        [Number(id), agentId, latitude, longitude, accuracy],
      );
    }

    await client.query("COMMIT");
    const updated = await getOrder(id);
    return NextResponse.json({ success: true, data: { order: updated } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[tbm delivery action]", error);
    return NextResponse.json(
      { success: false, message: "Unable to update delivery" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}

export async function GET(request, context) {
  if (!verifyIntegrationKey(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid integration credentials" },
      { status: 401 },
    );
  }
  await ensureEcommerceSchema();
  const { id } = await context.params;
  const order = await getOrder(id);
  return NextResponse.json(
    order
      ? { success: true, data: { order } }
      : { success: false, message: "Order not found" },
    { status: order ? 200 : 404 },
  );
}

export async function PATCH(request, context) {
  if (!verifyIntegrationKey(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid integration credentials" },
      { status: 401 },
    );
  }

  let client;
  try {
    await ensureEcommerceSchema();
    const { id } = await context.params;
    const body = await request.json();
    if (["assign_rider", "update_location"].includes(body.action)) {
      return handleDeliveryAction(id, body);
    }
    const nextStatus = ACTION_STATUS[body.action] || "";
    if (!nextStatus) {
      return NextResponse.json(
        { success: false, message: "Unsupported order action" },
        { status: 400 },
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT o.*, p.id AS payment_id, p.gateway_payment_id
       FROM ecommerce_orders o
       LEFT JOIN ecommerce_payments p ON p.order_id = o.id AND p.provider = 'razorpay'
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [Number(id)],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }
    if (body.storeId && Number(body.storeId) !== Number(order.store_id)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Order does not belong to this store" },
        { status: 403 },
      );
    }
    if (!(ORDER_TRANSITIONS[order.status] || []).includes(nextStatus)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: `Cannot move order from ${order.status} to ${nextStatus}`,
        },
        { status: 409 },
      );
    }
    if (nextStatus === "dispatched" && !order.delivery_agent_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Assign a rider before dispatch" },
        { status: 409 },
      );
    }
    if (
      nextStatus === "delivered" &&
      !secureEqual(deliveryOtp(order.id), String(body.otp || "").trim())
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Invalid delivery OTP" },
        { status: 400 },
      );
    }
    if (nextStatus === "rejected" && !String(body.reason || "").trim()) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Rejection reason is required" },
        { status: 400 },
      );
    }
    if (nextStatus === "billed" && !body.billNumber) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "TBM bill number is required" },
        { status: 400 },
      );
    }
    if (nextStatus === "accepted") {
      const reservationCheck = await client.query(
        `SELECT COUNT(*)::int AS item_count
         FROM ecommerce_inventory_reservations
         WHERE order_id = $1
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [Number(id)],
      );
      const orderItemCount = await client.query(
        `SELECT COUNT(*)::int AS item_count
         FROM ecommerce_order_items
         WHERE order_id = $1`,
        [Number(id)],
      );
      if (
        Number(reservationCheck.rows[0]?.item_count || 0) !==
        Number(orderItemCount.rows[0]?.item_count || 0)
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            success: false,
            message:
              "Order reservation has expired. Recheck or reject this order.",
          },
          { status: 409 },
        );
      }
    }

    let refund = null;
    if (
      ["rejected", "cancelled"].includes(nextStatus) &&
      order.payment_method === "razorpay" &&
      order.payment_status === "paid"
    ) {
      if (!order.gateway_payment_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "Paid order is missing payment reference" },
          { status: 409 },
        );
      }
      refund = await createRazorpayRefund({
        paymentId: order.gateway_payment_id,
        amountPaise: moneyToPaise(order.grand_total),
        receipt: `${order.order_number}-refund`,
        idempotencyKey: `${order.order_number}-${nextStatus}`,
        notes: {
          reason: nextStatus,
          orderNumber: order.order_number,
          actorId: String(body.actorId || ""),
        },
      });
      await client.query(
        `UPDATE ecommerce_payments
         SET refund_id = $2,
             refund_status = $3,
             status = CASE WHEN status = 'captured' THEN 'refund_initiated' ELSE status END,
             provider_payload = provider_payload || $4::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          order.payment_id,
          refund.id,
          refund.status || "created",
          JSON.stringify({ refund }),
        ],
      );
    }

    const timestamps = {
      accepted: "accepted_at = NOW()",
      packed: "packed_at = NOW()",
      dispatched: "dispatched_at = NOW()",
      delivered: "delivered_at = NOW()",
      cancelled: "cancelled_at = NOW()",
    };
    const updateFragments = [
      "status = $1",
      "updated_at = NOW()",
      timestamps[nextStatus],
    ].filter(Boolean);
    if (nextStatus === "dispatched") {
      updateFragments.push("picked_up_at = NOW()");
    }
    const params = [nextStatus];
    if (
      ["rejected", "cancelled"].includes(nextStatus) &&
      order.payment_method === "razorpay" &&
      order.payment_status === "paid"
    ) {
      updateFragments.push(`payment_status = 'refund_pending'`);
    }
    if (nextStatus === "rejected") {
      params.push(String(body.reason).trim().slice(0, 1000));
      updateFragments.push(`rejection_reason = $${params.length}`);
    }
    if (nextStatus === "billed") {
      params.push(Number(body.billId) || null);
      updateFragments.push(`tbm_bill_id = $${params.length}`);
      params.push(String(body.billNumber).slice(0, 80));
      updateFragments.push(`tbm_bill_number = $${params.length}`);
      params.push(String(body.invoiceToken || "").slice(0, 120) || null);
      updateFragments.push(`tbm_invoice_token = $${params.length}`);
    }
    params.push(Number(id));
    await client.query(
      `UPDATE ecommerce_orders
       SET ${updateFragments.join(", ")}
       WHERE id = $${params.length}`,
      params,
    );

    if (nextStatus === "accepted") {
      await client.query(
        `UPDATE ecommerce_inventory_reservations
         SET expires_at = NOW() + INTERVAL '4 hours'
         WHERE order_id = $1 AND status = 'active'`,
        [Number(id)],
      );
    }
    if (["rejected", "cancelled", "billed"].includes(nextStatus)) {
      await client.query(
        `UPDATE ecommerce_inventory_reservations
         SET status = $2, released_at = NOW()
         WHERE order_id = $1 AND status = 'active'`,
        [Number(id), nextStatus === "billed" ? "converted" : "released"],
      );
    }
    await client.query(
      `INSERT INTO ecommerce_order_status_history
         (order_id, from_status, to_status, actor_type, actor_id, note, metadata)
       VALUES ($1, $2, $3, 'tbm_user', $4, $5, $6::jsonb)`,
      [
        Number(id),
        order.status,
        nextStatus,
        String(body.actorId || ""),
        String(body.reason || body.note || "").slice(0, 1000),
        JSON.stringify({
          actorName: body.actorName || null,
          billNumber: body.billNumber || null,
        }),
      ],
    );
    await client.query("COMMIT");

    const updated = await getOrder(id);
    return NextResponse.json({
      success: true,
      data: { order: updated },
      message: "Order updated",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[tbm order update]", error);
    return NextResponse.json(
      { success: false, message: "Unable to update order" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
