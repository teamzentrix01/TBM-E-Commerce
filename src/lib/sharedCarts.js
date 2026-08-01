import { createHash, randomBytes } from "node:crypto";
import { ensureEcommerceSchema, query } from "@/lib/db";

export function createShareToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashShareToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export async function findSharedCartByInvite(token) {
  await ensureEcommerceSchema();
  const result = await query(
    `SELECT c.*, u.name AS owner_name
     FROM ecommerce_shared_carts c
     INNER JOIN ecommerce_users u ON u.id = c.owner_user_id
     WHERE c.invite_token_hash = $1
     LIMIT 1`,
    [hashShareToken(token)],
  );
  return result.rows[0] || null;
}

export async function sharedCartPayload(cart) {
  const [itemsResult, membersResult] = await Promise.all([
    query(
      `SELECT id, product_id, product_name, image_url, unit, mrp,
              selling_price, stock, qty, added_by_name, updated_at
       FROM ecommerce_shared_cart_items
       WHERE shared_cart_id = $1
       ORDER BY created_at ASC`,
      [cart.id],
    ),
    query(
      `SELECT display_name, is_owner, joined_at
       FROM ecommerce_shared_cart_members
       WHERE shared_cart_id = $1
       ORDER BY is_owner DESC, joined_at ASC`,
      [cart.id],
    ),
  ]);
  return {
    id: cart.public_id,
    ownerName: cart.owner_name || "Cart owner",
    storeId: Number(cart.store_id),
    areaLabel: cart.area_label || cart.pincode || "Delivery area",
    pincode: cart.pincode || "",
    status: cart.status,
    expiresAt: cart.expires_at,
    items: itemsResult.rows.map((item) => ({
      ...item,
      id: Number(item.product_id),
      mrp: Number(item.mrp || 0),
      selling_price: Number(item.selling_price || 0),
      stock: Number(item.stock || 0),
      qty: Number(item.qty || 0),
      name: item.product_name,
    })),
    members: membersResult.rows,
  };
}
