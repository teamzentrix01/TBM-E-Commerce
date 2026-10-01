import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, writeAdminAudit } from "@/lib/ecommerceAuth";

export async function PUT(request, { params }) {
  try {
    const resolvedParams = await params;
    const barcode = resolvedParams?.barcode;
    if (!barcode) {
      return NextResponse.json({ success: false, message: "Barcode is required" }, { status: 400 });
    }

    const storeId = Number(new URL(request.url).searchParams.get("store_id"));
    if (!storeId) {
      return NextResponse.json(
        { success: false, message: "Store ID is required" },
        { status: 400 },
      );
    }
    const admin = await requireAdmin(request, storeId);
    if (admin.error) {
      return NextResponse.json(
        { success: false, message: admin.error },
        { status: admin.status },
      );
    }

    const { image_url, description } = await request.json();
    const before = await query(
      `SELECT barcode, image_url, description
       FROM ecommerce_products
       WHERE barcode = $1`,
      [barcode],
    );

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
    await writeAdminAudit({
      request,
      actorUserId: admin.user.id,
      action: "catalog_product_update",
      storeId,
      barcode,
      beforeData: before.rows[0] || null,
      afterData: { barcode, image_url: image_url || null, description: description || null },
    });

    return NextResponse.json({ success: true, message: "Product details updated successfully" });
  } catch (err) {
    console.error("[Single Update Error]", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
