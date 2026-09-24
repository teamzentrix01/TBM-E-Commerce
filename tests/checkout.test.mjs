import test from "node:test";
import assert from "node:assert/strict";
import { completeCheckout } from "../src/lib/checkoutFlow.mjs";

function fixture(overrides = {}) {
  const calls = [];
  const pending = { id: 42, status: "payment_pending", payment_status: "pending" };
  const confirmed = { ...pending, status: "pending_store_acceptance", payment_status: "paid" };
  const services = {
    loadGateway: async () => { calls.push("load"); },
    submitOrder: async (_payload, key) => { calls.push(["submit", key]); return { order: pending, payment: { orderId: "gateway-test" } }; },
    openGateway: async () => { calls.push("open"); return { razorpay_payment_id: "test-payment" }; },
    verifyPayment: async (id, response) => { calls.push(["verify", id, response.razorpay_payment_id]); return { order: confirmed }; },
    cancelOrder: async id => { calls.push(["cancel", id]); },
    ...overrides,
  };
  return { calls, services, confirmed };
}

test("COD and UPI on delivery confirm without opening the online gateway", async () => {
  for (const paymentMethod of ["cod", "upi_on_delivery"]) {
    const order = { id: 11, status: "pending_store_acceptance", payment_status: "pending" };
    const { calls, services } = fixture({ submitOrder: async () => ({ order }) });
    assert.equal(await completeCheckout({ paymentMethod }, "one-attempt", services), order);
    assert.deepEqual(calls, []);
  }
});

test("online checkout confirms only after server verification", async () => {
  const { calls, services, confirmed } = fixture();
  assert.equal(await completeCheckout({ paymentMethod: "razorpay", address: {} }, "stable-key", services), confirmed);
  assert.deepEqual(calls, ["load", ["submit", "stable-key"], "open", ["verify", 42, "test-payment"]]);
});

test("SDK failure does not create an order", async () => {
  const { calls, services } = fixture({ loadGateway: async () => { throw new Error("offline"); } });
  await assert.rejects(completeCheckout({ paymentMethod: "razorpay" }, "key", services), /offline/);
  assert.deepEqual(calls, []);
});

test("gateway dismissal cancels the pending order and permits a fresh attempt", async () => {
  const { calls, services } = fixture({ openGateway: async () => { throw new Error("cancelled"); } });
  await assert.rejects(completeCheckout({ paymentMethod: "razorpay" }, "key", services), error => error.message === "cancelled" && error.canStartNewAttempt === true);
  assert.deepEqual(calls, ["load", ["submit", "key"], ["cancel", 42]]);
});

test("failed cancellation retains the existing attempt instead of allowing duplicate orders", async () => {
  const { services } = fixture({ openGateway: async () => { throw new Error("cancelled"); }, cancelOrder: async () => { throw new Error("offline"); } });
  await assert.rejects(completeCheckout({ paymentMethod: "razorpay" }, "key", services), error => !error.canStartNewAttempt);
});

test("verification network failure does not cancel a potentially paid order", async () => {
  const { calls, services } = fixture({ verifyPayment: async () => { throw new Error("connection lost"); } });
  await assert.rejects(completeCheckout({ paymentMethod: "razorpay" }, "key", services), /Check My orders/);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "cancel"), false);
});

test("idempotent paid response is not charged a second time", async () => {
  const order = { id: 42, status: "accepted", payment_status: "paid" };
  const { calls, services } = fixture({ submitOrder: async () => ({ order }) });
  assert.equal(await completeCheckout({ paymentMethod: "razorpay" }, "same-key", services), order);
  assert.deepEqual(calls, ["load"]);
});

test("unconfirmed or cancelled orders never produce a success result", async () => {
  for (const status of ["payment_pending", "cancelled", "rejected", undefined]) {
    const { services } = fixture({ submitOrder: async () => ({ order: { id: 42, status } }) });
    await assert.rejects(completeCheckout({ paymentMethod: "cod" }, "key", services), /not confirmed/);
  }
});
