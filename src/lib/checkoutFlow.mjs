// Browser/gateway calls are injected so payment outcomes can be checked without
// creating live orders or charging a customer.
export async function completeCheckout(payload, idempotencyKey, services) {
  const online = payload.paymentMethod === "razorpay";
  if (online) await services.loadGateway();
  const data = await services.submitOrder(payload, idempotencyKey);
  let order = data.order;
  if (online && order?.payment_status !== "paid") {
    if (!data.payment) {
      throw new Error("This payment attempt already has an order. Check My orders before trying again.");
    }
    let gatewayResponse;
    try {
      gatewayResponse = await services.openGateway({ payment: data.payment, order, customer: payload.address });
    } catch (failure) {
      try {
        await services.cancelOrder(order.id);
        failure.canStartNewAttempt = true;
      } catch {
        // Keep the same idempotency key until the existing order is resolved.
      }
      throw failure;
    }
    try {
      const verified = await services.verifyPayment(order.id, gatewayResponse);
      order = verified.order;
    } catch {
      // The gateway reported success: a network failure here is not permission
      // to cancel/refund a potentially paid order. The webhook can still settle it.
      throw new Error("Your payment response was received, but its status could not be confirmed. Check My orders before trying again. Your basket has been kept.");
    }
  }
  const confirmedStatuses = ["pending_store_acceptance", "accepted", "picking", "packed", "billed", "dispatched", "delivered"];
  if (!order?.id || !confirmedStatuses.includes(order.status) || (online && order.payment_status !== "paid")) {
    throw new Error("This order is not confirmed. Check My orders for its latest status.");
  }
  return order;
}
