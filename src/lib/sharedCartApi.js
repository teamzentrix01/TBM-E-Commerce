async function sharedRequest(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || "Shared cart request failed");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function createSharedCart(payload) {
  return sharedRequest("/api/shared-carts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchSharedCart(token) {
  return sharedRequest(`/api/shared-carts/${encodeURIComponent(token)}`);
}

export function joinSharedCart(token, displayName) {
  return sharedRequest(`/api/shared-carts/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export function updateSharedCartItem(token, memberToken, productId, delta) {
  return sharedRequest(`/api/shared-carts/${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "x-shared-member-token": memberToken },
    body: JSON.stringify({ productId, delta }),
  });
}
