import { NextResponse } from "next/server";
import { isPublicLabel } from "@/lib/shop.mjs";

const SYNC_BASE_URL = (
  process.env.SYNC_PUBLIC_API_BASE_URL || "https://sync.thebuyzaarmart.com"
).replace(/\/$/, "");
const FRESH_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 60 * 60 * 1000;

const globalForFacets = globalThis;
if (!globalForFacets._storefrontFacetCache) {
  globalForFacets._storefrontFacetCache = new Map();
}
const facetCache = globalForFacets._storefrontFacetCache;
const inFlight = new Map();

function publicOnly(list) {
  return (Array.isArray(list) ? list : []).filter((item) => item?.id && isPublicLabel(item.name));
}

async function loadFacets(storeId) {
  const url = new URL(`${SYNC_BASE_URL}/api/public/facets`);
  url.searchParams.set("store_id", String(storeId));
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Unable to load catalog facets");
  }
  const data = payload.data || {};
  return {
    brands: publicOnly(data.brands),
    categories: publicOnly(data.categories),
    subCategories: publicOnly(data.subCategories),
    departments: publicOnly(data.departments),
    product_count: Number(data.product_count || 0),
    refreshed_at: data.refreshed_at || new Date().toISOString(),
  };
}

function refresh(storeId) {
  if (!inFlight.has(storeId)) {
    inFlight.set(
      storeId,
      loadFacets(storeId)
        .then((data) => {
          facetCache.set(storeId, { createdAt: Date.now(), data });
          return data;
        })
        .finally(() => inFlight.delete(storeId)),
    );
  }
  return inFlight.get(storeId);
}

function respond(data) {
  return NextResponse.json(
    { success: true, data },
    { headers: { "cache-control": "private, max-age=300" } },
  );
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
    const age = cached ? Date.now() - cached.createdAt : Infinity;
    if (cached && age < FRESH_TTL_MS) return respond(cached.data);
    if (cached && age < STALE_TTL_MS) {
      refresh(storeId).catch((error) => console.error("[storefront facets refresh]", error));
      return respond(cached.data);
    }
    return respond(await refresh(storeId));
  } catch (error) {
    console.error("[storefront facets]", error);
    return NextResponse.json(
      { success: false, message: "Unable to load catalog filters" },
      { status: 502 },
    );
  }
}
