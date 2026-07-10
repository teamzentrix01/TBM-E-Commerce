export function moneyToPaise(value) {
  return Math.round(Number(value || 0) * 100);
}

export async function markRazorpayPaymentCaptured(client, record, payment) {
  if (record.order_payment_status === "paid") return false;

  const expectedAmount = moneyToPaise(record.amount);
  if (
    String(payment.order_id) !== String(record.gateway_order_id) ||
    Number(payment.amount) !== expectedAmount ||
    String(payment.currency || "").toUpperCase() !== "INR" ||
    payment.status !== "captured"
  ) {
    throw new Error("Captured payment details do not match the order");
  }

  await client.query(
    `UPDATE ecommerce_payments
     SET gateway_payment_id = $2,
         status = 'captured',
         payment_method_detail = $3,
         provider_payload = $4::jsonb,
         verified_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      record.payment_id,
      payment.id,
      String(payment.method || "").slice(0, 40) || null,
      JSON.stringify(payment),
    ],
  );
  await client.query(
    `UPDATE ecommerce_orders
     SET status = 'pending_store_acceptance',
         payment_status = 'paid',
         payment_reference = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [record.order_id, payment.id],
  );
  await client.query(
    `UPDATE ecommerce_inventory_reservations
     SET expires_at = NOW() + INTERVAL '2 hours'
     WHERE order_id = $1 AND status = 'active'`,
    [record.order_id],
  );
  await client.query(
    `INSERT INTO ecommerce_order_status_history
       (order_id, from_status, to_status, actor_type, actor_id, note, metadata)
     VALUES (
       $1, $2, 'pending_store_acceptance', 'payment_gateway', $3,
       'Online payment captured and verified', $4::jsonb
     )`,
    [
      record.order_id,
      record.order_status,
      payment.id,
      JSON.stringify({
        provider: "razorpay",
        gatewayOrderId: record.gateway_order_id,
        method: payment.method || null,
      }),
    ],
  );
  return true;
}

