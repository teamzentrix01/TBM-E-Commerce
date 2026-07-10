import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient } from "@/lib/db";
import {
  createSession,
  hashOtp,
  isValidPhone,
  normalizePhone,
  secureEqual,
  setSessionCookie,
} from "@/lib/ecommerceAuth";

export async function POST(request) {
  let client;
  try {
    await ensureEcommerceSchema();
    const body = await request.json();
    const phone = normalizePhone(body.phone);
    const otp = String(body.otp || "").replace(/\D/g, "");
    if (!isValidPhone(phone) || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, message: "Invalid phone number or OTP" },
        { status: 400 },
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    const challengeResult = await client.query(
      `SELECT id, code_hash, attempt_count
       FROM ecommerce_otp_challenges
       WHERE phone = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [phone],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.attempt_count >= 5) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "OTP has expired. Request a new OTP" },
        { status: 400 },
      );
    }

    if (!secureEqual(challenge.code_hash, hashOtp(phone, otp))) {
      await client.query(
        `UPDATE ecommerce_otp_challenges
         SET attempt_count = attempt_count + 1
         WHERE id = $1`,
        [challenge.id],
      );
      await client.query("COMMIT");
      return NextResponse.json(
        { success: false, message: "Incorrect OTP" },
        { status: 400 },
      );
    }

    await client.query(
      `UPDATE ecommerce_otp_challenges SET consumed_at = NOW() WHERE id = $1`,
      [challenge.id],
    );
    const userResult = await client.query(
      `INSERT INTO ecommerce_users (phone, phone_verified_at)
       VALUES ($1, NOW())
       ON CONFLICT (phone) DO UPDATE
       SET phone_verified_at = NOW(), is_active = TRUE, updated_at = NOW()
       RETURNING id, phone, name, email, phone_verified_at`,
      [phone],
    );
    await client.query("COMMIT");

    const user = userResult.rows[0];
    const session = await createSession(user.id, request);
    const response = NextResponse.json({
      success: true,
      data: { user },
      message: "Login successful",
    });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[verify otp]", error);
    return NextResponse.json(
      { success: false, message: "Unable to verify OTP" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
