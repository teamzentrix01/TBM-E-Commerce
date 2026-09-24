"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  History,
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
import { useStore } from "@/context/StoreContext";
import { accountLoginHref, rememberLoginReturn } from "@/lib/authNav.mjs";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const STATUS_LABELS = {
  payment_pending: "Payment pending",
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

function OrderItemImage({ item, className = "" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`customer-order-image ${className}`.trim()}>
      {item.image_url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.name || "Order item"}
          onError={() => setFailed(true)}
        />
      ) : (
        <ShoppingBag />
      )}
    </span>
  );
}

export default function Orders() {
  const { authReady, customer } = useStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => {
    if (!authReady) return;
    if (!customer) {
      setNeedsLogin(true);
      setOrders([]);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setNeedsLogin(false);
    setLoading(true);
    setError("");
    fetchCustomerOrders()
      .then((data) => {
        if (cancelled) return;
        const nextOrders = data.orders || [];
        setOrders(nextOrders);
        if (
          nextOrders.length > 0 &&
          !nextOrders.some(
            (order) =>
              !["delivered", "rejected", "cancelled"].includes(order.status),
          )
        ) {
          setActiveTab("past");
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, customer]);

  function toggleDetails(orderId) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

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

  function viewReceipt(order) {
    const html = receiptHtml(order);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const activeOrders = orders.filter(
    (order) => !["delivered", "rejected", "cancelled"].includes(order.status),
  );
  const pastOrders = orders.filter((order) =>
    ["delivered", "rejected", "cancelled"].includes(order.status),
  );
  const visibleOrders = activeTab === "active" ? activeOrders : pastOrders;

  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-orders-page">
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">YOUR ORDERS</span>
            <h1>My orders</h1>
            <p className="bz-muted">
              Track active deliveries and find previous purchases.
            </p>
          </div>
          {!loading && !error && orders.length > 0 && (
            <div className="bz-order-tabs" role="tablist" aria-label="Order type">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "active"}
                className={activeTab === "active" ? "is-active" : ""}
                onClick={() => setActiveTab("active")}
              >
                Active <span>{activeOrders.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "past"}
                className={activeTab === "past" ? "is-active" : ""}
                onClick={() => setActiveTab("past")}
              >
                Past orders <span>{pastOrders.length}</span>
              </button>
            </div>
          )}
        </div>
        {loading || !authReady ? (
          <div className="bz-empty">
            <Clock3 size={42} />
            <h2>Loading orders…</h2>
          </div>
        ) : needsLogin ? (
          <div className="bz-empty">
            <PackageCheck size={42} />
            <h2>Login to view your orders</h2>
            <p>
              Track deliveries, download receipts and manage past purchases after
              you sign in.
            </p>
            <Link
              className="bz-button"
              href={accountLoginHref("/orders")}
              onClick={() => rememberLoginReturn("/orders")}
            >
              Login with OTP
            </Link>
          </div>
        ) : error ? (
          <div className="bz-empty">
            <PackageCheck size={42} />
            <h2>Unable to load orders</h2>
            <p>{error}</p>
            <Link className="bz-button" href={accountLoginHref("/orders")}>
              Login again
            </Link>
          </div>
        ) : orders.length === 0 ? (
          <div className="bz-empty">
            <PackageCheck size={42} />
            <h2>No orders yet</h2>
            <p>Your orders will appear here after checkout.</p>
            <Link className="bz-button" href="/products">
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="customer-orders-shell bz-orders-shell">
            {actionError && (
              <p className="bz-notice bz-error" role="alert">
                {actionError}
              </p>
            )}
            {visibleOrders.length === 0 ? (
              <div className="bz-empty">
                <PackageCheck size={42} />
                <h2>
                  {activeTab === "active"
                    ? "No active orders"
                    : "No past orders yet"}
                </h2>
                <p>
                  {activeTab === "active"
                    ? "Your next order will appear here with live status updates."
                    : "Completed and cancelled orders will appear here."}
                </p>
                {activeTab === "active" && (
                  <Link className="bz-button" href="/products">
                    Start shopping
                  </Link>
                )}
              </div>
            ) : (
              <div className="customer-orders-list">
                {visibleOrders.map((order) => {
              const orderItems = Array.isArray(order.items) ? order.items : [];
              const currentStep = STATUS_STEP[order.status] ?? 0;
              const isTerminal = ["rejected", "cancelled"].includes(order.status);
              const isDelivered = order.status === "delivered";
              const isExpanded = expandedIds.has(order.id);
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
              const itemCount = orderItems.reduce(
                (total, item) => total + Number(item.qty || 0),
                0,
              );
              const address = order.delivery_address || {};
              const StatusIcon = isTerminal ? XCircle : CheckCircle2;

              return (
                <article
                  key={order.id}
                  className={`customer-order-card status-${order.status}`}
                >
                  <header className="customer-order-card-head">
                    <div>
                      <em className={`customer-order-status status-${order.status}`}>
                        <StatusIcon />
                        {STATUS_LABELS[order.status] || order.status}
                      </em>
                      <span className="customer-order-date">
                        <CalendarDays /> {formatDateTime(order.created_at)}
                      </span>
                    </div>
                    <div className="customer-order-number">
                      <small>ORDER ID</small>
                      <b>{order.order_number}</b>
                    </div>
                  </header>

                  <div className="customer-order-overview">
                    <div className="customer-order-thumbnails" aria-hidden="true">
                      {orderItems.slice(0, 3).map((item) => (
                        <OrderItemImage key={item.id} item={item} />
                      ))}
                      {orderItems.length > 3 && (
                        <span className="customer-order-more">+{orderItems.length - 3}</span>
                      )}
                    </div>
                    <div className="customer-order-copy">
                      <h2>
                        {orderItems[0]?.name || "Your Buyzaar Mart order"}
                        {orderItems.length > 1 && (
                          <small> + {orderItems.length - 1} more</small>
                        )}
                      </h2>
                      <p>
                        <Store /> {order.store_name || "The Buyzaar Mart"}
                      </p>
                      <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
                    </div>
                    <div className="customer-order-total">
                      <small>ORDER TOTAL</small>
                      <strong>{money(order.grand_total)}</strong>
                      <span>{paymentLabel(order.payment_method)}</span>
                    </div>
                  </div>

                  {!isTerminal && !isDelivered && (
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
                    <p className="customer-order-delivered-note">
                      <CheckCircle2 /> Delivered {formatDateTime(
                        deliveredEvent?.created_at || order.delivered_at,
                      ) || "successfully"}
                    </p>
                  )}
                  {isTerminal && order.rejection_reason && (
                    <p className="customer-order-terminal-note">
                      <XCircle /> {order.rejection_reason}
                    </p>
                  )}

                  <div className="customer-order-actions">
                    {!isTerminal && !isDelivered && (
                      <Link className="primary" href={`/orders/${order.id}/track`}>
                        <Truck /> Track order
                      </Link>
                    )}
                    {hasReceipt && (
                      <button type="button" onClick={() => downloadReceipt(order)}>
                        <Download /> Receipt
                      </button>
                    )}
                    {isDelivered && (
                      <Link href="/">
                        <RotateCcw /> Shop again
                      </Link>
                    )}
                    {canCancel && (
                      <button
                        className="danger"
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => cancelOrder(order)}
                      >
                        <XCircle />
                        {busyId === order.id ? "Cancelling..." : "Cancel order"}
                      </button>
                    )}
                    <button
                      className="details-toggle"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleDetails(order.id)}
                    >
                      {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      {isExpanded ? "Hide details" : "View details"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="customer-order-details">
                      <section className="customer-order-products">
                        <h3>Order items</h3>
                        {orderItems.map((item) => (
                          <div key={item.id}>
                            <OrderItemImage item={item} className="detail" />
                            <span>
                              <b>{item.name}</b>
                              <small>{item.unit || "1 unit"} · Qty {Number(item.qty)}</small>
                            </span>
                            <strong>{money(
                              item.line_total ||
                                Number(item.selling_price) * Number(item.qty),
                            )}</strong>
                          </div>
                        ))}
                      </section>

                      <aside className="customer-order-info">
                        <h3>Delivery details</h3>
                        <div><MapPin /><span><small>Deliver to</small><b>{address.line}, {address.city} - {address.pincode}</b></span></div>
                        <div><Store /><span><small>Store</small><b>{order.store_name}</b></span></div>
                        <div><Truck /><span><small>Delivery slot</small><b>{order.delivery_slot || "Standard delivery"}</b></span></div>
                        <div><CreditCard /><span><small>Payment</small><b>{paymentLabel(order.payment_method)}</b></span></div>
                        {hasReceipt && (
                          <div>
                            <FileText />
                            <span>
                              <small>E-receipt</small>
                              <b>{order.tbm_bill_number || order.order_number}</b>
                              <button type="button" onClick={() => viewReceipt(order)}>
                                <ExternalLink /> View e-receipt
                              </button>
                            </span>
                          </div>
                        )}
                      </aside>

                      {statusHistory.length > 0 && (
                        <section className="customer-order-history">
                          <h3><History /> Order history</h3>
                          <div>
                            {statusHistory.map((item) => (
                              <p key={item.id}>
                                <span><i />{historyLabel(item.to_status)}</span>
                                <time>{formatDateTime(item.created_at)}</time>
                              </p>
                            ))}
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </article>
              );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      <PageFooter />
    </>
  );
}
