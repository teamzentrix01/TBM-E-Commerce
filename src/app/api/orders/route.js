import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureEcommerceSchema, getClient, query } from "@/lib/db";
import {
  isValidPhone,
  normalizePhone,
  requireEcommerceUser,
} from "@/lib/ecommerceAuth";
import { moneyToPaise } from "@/lib/paymentStore";
import {
  createRazorpayOrder,
  createRazorpayRefund,
  getRazorpayKeyId,
} from "@/lib/razorpay";
import { fetchTbmProduct, resolveTbmStore } from "@/lib/tbmServer";

const DELIVERY_FEE = 39;
const FREE_DELIVERY_MINIMUM = 499;
const CUSTOMER_CANCELLABLE_STATUSES = [
  "payment_pending",
  "pending_store_acceptance",
  "accepted",
  "picking",
  "packed",
];

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WEB-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function receiptUrl(token) {
  const cleanToken = String(token || "").trim();
  const baseUrl = String(
    process.env.NEXT_PUBLIC_TBM_PUBLIC_BASE_URL ||
      process.env.SYNC_PUBLIC_API_BASE_URL ||
      "",
  )
    .trim()
    .replace(/\/+$/, "");
  return cleanToken && baseUrl ? `${baseUrl}/invoice/${cleanToken}` : "";
}

