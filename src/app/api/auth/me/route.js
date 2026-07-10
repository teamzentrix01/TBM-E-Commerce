import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  clearSessionCookie,
  getCurrentUser,
  isValidPhone,
  normalizePhone,
  requireEcommerceUser,
  revokeCurrentSession,
} from "@/lib/ecommerceAuth";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    user
      ? { success: true, data: { user } }
      : { success: false, message: "Authentication required" },
    { status: user ? 200 : 401 },
  );
}

export async function PATCH(request) {
  const auth = await requireEcommerceUser();
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: 401 },
    );
  }
  const body = await request.json();
  const name = String(body.name || "").trim().slice(0, 160);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 255);
  const phone = normalizePhone(body.phone);
  if (!name) {
    return NextResponse.json(
      { success: false, message: "Name is required" },
      { status: 400 },
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address" },
      { status: 400 },
    );
  }
  if (phone && !isValidPhone(phone)) {
    return NextResponse.json(
      { success: false, message: "Enter a valid 10 digit mobile number" },
      { status: 400 },
    );
  }
  try {
    const result = await query(
      `UPDATE ecommerce_users
       SET name = $1,
           email = NULLIF($2, ''),
           phone = NULLIF($3, ''),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, phone, name, email, phone_verified_at, image_url`,
      [name, email, phone, auth.user.id],
    );
    return NextResponse.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { success: false, message: "This mobile number or email is already linked to another account" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE() {
  await revokeCurrentSession().catch(() => {});
  const response = NextResponse.json({
    success: true,
    message: "Logged out",
  });
  clearSessionCookie(response);
  return response;
}
