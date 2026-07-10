import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { ensureEcommerceSchema, query } from "@/lib/db";

export const SESSION_COOKIE = "tbm_ecom_session";
const SESSION_DAYS = 30;

function authSecret() {
  const value = process.env.ECOM_AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error("ECOM_AUTH_SECRET must be at least 32 characters");
  }
  return value || "local-ecommerce-auth-secret-change-me";
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

export function isValidPhone(value) {
  return /^[6-9]\d{9}$/.test(normalizePhone(value));
}

export function createOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(phone, otp) {
  return createHmac("sha256", authSecret())
    .update(`${normalizePhone(phone)}:${otp}`)
    .digest("hex");
}

export function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function requestMeta(request) {
  return {
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown",
    userAgent: request.headers.get("user-agent") || "",
  };
}

export async function createSession(userId, request) {
  await ensureEcommerceSchema();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  const meta = requestMeta(request);
  await query(
    `INSERT INTO ecommerce_sessions
       (user_id, token_hash, expires_at, user_agent, request_ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, meta.userAgent, meta.ip],
  );
  return { token, expiresAt };
}

export function setSessionCookie(response, session) {
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function getCurrentUser() {
  await ensureEcommerceSchema();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await query(
    `SELECT u.id, u.phone, u.name, u.email, u.phone_verified_at, u.image_url
     FROM ecommerce_sessions s
     INNER JOIN ecommerce_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = TRUE
     LIMIT 1`,
    [hashSessionToken(token)],
  );
  return result.rows[0] || null;
}

export async function requireEcommerceUser() {
  const user = await getCurrentUser();
  return user
    ? { user, error: null }
    : { user: null, error: "Authentication required" };
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await query(
    `UPDATE ecommerce_sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashSessionToken(token)],
  );
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function deliverOtp(phone, otp) {
  const endpoint = process.env.OTP_DELIVERY_URL || "";
  if (!endpoint) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OTP delivery provider is not configured");
    }
    console.info(`[Ecom OTP] ${phone}: ${otp}`);
    return { provider: "development" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.OTP_DELIVERY_TOKEN
        ? { authorization: `Bearer ${process.env.OTP_DELIVERY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ phone: `91${phone}`, otp, purpose: "login" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("OTP provider rejected the request");
  return { provider: "configured" };
}

export function verifyIntegrationKey(request) {
  const expected = process.env.TBM_INTEGRATION_KEY || "";
  const received = request.headers.get("x-tbm-integration-key") || "";
  return expected.length >= 24 && secureEqual(expected, received);
}
