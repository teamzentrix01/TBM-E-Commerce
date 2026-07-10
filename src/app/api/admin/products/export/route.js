import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const SYNC_BASE_URL = (
  process.env.SYNC_PUBLIC_API_BASE_URL || "https://sync.thebuyzaarmart.com"
).replace(/\/$/, "");

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("store_id") || "3";

    let allProducts = [];
    let page = 1;
    let totalPages = 1;

    // Loop through the paginated results of POS public API
    while (page <= totalPages) {
      const url = `${SYNC_BASE_URL}/api/public/products?store_id=${storeId}&page=${page}&pageSize=60`;
      const res = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch products from POS API. Status: ${res.status}`);
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || "Failed to fetch products");
      }

      const records = json.data?.records || [];
      if (records.length === 0) break;

      allProducts = allProducts.concat(records);
      totalPages = json.data?.totalPages || 1;
      page++;
    }

    if (allProducts.length === 0) {
      return NextResponse.json(
        { success: false, message: "No products found to export" },
        { status: 400 }
      );
    }

    // Query local DB for database details
    const barcodes = allProducts.map((p) => p.barcode).filter(Boolean);
    const localMap = {};
    if (barcodes.length > 0) {
      const dbRes = await query(
        `SELECT barcode, image_url, description FROM ecommerce_products WHERE barcode = ANY($1::varchar[])`,
        [barcodes]
      );
      for (const row of dbRes.rows) {
        localMap[row.barcode] = row;
      }
    }

    // CSV headers
    const headers = [
      "Barcode",
      "SKU",
      "Name",
      "Category",
      "Brand",
      "MRP",
      "Selling Price",
      "Ecom Image URL / Base64",
      "Ecom Description"
    ];

    function escapeCsvValue(val) {
      if (val === null || val === undefined) return "";
      let str = String(val);
      str = str.replace(/"/g, '""');
      if (/[,\n\r"]/.test(str)) {
        return `"${str}"`;
      }
      return str;
    }

    const csvLines = [headers.join(",")];
    for (const p of allProducts) {
      const local = localMap[p.barcode] || {};
      const img = local.image_url || p.image_url || "";
      const desc = local.description || "";

      const row = [
        escapeCsvValue(p.barcode),
        escapeCsvValue(p.sku),
        escapeCsvValue(p.name),
        escapeCsvValue(p.category_name),
        escapeCsvValue(p.brand_name),
        escapeCsvValue(p.mrp),
        escapeCsvValue(p.selling_price),
        escapeCsvValue(img),
        escapeCsvValue(desc)
      ];
      csvLines.push(row.join(","));
    }

    const csvText = csvLines.join("\n");
    return new NextResponse(csvText, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="ecom_products_store_${storeId}.csv"`,
      },
    });
  } catch (err) {
    console.error("[Export Error]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
