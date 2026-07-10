"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  History,
  Home,
  MapPin,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import {
  cancelCustomerOrder,
  fetchCustomerOrders,
} from "@/lib/ecommerceApi";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const STATUS_LABELS = {
  pending_store_acceptance: "Awaiting store acceptance",
  accepted: "Accepted",
  picking: "Picking",
  packed: "Packed",
  billed: "Receipt generated",
  dispatched: "Out for delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const FULFILMENT_STEPS = [
  { label: "Placed", statuses: ["pending_store_acceptance"] },
  { label: "Accepted", statuses: ["accepted", "picking"] },
  { label: "Packed", statuses: ["packed", "billed"] },
  { label: "On the way", statuses: ["dispatched"] },
  { label: "Delivered", statuses: ["delivered"] },
];

const STATUS_STEP = {
  pending_store_acceptance: 0,
  accepted: 1,
  picking: 1,
  packed: 2,
  billed: 2,
  dispatched: 3,
  delivered: 4,
};

const CUSTOMER_CANCELLABLE_STATUSES = [
  "payment_pending",
  "pending_store_acceptance",
  "accepted",
  "picking",
  "packed",
];
const RECEIPT_READY_STATUSES = ["billed", "dispatched", "delivered"];

function paymentLabel(method) {
  if (method === "razorpay") return "Paid online";
  return method === "upi_on_delivery" ? "UPI on delivery" : "Cash on delivery";
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historyLabel(status) {
  return (
    {
      payment_pending: "Payment started",
      pending_store_acceptance: "Order placed",
      accepted: "Accepted by store",
      picking: "Picking started",
      packed: "Packed",
      billed: "Receipt generated",
      dispatched: "Out for delivery",
      delivered: "Delivered",
      rejected: "Rejected",
      cancelled: "Cancelled",
    }[status] ||
    STATUS_LABELS[status] ||
    status
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function receiptHtml(order) {
  const address = order.delivery_address || {};
  const billNumber = order.tbm_bill_number || order.order_number;
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.unit || "1 unit")}</small>
          </td>
          <td>${escapeHtml(item.sku || item.barcode || "-")}</td>
          <td>${Number(item.qty || 0)}</td>
          <td>${money(item.selling_price)}</td>
          <td>${money(
            item.line_total || Number(item.selling_price || 0) * Number(item.qty || 0),
          )}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>E-Receipt ${escapeHtml(billNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, sans-serif; }
      .receipt { width: min(760px, calc(100% - 32px)); margin: 24px auto; padding: 28px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; }
      header { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #b00000; padding-bottom: 18px; }
      h1 { margin: 0; color: #b00000; font-size: 26px; }
      p { margin: 4px 0; color: #475569; font-size: 13px; }
      .meta { text-align: right; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
      .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
      .box small, th { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
      .box b { display: block; margin-top: 5px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; font-size: 13px; vertical-align: top; }
      th:nth-child(3), th:nth-child(4), th:nth-child(5), td:nth-child(3), td:nth-child(4), td:nth-child(5) { text-align: right; }
      td small { display: block; margin-top: 3px; color: #64748b; }
      .totals { width: min(340px, 100%); margin-left: auto; margin-top: 18px; }
      .totals div { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
      .totals .grand { border-top: 1px solid #cbd5e1; color: #0f172a; font-size: 20px; font-weight: 800; }
      footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 14px; color: #64748b; font-size: 12px; }
      @media print { body { background: #fff; } .receipt { width: 100%; margin: 0; border: 0; border-radius: 0; } }
    </style>
  </head>
  <body>
    <main class="receipt">
      <header>
        <div>
          <h1>The Buyzaar Mart</h1>
          <p>E-receipt for your online order</p>
        </div>
        <div class="meta">
          <p><strong>Receipt:</strong> ${escapeHtml(billNumber)}</p>
          <p><strong>Order:</strong> ${escapeHtml(order.order_number)}</p>
          <p><strong>Date:</strong> ${escapeHtml(formatDateTime(order.delivered_at || order.created_at))}</p>
        </div>
      </header>
      <section class="grid">
        <div class="box">
          <small>Customer</small>
          <b>${escapeHtml(address.name || "Customer")}</b>
          <p>${escapeHtml(address.phone || "")}</p>
        </div>
        <div class="box">
          <small>Delivery address</small>
          <b>${escapeHtml(`${address.line || ""}, ${address.city || ""} - ${address.pincode || ""}`)}</b>
          <p>${escapeHtml(order.delivery_slot || "Standard delivery")}</p>
        </div>
        <div class="box">
          <small>Store</small>
          <b>${escapeHtml(order.store_name)}</b>
        </div>
        <div class="box">
          <small>Payment</small>
          <b>${escapeHtml(paymentLabel(order.payment_method))}</b>
        </div>
      </section>
      <table>
        <thead>
          <tr><th>Item</th><th>SKU</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <section class="totals">
        <div><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
        <div><span>Delivery charge</span><b>${money(order.delivery_fee)}</b></div>
        <div class="grand"><span>Total paid/payable</span><b>${money(order.grand_total)}</b></div>
      </section>
      <footer>
        Taxes are included in product prices where applicable. This is a system-generated e-receipt.
      </footer>
    </main>
  </body>
</html>`;
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    fetchCustomerOrders()
      .then((data) => setOrders(data.orders || []))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  async function cancelOrder(order) {
    if (
      !window.confirm(
        `Cancel order ${order.order_number}? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyId(order.id);
    setActionError("");
    try {
      await cancelCustomerOrder(order.id);
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id ? { ...item, status: "cancelled" } : item,
        ),
      );
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  function downloadReceipt(order) {
    const html = receiptHtml(order);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${order.tbm_bill_number || order.order_number}-e-receipt.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <AppHeader />
      <main className="route-page">
        <div className="route-title">
          <span>PURCHASE HISTORY</span>
          <h1>My orders</h1>
          <p>Track and review your recent orders.</p>
        </div>
        {loading ? (
          <div className="route-empty">
            <Clock3 />
            <h2>Loading orders...</h2>
          </div>
        ) : error ? (
          <div className="route-empty">
            <PackageCheck />
            <h2>Login to view your orders</h2>
            <p>{error}</p>
            <Link href="/account">Login with OTP</Link>
          </div>
        ) : orders.length === 0 ? (
          <div className="route-empty">
            <PackageCheck />
            <h2>No orders yet</h2>
            <p>Your orders will appear here after checkout.</p>
            <Link href="/">Start shopping</Link>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => {
              const currentStep = STATUS_STEP[order.status] ?? 0;
              const isTerminal = ["rejected", "cancelled"].includes(order.status);
              const isDelivered = order.status === "delivered";
              const statusHistory = Array.isArray(order.status_history)
                ? order.status_history
                : [];
              const deliveredEvent =
                statusHistory.find((item) => item.to_status === "delivered") ||
                null;
              const canCancel = CUSTOMER_CANCELLABLE_STATUSES.includes(
                order.status,
              );
              const hasReceipt =
                RECEIPT_READY_STATUSES.includes(order.status) ||
                Boolean(order.tbm_bill_number);
              const itemCount = order.items.reduce(
                (total, item) => total + Number(item.qty || 0),
                0,
              );

              return (
                <article
                  key={order.id}
                  className={`order-card-v2 status-${order.status}`}
                >
                  <header className="order-card-header">
                    <div className="order-identity">
                      <span className="order-identity-icon">
                        <PackageCheck />
                      </span>
                      <span>
                        <small>Order ID</small>
                        <b>{order.order_number}</b>
                      </span>
                    </div>
                    <div className="order-header-meta">
                      <span>
                        <CalendarDays />
                        <small>Placed</small>
                        <b>
                          {new Date(order.created_at).toLocaleDateString("en-IN")}
                        </b>
                      </span>
                      <span>
                        <ShoppingBag />
                        <small>Items</small>
                        <b>{itemCount}</b>
                      </span>
                      <span>
                        <small>Total</small>
                        <strong>{money(order.grand_total)}</strong>
                      </span>
                    </div>
                    <em className={`order-status status-${order.status}`}>
                      <CheckCircle2 />
                      {STATUS_LABELS[order.status] || order.status}
                    </em>
                  </header>

                  {isTerminal ? (
                    <div className="order-terminal-state">
                      <XCircle />
                      <span>
                        <b>{STATUS_LABELS[order.status]}</b>
                        {order.rejection_reason && (
                          <small>{order.rejection_reason}</small>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="order-progress" aria-label="Order progress">
                      {FULFILMENT_STEPS.map((step, index) => (
                        <div
                          key={step.label}
                          className={
                            index < currentStep
                              ? "complete"
                              : index === currentStep
                                ? "current"
                                : ""
                          }
                        >
                          <span>{index <= currentStep ? <Check /> : index + 1}</span>
                          <b>{step.label}</b>
                        </div>
                      ))}
                    </div>
                  )}

                  {isDelivered && (
                    <section className="order-delivered-panel">
                      <span>
                        <CheckCircle2 />
                      </span>
                      <div>
                        <small>DELIVERY COMPLETED</small>
                        <h2>Your order has been delivered</h2>
                        <p>
                          Delivered on{" "}
                          <b>
                            {formatDateTime(
                              deliveredEvent?.created_at || order.delivered_at,
                            ) || "today"}
                          </b>
                          . Thanks for shopping with The Buyzaar Mart.
                        </p>
                      </div>
                      <div className="delivered-actions">
                        {hasReceipt && (
                          <button
                            type="button"
                            onClick={() => downloadReceipt(order)}
                          >
                            <Download /> Download e-receipt
                          </button>
                        )}
                        <Link href="/">
                          <RotateCcw /> Reorder items
                        </Link>
                        <Link href="/">
                          <Home /> Continue shopping
                        </Link>
                      </div>
                    </section>
                  )}

                  <div className="order-card-content">
                    <section className="order-product-list">
                      <h2>Order items</h2>
                      {order.items.map((item) => (
                        <div className="order-product-row" key={item.id}>
                          <div className="order-product-media">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_url} alt="" />
                            ) : (
                              <ShoppingBag />
                            )}
                          </div>
                          <span>
                            <b>{item.name}</b>
                            <small>{item.unit || "1 unit"}</small>
                          </span>
                          <span className="order-product-qty">
                            Qty <b>{Number(item.qty)}</b>
                          </span>
                          <strong>
                            {money(
                              item.line_total ||
                                Number(item.selling_price) * Number(item.qty),
                            )}
                          </strong>
                        </div>
                      ))}
                    </section>

                    <aside className="order-delivery-info">
                      <h2>Delivery details</h2>
                      <div>
                        <MapPin />
                        <span>
                          <small>Deliver to</small>
                          <b>
                            {order.delivery_address?.line},{" "}
                            {order.delivery_address?.city} -{" "}
                            {order.delivery_address?.pincode}
                          </b>
                        </span>
                      </div>
                      <div>
                        <Store />
                        <span>
                          <small>Store</small>
                          <b>{order.store_name}</b>
                        </span>
                      </div>
                      <div>
                        <Truck />
                        <span>
                          <small>Delivery slot</small>
                          <b>{order.delivery_slot || "Standard delivery"}</b>
                        </span>
                      </div>
                      <div>
                        <CreditCard />
                        <span>
                          <small>Payment</small>
                          <b>{paymentLabel(order.payment_method)}</b>
                        </span>
                      </div>
                      {hasReceipt && (
                        <div className="order-receipt-block">
                          <FileText />
                          <span>
                            <small>E-receipt</small>
                            <b>
                              {order.tbm_bill_number ||
                                `Receipt for ${order.order_number}`}
                            </b>
                            <button
                              type="button"
                              onClick={() => downloadReceipt(order)}
                            >
                              <Download /> Download
                            </button>
                            {order.receipt_url && (
                              <a
                                href={order.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink /> View original
                              </a>
                            )}
                          </span>
                        </div>
                      )}
                      {statusHistory.length > 0 && (
                        <div className="order-history-block">
                          <History />
                          <span>
                            <small>Order history</small>
                            {statusHistory.map((item) => (
                              <b key={item.id}>
                                {historyLabel(item.to_status)}
                                <em>{formatDateTime(item.created_at)}</em>
                              </b>
                            ))}
                          </span>
                        </div>
                      )}
                    </aside>
                  </div>

                  <footer className="order-card-footer">
                    <span>
                      <small>Amount payable</small>
                      <strong>{money(order.grand_total)}</strong>
                    </span>
                    {canCancel && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => cancelOrder(order)}
                      >
                        <XCircle />
                        {busyId === order.id ? "Cancelling..." : "Cancel order"}
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
            {actionError && <p className="order-action-error">{actionError}</p>}
          </div>
        )}
      </main>
      <PageFooter />
    </>
  );
}
