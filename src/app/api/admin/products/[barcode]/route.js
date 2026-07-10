import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PUT(request, { params }) {
  try {
    const resolvedParams = await params;
    const barcode = resolvedParams?.barcode;
    if (!barcode) {
      return NextResponse.json({ success: false, message: "Barcode is required" }, { status: 400 });
    }

    const { image_url, description } = await request.json();

    await query(
      `INSERT INTO ecommerce_products (barcode, image_url, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (barcode)
       DO UPDATE SET
         image_url = EXCLUDED.image_url,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [barcode, image_url || null, description || null]
    );

    return NextResponse.json({ success: true, message: "Product details updated successfully" });
  } catch (err) {
    console.error("[Single Update Error]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
