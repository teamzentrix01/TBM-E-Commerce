const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api/shop";

async function requestPublicApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Request failed");
  }
  return payload.data;
}

export function fetchStores(options) {
  return requestPublicApi("/api/public/stores", options);
}

export async function resolveStoreByPincode(
  pincode,
  coordinates = null,
  options = {},
) {
  const params = new URLSearchParams({ pincode: String(pincode || "") });
  if (coordinates?.latitude != null) {
    params.set("latitude", String(coordinates.latitude));
  }
  if (coordinates?.longitude != null) {
    params.set("longitude", String(coordinates.longitude));
  }
  try {
    return await requestPublicApi(
      `/api/public/stores/resolve?${params.toString()}`,
    );
  } catch (error) {
    if (coordinates && options.allowPincodeFallback && pincode) {
      return requestPublicApi(
        `/api/public/stores/resolve?pincode=${encodeURIComponent(pincode)}`,
      );
    }
    throw error;
  }
}

export function fetchCategories(storeId) {
  return requestPublicApi(
    `/api/public/categories?store_id=${encodeURIComponent(storeId)}`,
  );
}

export function fetchProducts({
  storeId,
  search = "",
  categoryId = "",
  subCategoryId = "",
  brandId = "",
  departmentId = "",
  page = 1,
  pageSize = 36,
  signal,
}) {
  const params = new URLSearchParams({
    store_id: String(storeId),
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search.trim()) params.set("search", search.trim());
  if (categoryId) params.set("category_id", String(categoryId));
  if (subCategoryId) {
    params.set("sub_category_id", String(subCategoryId));
  }
  if (brandId) params.set("brand_id", String(brandId));
  if (departmentId) params.set("department_id", String(departmentId));
  return requestPublicApi(`/api/public/products?${params.toString()}`, {
    signal,
  });
}

export function fetchProduct(productId, storeId) {
  return requestPublicApi(`/api/public/products/${encodeURIComponent(productId)}?store_id=${encodeURIComponent(storeId)}`);
}

export async function fetchStorefrontFacets(storeId, options = {}) {
  const response = await fetch(
    `/api/storefront/facets?store_id=${encodeURIComponent(storeId)}`,
    {
      cache: "no-store",
      signal: options.signal,
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Unable to load catalog filters");
  }
  return payload.data;
}

export function searchProducts(storeId, search, options = {}) {
  const params = new URLSearchParams({
    store_id: String(storeId),
    q: String(search || "").trim(),
  });
  return requestPublicApi(`/api/public/search?${params.toString()}`, options);
}

export function fetchStorefrontBanners(storeId, options = {}) {
  const params = new URLSearchParams();
  if (storeId) params.set("store_id", String(storeId));
  const query = params.toString();
  return requestPublicApi(
    `/api/public/storefront-banners${query ? `?${query}` : ""}`,
    options,
  );
}

export function fetchStorefrontHampers(storeId, options = {}) {
  const params = new URLSearchParams({
    store_id: String(storeId),
  });
  return requestPublicApi(
    `/api/public/storefront-hampers?${params.toString()}`,
    options,
  );
}

