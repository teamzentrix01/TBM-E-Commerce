import { NextResponse } from "next/server";
import { ensureEcommerceSchema, query } from "@/lib/db";
import { requireEcommerceUser } from "@/lib/ecommerceAuth";

export async function GET() {
  await ensureEcommerceSchema();
  const auth = await requireEcommerceUser();
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: 401 }
    );
  }

  try {
    const result = await query(
      `SELECT id, receiver_name as name, receiver_phone as phone, address_line1 as line,
              city, pincode, latitude, longitude, location_accuracy_m
       FROM ecommerce_addresses
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [auth.user.id]
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("[GET Addresses Error]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch addresses" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  await ensureEcommerceSchema();
  const auth = await requireEcommerceUser();
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { name, phone, line, city, pincode } = body;
    const hasLatitude =
      body.latitude != null && String(body.latitude).trim() !== "";
    const hasLongitude =
      body.longitude != null && String(body.longitude).trim() !== "";
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.locationAccuracyM || body.location_accuracy_m || 0);
    const hasCoordinates = hasLatitude || hasLongitude;

    if (
      !name ||
      !phone ||
      !line ||
      !city ||
      !pincode ||
      (hasCoordinates &&
        (!hasLatitude ||
          !hasLongitude ||
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180))
    ) {
      return NextResponse.json(
        { success: false, message: "Complete the address and verify its location" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO ecommerce_addresses (
         user_id, receiver_name, receiver_phone, address_line1, city, pincode,
         latitude, longitude, location_accuracy_m
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, receiver_name as name, receiver_phone as phone, address_line1 as line,
                 city, pincode, latitude, longitude, location_accuracy_m`,
      [
        auth.user.id,
        name,
        phone,
        line,
        city,
        pincode,
        hasCoordinates ? latitude : null,
        hasCoordinates ? longitude : null,
        hasCoordinates ? accuracy || null : null,
      ]
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("[POST Address Error]", error);
    return NextResponse.json(
      { success: false, message: "Failed to save address" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const auth = await requireEcommerceUser();
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Address ID is required" },
        { status: 400 }
      );
    }

    await query(
      `DELETE FROM ecommerce_addresses
       WHERE id = $1 AND user_id = $2`,
      [id, auth.user.id]
    );

    return NextResponse.json({ success: true, message: "Address deleted" });
  } catch (error) {
    console.error("[DELETE Address Error]", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete address" },
      { status: 500 }
    );
  }
}
