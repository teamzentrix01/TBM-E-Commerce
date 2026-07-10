import { NextResponse } from "next/server";
import { ensureEcommerceSchema, query } from "@/lib/db";
import {
  createOtp,
  deliverOtp,
  hashOtp,
  isValidPhone,
  normalizePhone,
  requestMeta,
} from "@/lib/ecommerceAuth";

export async function POST(request) {
  try {
    await ensureEcommerceSchema();
    const body = await request.json();
    const phone = normalizePhone(body.phone);
    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid 10 digit mobile number" },
        { status: 400 },
      );
    }

    const recent = await query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS hourly,
         MAX(created_at) AS last_sent
       FROM ecommerce_otp_challenges
       WHERE phone = $1`,
      [phone],
    );
    const hourly = Number(recent.rows[0]?.hourly || 0);
    const lastSent = recent.rows[0]?.last_sent
      ? new Date(recent.rows[0].last_sent).getTime()
      : 0;
    if (hourly >= 5 || Date.now() - lastSent < 30_000) {
      return NextResponse.json(
        { success: false, message: "Please wait before requesting another OTP" },
        { status: 429 },
      );
    }

    const otp = createOtp();
    const meta = requestMeta(request);
    await query(
      `INSERT INTO ecommerce_otp_challenges
         (phone, code_hash, request_ip, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [phone, hashOtp(phone, otp), meta.ip],
    );
    const delivery = await deliverOtp(phone, otp);
    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      expiresIn: 300,
      ...(delivery.provider === "development" &&
      process.env.OTP_EXPOSE_CODE === "true"
        ? { developmentOtp: otp }
        : {}),
    });
  } catch (error) {
    console.error("[send otp]", error);
    return NextResponse.json(
      { success: false, message: "Unable to send OTP" },
      { status: 500 },
    );
  }
}
