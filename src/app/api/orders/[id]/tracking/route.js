import { NextResponse } from "next/server";
import { ensureEcommerceSchema, query } from "@/lib/db";
import { deliveryOtp, requireEcommerceUser } from "@/lib/ecommerceAuth";
import { distanceKm } from "@/lib/geo";

export async function GET(_request, context) {
  await ensureEcommerceSchema();
  const auth = await requireEcommerceUser();
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  const result = await query(
    `SELECT id, order_number, store_name, status, delivery_address,
            delivery_agent_name, delivery_agent_phone,
            rider_latitude, rider_longitude, rider_location_accuracy_m,
            rider_location_updated_at, picked_up_at, dispatched_at,
            delivered_at, created_at
     FROM ecommerce_orders
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [Number(id), auth.user.id],
  );
  const order = result.rows[0];
  if (!order) {
    return NextResponse.json(
      { success: false, message: "Order not found" },
      { status: 404 },
    );
  }
  const address = order.delivery_address || {};
  const remainingDistance = distanceKm(
    order.rider_latitude,
    order.rider_longitude,
    address.latitude,
    address.longitude,
  );
  return NextResponse.json({
    success: true,
    data: {
      order: {
        ...order,
        remaining_distance_km:
          remainingDistance == null
            ? null
            : Number(remainingDistance.toFixed(2)),
        delivery_otp: order.status === "dispatched" ? deliveryOtp(order.id) : null,
      },
    },
  });
}
