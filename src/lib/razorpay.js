import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

function paymentConfig() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    const error = new Error("Online payment is not configured");
    error.status = 503;
    throw error;
  }
  return { keyId, keySecret };
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = paymentConfig();
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error?.description || "Payment gateway request failed",
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getRazorpayKeyId() {
  return paymentConfig().keyId;
}

export async function createRazorpayOrder({
  amountPaise,
  receipt,
  notes = {},
}) {
  return razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: String(receipt).slice(0, 40),
      notes,
    }),
  });
}

export async function fetchRazorpayPayment(paymentId) {
  return razorpayRequest(
    `/payments/${encodeURIComponent(String(paymentId))}`,
  );
}

export async function captureRazorpayPayment(paymentId, amountPaise) {
  return razorpayRequest(
    `/payments/${encodeURIComponent(String(paymentId))}/capture`,
    {
      method: "POST",
      body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
    },
  );
}

export async function createRazorpayRefund({
  paymentId,
  amountPaise,
  receipt,
  idempotencyKey,
  notes = {},
}) {
  return razorpayRequest(
    `/payments/${encodeURIComponent(String(paymentId))}/refund`,
    {
      method: "POST",
      headers: {
        "x-refund-idempotency": String(idempotencyKey),
      },
      body: JSON.stringify({
        amount: amountPaise,
        speed: "normal",
        receipt: String(receipt).slice(0, 40),
        notes,
      }),
    },
  );
}

export function verifyRazorpayPaymentSignature({
  gatewayOrderId,
  gatewayPaymentId,
  signature,
}) {
  const { keySecret } = paymentConfig();
  const expected = createHmac("sha256", keySecret)
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest("hex");
  return secureEqual(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    const error = new Error("Payment webhook is not configured");
    error.status = 503;
    throw error;
  }
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return secureEqual(expected, signature);
}