function mapOrder(row) {
  return {
    ...row,
    subtotal: Number(row.subtotal || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    discount_total: Number(row.discount_total || 0),
    tax_total: Number(row.tax_total || 0),
    grand_total: Number(row.grand_total || 0),
    items: Array.isArray(row.items) ? row.items : [],
    receipt_url: receiptUrl(row.tbm_invoice_token),
  };
}

export async function GET() {
  await ensureEcommerceSchema();
  const auth = await requireEcommerceUser();
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: 401 },
    );
  }
  const result = await query(
    `SELECT o.*,
       COALESCE(
         JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'id', oi.id,
             'product_id', oi.product_id,
             'name', oi.product_name,
             'barcode', oi.barcode,
             'sku', oi.sku,
             'image_url', oi.image_url,
             'unit', oi.unit,
             'qty', oi.qty,
             'mrp', oi.mrp,
             'selling_price', oi.selling_price,
             'line_total', oi.line_total
           ) ORDER BY oi.id
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::jsonb
       ) AS items
       ,
       COALESCE(
         (
           SELECT JSONB_AGG(
             JSONB_BUILD_OBJECT(
               'id', h.id,
               'from_status', h.from_status,
               'to_status', h.to_status,
               'actor_type', h.actor_type,
               'note', h.note,
               'metadata', h.metadata,
               'created_at', h.created_at
             ) ORDER BY h.created_at ASC, h.id ASC
           )
           FROM ecommerce_order_status_history h
           WHERE h.order_id = o.id
         ),
         '[]'::jsonb
       ) AS status_history
     FROM ecommerce_orders o
     LEFT JOIN ecommerce_order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [auth.user.id],
  );
  return NextResponse.json({
    success: true,
    data: { orders: result.rows.map(mapOrder) },
  });
}

export async function PATCH(request) {
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
    const orderId = Number(body.orderId);
    if (!orderId || body.action !== "cancel") {
      return NextResponse.json(
        { success: false, message: "Valid cancellation request is required" },
        { status: 400 },
      );
    }

    client = await getClient();
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT o.id, o.status, o.payment_method, o.payment_status, o.grand_total,
          o.order_number, p.id AS payment_id, p.gateway_payment_id
       FROM ecommerce_orders o
       LEFT JOIN ecommerce_payments p ON p.order_id = o.id AND p.provider = 'razorpay'
       WHERE o.id = $1 AND o.user_id = $2
       FOR UPDATE OF o`,
      [orderId, auth.user.id],
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message:
            "This order can no longer be cancelled online because billing or delivery has already started",
        },
        { status: 409 },
      );
    }

    let refund = null;
    if (
      order.payment_method === "razorpay" &&
      order.payment_status === "paid"
    ) {
      if (!order.gateway_payment_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { success: false, message: "Paid order is missing payment reference" },
          { status: 409 },
        );
      }
      refund = await createRazorpayRefund({
        paymentId: order.gateway_payment_id,
        amountPaise: moneyToPaise(order.grand_total),
        receipt: `${order.order_number}-refund`,
        idempotencyKey: `${order.order_number}-customer-cancel`,
        notes: { reason: "customer_cancelled", orderNumber: order.order_number },
      });
      await client.query(
        `UPDATE ecommerce_payments
         SET refund_id = $2,
             refund_status = $3,
             status = CASE WHEN status = 'captured' THEN 'refund_initiated' ELSE status END,
             provider_payload = provider_payload || $4::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          order.payment_id,
          refund.id,
          refund.status || "created",
          JSON.stringify({ refund }),
        ],
      );
    }

    await client.query(
      `UPDATE ecommerce_orders
       SET status = 'cancelled',
           payment_status = CASE
             WHEN payment_method = 'razorpay' AND payment_status = 'paid'
               THEN 'refund_pending'
             ELSE payment_status
           END,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [orderId],
    );
    await client.query(
      `UPDATE ecommerce_inventory_reservations
       SET status = 'released', released_at = NOW()
       WHERE order_id = $1 AND status = 'active'`,
      [orderId],
    );
    await client.query(
      `INSERT INTO ecommerce_order_status_history
         (order_id, from_status, to_status, actor_type, actor_id, note)
       VALUES ($1, $2, 'cancelled', 'customer', $3, 'Cancelled by customer')`,
      [orderId, order.status, String(auth.user.id)],
    );
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      data: { order: { id: orderId, status: "cancelled" } },
      message: "Order cancelled",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[cancel order]", error);
    return NextResponse.json(
      { success: false, message: "Unable to cancel order" },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}

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
    const items = Array.isArray(body.items) ? body.items : [];
    const address = body.address || {};
    const phone = normalizePhone(address.phone);
    const pincode = String(address.pincode || "").replace(/\D/g, "");
    const latitude = Number(address.latitude);
    const longitude = Number(address.longitude);
    const hasLatitude =
      address.latitude != null && String(address.latitude).trim() !== "";
    const hasLongitude =
      address.longitude != null && String(address.longitude).trim() !== "";
    const paymentMethod = ["cod", "upi_on_delivery", "razorpay"].includes(
      body.paymentMethod,
    )
      ? body.paymentMethod
      : "cod";
    const isOnlinePayment = paymentMethod === "razorpay";
    if (
      !storeId ||
      !items.length ||
      items.length > 50 ||
      !String(address.name || "").trim() ||
      !String(address.line || "").trim() ||
      !String(address.city || "").trim() ||
      !isValidPhone(phone) ||
      !/^\d{6}$/.test(pincode) ||
      !hasLatitude ||
      !hasLongitude ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { success: false, message: "Complete order and address details correctly" },
        { status: 400 },
      );
    }

    const normalizedRequestItems = items.map((item) => ({
      productId: Number(item.productId || item.id),
      qty: Math.floor(Number(item.qty)),
    }));
    if (
      normalizedRequestItems.some(
        (item) => !item.productId || item.qty <= 0 || item.qty > 100,
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid product quantity" },
        { status: 400 },
      );
    }

    const store = await resolveTbmStore(pincode, latitude, longitude);
    const deliveryDistanceKm = Number(store.delivery_distance_km);
    const deliveryRadiusKm = Math.min(
      Number(store.delivery_radius_km || 5),
      5,
    );
    if (
      Number.isFinite(deliveryDistanceKm) &&
      deliveryDistanceKm > deliveryRadiusKm
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Delivery address is outside the 5 km service area",
        },
        { status: 409 },
      );
    }
    if (Number(store.id) !== storeId) {
      return NextResponse.json(
        { success: false, message: "Address is not served by the selected store" },
        { status: 409 },
      );
    }

    const products = await Promise.all(
      normalizedRequestItems.map(async (item) => ({
        requested: item,
        product: await fetchTbmProduct(item.productId, storeId),
      })),
    );
    const productIds = products.map(({ product }) => Number(product.id));
    const reservations = await query(
      `SELECT product_id, COALESCE(SUM(qty), 0) AS reserved_qty
       FROM ecommerce_inventory_reservations
       WHERE store_id = $1
         AND product_id = ANY($2::bigint[])
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
       GROUP BY product_id`,
      [storeId, productIds],
    );
    const reservedByProduct = new Map(
      reservations.rows.map((row) => [
        Number(row.product_id),
        Number(row.reserved_qty),
      ]),
    );

    let subtotal = 0;
    let taxTotal = 0;
    const verifiedItems = products.map(({ requested, product }) => {
      const available =
        Number(product.stock || 0) -
        Number(reservedByProduct.get(Number(product.id)) || 0);
      if (available < requested.qty) {
        throw new Error(
          `${product.name} has only ${Math.max(0, available)} available`,
        );
      }
      const sellingPrice = Number(product.selling_price || product.price || 0);
      const lineTotal = sellingPrice * requested.qty;
      subtotal += lineTotal;
      taxTotal += product.tax_rate
        ? lineTotal - lineTotal / (1 + Number(product.tax_rate) / 100)
        : 0;
      return {
        product,
        qty: requested.qty,
        sellingPrice,
        lineTotal,
      };
    });
    const deliveryFee =
      subtotal >= FREE_DELIVERY_MINIMUM || subtotal === 0 ? 0 : DELIVERY_FEE;
    const grandTotal = subtotal + deliveryFee;
    const idempotencyKey = String(
      request.headers.get("idempotency-key") || body.idempotencyKey || "",
    )
      .trim()
      .slice(0, 120);

    client = await getClient();
    await client.query("BEGIN");
    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT * FROM ecommerce_orders
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [auth.user.id, idempotencyKey],
      );
      if (existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({
          success: true,
          data: { order: mapOrder(existing.rows[0]) },
        });
      }
    }

    const generatedOrderNumber = orderNumber();
    let gatewayOrder = null;
    if (isOnlinePayment) {
      gatewayOrder = await createRazorpayOrder({
        amountPaise: moneyToPaise(grandTotal),
        receipt: generatedOrderNumber,
        notes: {
          ecommerceOrderNumber: generatedOrderNumber,
          storeId: String(storeId),
          userId: String(auth.user.id),
        },
      });
    }

    const orderResult = await client.query(
      `INSERT INTO ecommerce_orders (
         order_number, user_id, store_id, store_name, payment_method,
         payment_status, payment_reference, status, subtotal, delivery_fee, tax_total, grand_total,
         delivery_slot, delivery_address, customer_note, idempotency_key
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12,
         $13, $14::jsonb, $15, NULLIF($16, '')
       ) RETURNING *`,
      [
        generatedOrderNumber,
        auth.user.id,
        storeId,
        store.name,
        paymentMethod,
        isOnlinePayment ? "pending" : "pending",
        gatewayOrder?.id || null,
        isOnlinePayment ? "payment_pending" : "pending_store_acceptance",
        subtotal,
        deliveryFee,
        taxTotal,
        grandTotal,
        String(body.deliverySlot || "").slice(0, 160),
        JSON.stringify({
          name: String(address.name).trim(),
          phone,
          line: String(address.line).trim(),
          line2: String(address.line2 || "").trim(),
          landmark: String(address.landmark || "").trim(),
          city: String(address.city).trim(),
          state: String(address.state || store.state || "").trim(),
          pincode,
          latitude,
          longitude,
          location_accuracy_m:
            Number(address.locationAccuracyM || address.location_accuracy_m) || null,
          delivery_distance_km: Number.isFinite(deliveryDistanceKm)
            ? deliveryDistanceKm
            : null,
          delivery_radius_km: deliveryRadiusKm,
        }),
        String(body.note || "").trim().slice(0, 1000),
        idempotencyKey,
      ],
    );
    const order = orderResult.rows[0];

    if (isOnlinePayment) {
      await client.query(
        `INSERT INTO ecommerce_payments (
           order_id, provider, gateway_order_id, status, amount, currency, provider_payload
         ) VALUES ($1, 'razorpay', $2, 'created', $3, 'INR', $4::jsonb)`,
        [
          order.id,
          gatewayOrder.id,
          grandTotal,
          JSON.stringify(gatewayOrder),
        ],
      );
    }

    for (const item of verifiedItems) {
      await client.query(
        `INSERT INTO ecommerce_order_items (
           order_id, product_id, product_name, barcode, sku, image_url, unit,
           qty, mrp, selling_price, tax_rate, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          order.id,
          item.product.id,
          item.product.name,
          item.product.barcode || null,
          item.product.sku || null,
          item.product.image_url || null,
          item.product.unit || "PCS",
          item.qty,
          Number(item.product.mrp || item.sellingPrice),
          item.sellingPrice,
          Number(item.product.tax_rate || 0),
          item.lineTotal,
        ],
      );
      await client.query(
        `INSERT INTO ecommerce_inventory_reservations
           (order_id, store_id, product_id, qty, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)`,
        [
          order.id,
          storeId,
          item.product.id,
          item.qty,
          isOnlinePayment ? "15" : "120",
        ],
      );
    }
    await client.query(
      `INSERT INTO ecommerce_order_status_history
         (order_id, to_status, actor_type, actor_id, note)
       VALUES ($1, $2, 'customer', $3, $4)`,
      [
        order.id,
        order.status,
        String(auth.user.id),
        isOnlinePayment ? "Online payment initiated" : "Order placed",
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      {
        success: true,
        data: {
          order: mapOrder(order),
          payment: isOnlinePayment
            ? {
                provider: "razorpay",
                keyId: getRazorpayKeyId(),
                orderId: gatewayOrder.id,
                amount: Number(gatewayOrder.amount),
                currency: gatewayOrder.currency || "INR",
                name: "The Buyzaar Mart",
                description: `Order ${generatedOrderNumber}`,
              }
            : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[create order]", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to place order" },
      { status: 409 },
    );
  } finally {
    client?.release();
  }
}
