import { query } from "@/lib/db";

export const ORDER_TRANSITIONS = {
  payment_pending: ["pending_store_acceptance", "cancelled"],
  pending_store_acceptance: ["accepted", "rejected", "cancelled"],
  accepted: ["picking", "cancelled"],
  picking: ["packed", "cancelled"],
  packed: ["billed", "cancelled"],
  billed: ["dispatched", "cancelled"],
  dispatched: ["delivered"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function mapOrder(row) {
  return {
    ...row,
    subtotal: Number(row.subtotal || 0),
    delivery_fee: Number(row.delivery_fee || 0),
    discount_total: Number(row.discount_total || 0),
    tax_total: Number(row.tax_total || 0),
    grand_total: Number(row.grand_total || 0),
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function listOrders({
  storeId = null,
  status = "",
  orderId = null,
  limit = 100,
  includePaymentPending = false,
}) {
  const params = [];
  const where = [];
  if (storeId) {
    params.push(Number(storeId));
    where.push(`o.store_id = $${params.length}`);
  }
  if (status) {
    const statuses = String(status)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (statuses.length) {
      params.push(statuses);
      where.push(`o.status = ANY($${params.length}::varchar[])`);
    }
  }
  if (orderId) {
    params.push(Number(orderId));
    where.push(`o.id = $${params.length}`);
  }
  if (!includePaymentPending) {
    where.push(`o.status <> 'payment_pending'`);
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 250));
  const result = await query(
    `SELECT o.*, u.phone AS account_phone, u.name AS account_name,
       p.gateway_payment_id,
       p.payment_method_detail,
       p.status AS gateway_payment_status,
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
       ) AS status_history,
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
             'tax_rate', oi.tax_rate,
             'line_total', oi.line_total
           ) ORDER BY oi.id
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::jsonb
       ) AS items
     FROM ecommerce_orders o
     INNER JOIN ecommerce_users u ON u.id = o.user_id
     LEFT JOIN ecommerce_order_items oi ON oi.order_id = o.id
     LEFT JOIN ecommerce_payments p ON p.order_id = o.id AND p.provider = 'razorpay'
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY o.id, u.phone, u.name, p.gateway_payment_id, p.payment_method_detail, p.status
     ORDER BY
       CASE o.status
         WHEN 'pending_store_acceptance' THEN 0
         WHEN 'accepted' THEN 1
         WHEN 'picking' THEN 2
         WHEN 'packed' THEN 3
         ELSE 4
       END,
       o.created_at ASC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(mapOrder);
}

export async function getOrder(orderId) {
  const records = await listOrders({ orderId, limit: 1 });
  return records[0] || null;
}
