import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";

// Helper to parse RFC-4180 CSV
function parseCsv(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push("");
    } else if ((c === "\r" || c === "\n") && !inQuotes) {
      if (c === "\r" && next === "\n") {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

function processCsvText(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];

  // Parse headers and normalize them
  const headers = rows[0].map((h) => String(h).trim().toLowerCase());
  const barcodeIdx = headers.indexOf("barcode");

  // Find index of image column
  let imageIdx = headers.findIndex(
    (h) => h.includes("image") || h.includes("img") || h.includes("ecom image url")
  );
  if (imageIdx === -1) {
    imageIdx = headers.findIndex((h) => h.includes("image_url") || h.includes("url"));
  }

  // Find index of description column
  let descIdx = headers.findIndex(
    (h) => h.includes("description") || h.includes("desc") || h.includes("ecom description")
  );

  if (barcodeIdx === -1) {
    throw new Error("CSV must contain a 'Barcode' column");
  }

  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip empty lines
    if (row.length <= barcodeIdx) continue;
    const barcode = String(row[barcodeIdx] || "").trim();
    if (!barcode) continue;

    list.push({
      barcode,
      image_url: imageIdx !== -1 && imageIdx < row.length ? String(row[imageIdx] || "").trim() : "",
      description: descIdx !== -1 && descIdx < row.length ? String(row[descIdx] || "").trim() : "",
    });
  }
  return list;
}

export async function POST(request) {
  let client;
  try {
    const contentType = request.headers.get("content-type") || "";
    let records = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body.records) {
        records = body.records;
      } else if (body.csvText) {
        records = processCsvText(body.csvText);
      }
    } else {
      // Plain text CSV body
      const csvText = await request.text();
      records = processCsvText(csvText);
    }

    if (!records.length) {
      return NextResponse.json(
        { success: false, message: "No records found in CSV payload" },
        { status: 400 }
      );
    }

    // Upsert database records
    client = await getClient();
    await client.query("BEGIN");

    let updatedCount = 0;
    for (const record of records) {
      const { barcode, image_url, description } = record;
      if (!barcode) continue;

      await client.query(
        `INSERT INTO ecommerce_products (barcode, image_url, description, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (barcode)
         DO UPDATE SET
           image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), ecommerce_products.image_url),
           description = COALESCE(NULLIF(EXCLUDED.description, ''), ecommerce_products.description),
           updated_at = NOW()`,
        [barcode, image_url || null, description || null]
      );
      updatedCount++;
    }

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      message: `Successfully imported ${updatedCount} products`,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[Import Error]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
