const TBM_BASE_URL = (
  process.env.SYNC_PUBLIC_API_BASE_URL || "https://sync.thebuyzaarmart.com"
).replace(/\/$/, "");

export async function fetchTbmPublic(path) {
  const response = await fetch(`${TBM_BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "TBM catalog request failed");
  }
  return payload.data;
}

export async function resolveTbmStore(pincode) {
  const data = await fetchTbmPublic(
    `/api/public/stores/resolve?pincode=${encodeURIComponent(pincode)}`,
  );
  return data.store;
}

export async function fetchTbmProduct(productId, storeId) {
  const data = await fetchTbmPublic(
    `/api/public/products/${encodeURIComponent(productId)}?store_id=${encodeURIComponent(storeId)}`,
  );
  return data.product || data;
}
