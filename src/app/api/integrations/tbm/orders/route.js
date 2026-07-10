import { NextResponse } from "next/server";
import { ensureEcommerceSchema } from "@/lib/db";
import { verifyIntegrationKey } from "@/lib/ecommerceAuth";
import { listOrders } from "@/lib/ecommerceOrders";

export async function GET(request) {
  if (!verifyIntegrationKey(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid integration credentials" },
      { status: 401 },
    );
  }
  await ensureEcommerceSchema();
  const { searchParams } = new URL(request.url);
  const storeId = Number(searchParams.get("store_id")) || null;
  const status = searchParams.get("status") || "";
  const orders = await listOrders({ storeId, status });
  return NextResponse.json({ success: true, data: { orders } });
}
