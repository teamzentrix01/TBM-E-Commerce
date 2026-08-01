import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient } from "@/lib/db";
import { requireEcommerceUser } from "@/lib/ecommerceAuth";
import { fetchTbmProduct, resolveTbmStore } from "@/lib/tbmServer";
import {
  createShareToken,
  hashShareToken,
  sharedCartPayload,
} from "@/lib/sharedCarts";

export async function POST(request) {
  let client;
  try {
    await ensureEcommerceSchema();
    const auth = await requireEcommerceUser();
    if (auth.error) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: 401 },
      );
    }
    const body = await request.json();
    const storeId = Number(body.storeId);
    const pincode = String(body.pincode || "").replace(/\D/g, "").slice(0, 6);
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!storeId || pincode.length !== 6 || !requestedItems.length) {
      return NextResponse.json(
        { success: false, message: "A verified cart and delivery area are required" },
        { status: 400 },
      );
    }
    const store = await resolveTbmStore(pincode);
    if (Number(store.id) !== storeId) {
      return NextResponse.json(
        { success: false, message: "Cart store no longer serves this delivery area" },
        { status: 409 },
      );
    }
    const verifiedItems = await Promise.all(
      requestedItems.slice(0, 50).map(async (item) => {
        const product = await fetchTbmProduct(Number(item.id || item.productId), storeId);
        const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
        const qty = Math.min(Math.max(1, Math.floor(Number(item.qty || 1))), stock);
        if (!qty) throw new Error(`${product.name} is unavailable`);
        return { product, qty };
      }),
    );
    const inviteToken = createShareToken();
    const ownerMemberToken = createShareToken();
    const publicId = createShareToken(12);
    client = await getClient();
    await client.query("BEGIN");
    await client.query(
      `UPDATE ecommerce_shared_carts
       SET status = 'expired', updated_at = NOW()
       WHERE owner_user_id = $1 AND status = 'active'`,
      [auth.user.id],
    );
    const cartResult = await client.query(
      `INSERT INTO ecommerce_shared_carts
         (public_id, invite_token_hash, owner_user_id, store_id, store_name,
          area_label, pincode, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL '6 hours')
       RETURNING *`,
      [
        publicId,
        hashShareToken(inviteToken),
        auth.user.id,
        storeId,
        store.name,
        String(body.areaLabel || `${store.city || ""} ${pincode}`).trim(),
        pincode,
      ],
    );
    const cart = { ...cartResult.rows[0], owner_name: auth.user.name };
    const ownerResult = await client.query(
      `INSERT INTO ecommerce_shared_cart_members
         (shared_cart_id, user_id, display_name, member_token_hash, is_owner)
       VALUES ($1,$2,$3,$4,TRUE)
       RETURNING id`,
      [
        cart.id,
        auth.user.id,
        auth.user.name || "Cart owner",
        hashShareToken(ownerMemberToken),
      ],
    );
    for (const { product, qty } of verifiedItems) {
      await client.query(
        `INSERT INTO ecommerce_shared_cart_items
           (shared_cart_id, product_id, product_name, image_url, unit, mrp,
            selling_price, stock, qty, added_by_member_id, added_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          cart.id,
          product.id,
          product.name,
          product.image_url || null,
          product.unit || "1 unit",
          Number(product.mrp || product.selling_price || 0),
          Number(product.selling_price || 0),
          Number(product.stock || 0),
          qty,
          ownerResult.rows[0].id,
          auth.user.name || "Cart owner",
        ],
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      data: {
        inviteToken,
        memberToken: ownerMemberToken,
        cart: await sharedCartPayload(cart),
      },
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[create shared cart]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to create shared cart" },
      { status: 409 },
    );
  } finally {
    client?.release();
  }
}
