import { NextResponse } from "next/server";

const SYNC_BASE_URL = (
  process.env.SYNC_PUBLIC_API_BASE_URL || "https://sync.thebuyzaarmart.com"
).replace(/\/$/, "");
const PAGE_SIZE = 60;
const CACHE_TTL_MS = 10 * 60 * 1000;
const facetCache = new Map();

function addFacet(map, id, name) {
  if (!id || !name) return;
  const key = String(id);
  const current = map.get(key);
  map.set(key, {
    id: Number(id),
    name: String(name),
    product_count: (current?.product_count || 0) + 1,
  });
}

async function fetchProductPage(storeId, page) {
  const url = new URL(`${SYNC_BASE_URL}/api/public/products`);
  url.searchParams.set("store_id", String(storeId));
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(PAGE_SIZE));

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Unable to load catalog facets");
  }
  return payload.data || {};
}

async function loadFacets(storeId) {
  const firstPage = await fetchProductPage(storeId, 1);
  const totalPages = Math.min(Number(firstPage.totalPages || 1), 100);
  const records = [...(firstPage.records || [])];

  for (let start = 2; start <= totalPages; start += 6) {
    const pageNumbers = Array.from(
      { length: Math.min(6, totalPages - start + 1) },
      (_, index) => start + index,
    );
    const pages = await Promise.all(
      pageNumbers.map((page) => fetchProductPage(storeId, page)),
    );
    pages.forEach((page) => records.push(...(page.records || [])));
  }

  const brands = new Map();
  const categories = new Map();
  const subCategories = new Map();
  const departments = new Map();

  records.forEach((product) => {
    addFacet(brands, product.brand_id, product.brand_name);
    addFacet(categories, product.category_id, product.category_name);
    addFacet(
      subCategories,
      product.sub_category_id,
      product.sub_category_name,
    );
    addFacet(departments, product.department_id, product.department_name);
  });

  const toRecords = (map) =>
    [...map.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    brands: toRecords(brands),
    categories: toRecords(categories),
    subCategories: toRecords(subCategories),
    departments: toRecords(departments),
    product_count: Number(firstPage.total || records.length),
    refreshed_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const storeId = Number(searchParams.get("store_id"));
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return NextResponse.json(
      { success: false, message: "Valid store_id is required" },
      { status: 400 },
    );
  }

  try {
    const cached = facetCache.get(storeId);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { headers: { "cache-control": "private, max-age=300" } },
      );
    }

    const data = await loadFacets(storeId);
    facetCache.set(storeId, { createdAt: Date.now(), data });
    return NextResponse.json(
      { success: true, data },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("[storefront facets]", error);
    return NextResponse.json(
      { success: false, message: "Unable to load catalog filters" },
      { status: 502 },
    );
  }
}
