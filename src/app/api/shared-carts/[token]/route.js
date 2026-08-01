import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient, query } from "@/lib/db";
import { fetchTbmProduct } from "@/lib/tbmServer";
import {
  createShareToken,
  findSharedCartByInvite,
  hashShareToken,
  sharedCartPayload,
} from "@/lib/sharedCarts";

async function loadActiveCart(token) {
  const cart = await findSharedCartByInvite(token);
  if (!cart) return { error: "Shared cart not found", status: 404 };
  if (cart.status !== "active" || new Date(cart.expires_at) <= new Date()) {
    return { error: "This shared cart invite has expired", status: 410 };
  }
  return { cart };
}

export async function GET(_request, context) {
  const { token } = await context.params;
  const loaded = await loadActiveCart(token);
  if (loaded.error) {
    return NextResponse.json(
      { success: false, message: loaded.error },
      { status: loaded.status },
    );
  }
  return NextResponse.json({
    success: true,
    data: { cart: await sharedCartPayload(loaded.cart) },
  });
}

export async function POST(request, context) {
  const { token } = await context.params;
  const loaded = await loadActiveCart(token);
  if (loaded.error) {
    return NextResponse.json(
      { success: false, message: loaded.error },
      { status: loaded.status },
    );
  }
  const body = await request.json();
  const displayName = String(body.displayName || "").trim().slice(0, 80);
  if (displayName.length < 2) {
    return NextResponse.json(
      { success: false, message: "Enter your name to join the cart" },
      { status: 400 },
    );
  }
  const memberToken = createShareToken();
  await query(
    `INSERT INTO ecommerce_shared_cart_members
       (shared_cart_id, display_name, member_token_hash)
     VALUES ($1,$2,$3)`,
    [loaded.cart.id, displayName, hashShareToken(memberToken)],
  );
  return NextResponse.json({
    success: true,
    data: { memberToken, displayName },
  });
}

export async function PATCH(request, context) {
  let client;
  try {
    await ensureEcommerceSchema();
    const { token } = await context.params;
    const loaded = await loadActiveCart(token);
    if (loaded.error) {
      return NextResponse.json(
        { success: false, message: loaded.error },
        { status: loaded.status },
      );
    }
    const memberToken = request.headers.get("x-shared-member-token") || "";
    const memberResult = await query(
      `SELECT id, display_name
       FROM ecommerce_shared_cart_members
       WHERE shared_cart_id = $1 AND member_token_hash = $2
       LIMIT 1`,
      [loaded.cart.id, hashShareToken(memberToken)],
    );
    const member = memberResult.rows[0];
    if (!member) {
      return NextResponse.json(
        { success: false, message: "Join this shared cart before editing it" },
        { status: 401 },
      );
    }
    const body = await request.json();
    const productId = Number(body.productId);
    const delta = Math.max(-100, Math.min(100, Math.trunc(Number(body.delta))));
    if (!productId || !delta) {
      return NextResponse.json(
        { success: false, message: "Valid cart update required" },
        { status: 400 },
      );
    }
    const product = await fetchTbmProduct(productId, loaded.cart.store_id);
    const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
    client = await getClient();
    await client.query("BEGIN");
    const existingResult = await client.query(
      `SELECT qty FROM ecommerce_shared_cart_items
       WHERE shared_cart_id = $1 AND product_id = $2
       FOR UPDATE`,
      [loaded.cart.id, productId],
    );
    const currentQty = Number(existingResult.rows[0]?.qty || 0);
    const nextQty = Math.min(Math.max(currentQty + delta, 0), stock);
    if (nextQty <= 0) {
      await client.query(
        `DELETE FROM ecommerce_shared_cart_items
         WHERE shared_cart_id = $1 AND product_id = $2`,
        [loaded.cart.id, productId],
      );
    } else {
      await client.query(
        `INSERT INTO ecommerce_shared_cart_items
           (shared_cart_id, product_id, product_name, image_url, unit, mrp,
            selling_price, stock, qty, added_by_member_id, added_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (shared_cart_id, product_id) DO UPDATE
         SET product_name = EXCLUDED.product_name,
             image_url = EXCLUDED.image_url,
             unit = EXCLUDED.unit,
             mrp = EXCLUDED.mrp,
             selling_price = EXCLUDED.selling_price,
             stock = EXCLUDED.stock,
             qty = EXCLUDED.qty,
             added_by_member_id = EXCLUDED.added_by_member_id,
             added_by_name = EXCLUDED.added_by_name,
             updated_at = NOW()`,
        [
          loaded.cart.id,
          product.id,
          product.name,
          product.image_url || null,
          product.unit || "1 unit",
          Number(product.mrp || product.selling_price || 0),
          Number(product.selling_price || 0),
          stock,
          nextQty,
          member.id,
          member.display_name,
        ],
      );
    }
    await client.query(
      `UPDATE ecommerce_shared_cart_members
       SET last_seen_at = NOW() WHERE id = $1`,
      [member.id],
    );
    await client.query(
      `UPDATE ecommerce_shared_carts SET updated_at = NOW() WHERE id = $1`,
      [loaded.cart.id],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      data: { cart: await sharedCartPayload(loaded.cart) },
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[update shared cart]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to update shared cart" },
      { status: 409 },
    );
  } finally {
    client?.release();
  }
}
