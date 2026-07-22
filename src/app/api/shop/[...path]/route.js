import { NextResponse } from "next/server";
import { query, ensureEcommerceSchema } from "@/lib/db";

const SYNC_BASE_URL = (
  process.env.SYNC_PUBLIC_API_BASE_URL || "https://sync.thebuyzaarmart.com"
).replace(/\/$/, "");

function buildTargetUrl(request, params) {
  const incomingUrl = new URL(request.url);
  const path = (params.path || []).join("/");
  const targetUrl = new URL(`${SYNC_BASE_URL}/${path}`);
  targetUrl.search = incomingUrl.search;
  return targetUrl;
}

function sanitizeStore(store) {
  if (!store || typeof store !== "object") return store;
  return {
    id: store.id,
    name: store.name,
    address_line1: store.address_line1 || "",
    address_line2: store.address_line2 || "",
    city: store.city || "",
    state: store.state || "",
    pincode: store.pincode || "",
    country: store.country || "India",
    opening_time: store.opening_time || null,
    closing_time: store.closing_time || null,
    delivery_distance_km: store.delivery_distance_km ?? null,
    delivery_radius_km: store.delivery_radius_km ?? null,
  };
}

function sanitizePublicStorePayload(payload, pathArray) {
  if (
    pathArray[0] !== "api" ||
    pathArray[1] !== "public" ||
    pathArray[2] !== "stores" ||
    !payload?.data
  ) {
    return;
  }

  if (Array.isArray(payload.data.records)) {
    payload.data.records = payload.data.records.map(sanitizeStore);
  }
  if (payload.data.store) {
    payload.data.store = sanitizeStore(payload.data.store);
  }
}

async function enrichProducts(payload, pathArray, storeId) {
  const isProductList =
    pathArray.length === 3 &&
    pathArray[0] === "api" &&
    pathArray[1] === "public" &&
    ["products", "search"].includes(pathArray[2]);
  const isProductDetail =
    pathArray.length === 4 &&
    pathArray[0] === "api" &&
    pathArray[1] === "public" &&
    pathArray[2] === "products";

  if (!isProductList && !isProductDetail) return;

  try {
    await ensureEcommerceSchema();

    if (isProductList) {
      const records = payload.data.records || [];
      const barcodes = records.map((record) => record.barcode).filter(Boolean);
      const productIds = records.map((record) => Number(record.id)).filter(Boolean);
      const dbResult = barcodes.length
        ? await query(
            `SELECT barcode, image_url, description
             FROM ecommerce_products
             WHERE barcode = ANY($1::varchar[])`,
            [barcodes],
          )
        : { rows: [] };
      const reservationResult =
        storeId && productIds.length
          ? await query(
              `SELECT product_id, COALESCE(SUM(qty), 0) AS reserved_qty
               FROM ecommerce_inventory_reservations
               WHERE store_id = $1
                 AND product_id = ANY($2::bigint[])
                 AND status = 'active'
                 AND (expires_at IS NULL OR expires_at > NOW())
               GROUP BY product_id`,
              [storeId, productIds],
            )
          : { rows: [] };
      const localByBarcode = new Map(
        dbResult.rows.map((row) => [row.barcode, row]),
      );
      const reservedByProduct = new Map(
        reservationResult.rows.map((row) => [
          Number(row.product_id),
          Number(row.reserved_qty),
        ]),
      );
      payload.data.records = records.map((record) => {
        const local = localByBarcode.get(record.barcode);
        const stock = Math.max(
          0,
          Number(record.stock || 0) -
            Number(reservedByProduct.get(Number(record.id)) || 0),
        );
        return {
          ...record,
          stock,
          in_stock: stock > 0,
          image_url: local?.image_url || record.image_url,
          description:
            local?.description || record.description || null,
        };
      });
      return;
    }

    const product = payload.data.product || payload.data;
    if (product?.barcode) {
      const dbResult = await query(
        `SELECT image_url, description
         FROM ecommerce_products
         WHERE barcode = $1
         LIMIT 1`,
        [product.barcode],
      );
      const local = dbResult.rows[0];
      if (local) {
        product.image_url = local.image_url || product.image_url;
        product.description = local.description || product.description;
      }
    }
    if (storeId && product?.id) {
      const reservationResult = await query(
        `SELECT COALESCE(SUM(qty), 0) AS reserved_qty
         FROM ecommerce_inventory_reservations
         WHERE store_id = $1
           AND product_id = $2
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [storeId, product.id],
      );
      product.stock = Math.max(
        0,
        Number(product.stock || 0) -
          Number(reservationResult.rows[0]?.reserved_qty || 0),
      );
      product.in_stock = product.stock > 0;
    }
  } catch (error) {
    // Image enrichment is optional; the live TBM catalog remains the source of truth.
    console.warn("[shop proxy] product enrichment skipped:", error.message);
  }
}

export async function GET(request, context) {
  try {
    const params = await context.params;
    const pathArray = params.path || [];
    const targetUrl = buildTargetUrl(request, params);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return new NextResponse(body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") || "application/json",
          "cache-control": "no-store",
        },
      });
    }

    const payloadText = await response.text();
    let jsonPayload;
    try {
      jsonPayload = JSON.parse(payloadText);
    } catch {
      // If response is not JSON, just return it directly
      return new NextResponse(payloadText, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") || "application/json",
          "cache-control": "no-store",
        },
      });
    }

    if (jsonPayload.success && jsonPayload.data) {
      sanitizePublicStorePayload(jsonPayload, pathArray);
      await enrichProducts(
        jsonPayload,
        pathArray,
        Number(targetUrl.searchParams.get("store_id")) || null,
      );
    }

    return NextResponse.json(jsonPayload, {
      status: response.status,
      headers: {
        "cache-control": "no-store",
      },
    });

  } catch (err) {
    console.error("[proxy get error]", err);
    return NextResponse.json(
      { success: false, message: "The catalog service is temporarily unavailable" },
      { status: 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
