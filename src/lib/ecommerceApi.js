async function ecommerceRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || "Request failed");
    error.status = response.status;
    throw error;
  }
  return payload.data || payload;
}

export function getCurrentCustomer() {
  return ecommerceRequest("/api/auth/me");
}

export function sendLoginOtp(phone) {
  return ecommerceRequest("/api/auth/send-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyLoginOtp(phone, otp) {
  return ecommerceRequest("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
}

export function updateCustomerProfile(profile) {
  return ecommerceRequest("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
}

export function loginWithGoogle(credential) {
  return ecommerceRequest("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export function fetchCustomerAddresses() {
  return ecommerceRequest("/api/auth/addresses");
}

export function saveCustomerAddress(address) {
  return ecommerceRequest("/api/auth/addresses", {
    method: "POST",
    body: JSON.stringify(address),
  });
}

export function deleteCustomerAddress(addressId) {
  return ecommerceRequest(`/api/auth/addresses?id=${addressId}`, {
    method: "DELETE",
  });
}

export function logoutCustomer() {
  return ecommerceRequest("/api/auth/me", { method: "DELETE" });
}

export function fetchCustomerOrders() {
  return ecommerceRequest("/api/orders");
}

export function cancelCustomerOrder(orderId) {
  return ecommerceRequest("/api/orders", {
    method: "PATCH",
    body: JSON.stringify({ orderId, action: "cancel" }),
  });
}

export function verifyRazorpayPayment(orderId, response) {
  return ecommerceRequest("/api/payments/razorpay/verify", {
    method: "POST",
    body: JSON.stringify({ orderId, ...response }),
  });
}

export function submitOrder(order, idempotencyKey) {
  return ecommerceRequest("/api/orders", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(order),
  });
}
