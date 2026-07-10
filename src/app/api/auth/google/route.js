import { NextResponse } from "next/server";
import { ensureEcommerceSchema, query } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/ecommerceAuth";

export async function POST(request) {
  try {
    await ensureEcommerceSchema();
    const body = await request.json();
    const { credential } = body;

    if (!credential) {
      return NextResponse.json(
        { success: false, message: "Google credential is required" },
        { status: 400 }
      );
    }

    // Verify token with Google API
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        credential
      )}`,
      { cache: "no-store" }
    );

    if (!googleRes.ok) {
      return NextResponse.json(
        { success: false, message: "Invalid Google credential" },
        { status: 400 }
      );
    }

    const payload = await googleRes.json();
    const googleId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    const name = payload.name?.trim() || "";
    const picture = payload.picture || null;

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email not provided by Google account" },
        { status: 400 }
      );
    }

    // Check if user exists by google_id or email
    let userResult = await query(
      `SELECT id, phone, name, email, phone_verified_at, image_url, google_id
       FROM ecommerce_users
       WHERE google_id = $1 OR email = $2
       LIMIT 1`,
      [googleId, email]
    );

    let user;
    if (userResult.rows.length > 0) {
      const existingUser = userResult.rows[0];
      // Update existing user with Google details
      const updateResult = await query(
        `UPDATE ecommerce_users
         SET google_id = COALESCE(google_id, $1),
             name = COALESCE(name, $2),
             image_url = COALESCE(image_url, $3),
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, phone, name, email, phone_verified_at, image_url`,
        [googleId, name, picture, existingUser.id]
      );
      user = updateResult.rows[0];
    } else {
      // Create new user
      const insertResult = await query(
        `INSERT INTO ecommerce_users (google_id, email, name, image_url)
         VALUES ($1, $2, $3, $4)
         RETURNING id, phone, name, email, phone_verified_at, image_url`,
         [googleId, email, name, picture]
      );
      user = insertResult.rows[0];
    }

    const session = await createSession(user.id, request);
    const response = NextResponse.json({
      success: true,
      data: { user },
      message: "Login successful",
    });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    console.error("[Google Login Error]", error);
    return NextResponse.json(
      { success: false, message: "Google login failed" },
      { status: 500 }
    );
  }
}
