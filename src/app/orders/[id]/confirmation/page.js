"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Check, Clock3, Truck } from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { ProductImage } from "@/components/shop/ShopUI";
import { useStore } from "@/context/StoreContext";
import { fetchCustomerOrders } from "@/lib/ecommerceApi";
import { accountLoginHref, rememberLoginReturn } from "@/lib/authNav.mjs";
import { money } from "@/lib/shop.mjs";

const statusLabels = {
  pending_store_acceptance: "Waiting for store acceptance",
  accepted: "Accepted by your store",
  picking: "Your items are being picked",
  packed: "Packed and ready",
  billed: "Ready for dispatch",
  dispatched: "Out for delivery",
  delivered: "Delivered",
  rejected: "Order rejected",
  cancelled: "Order cancelled",
  payment_pending: "Awaiting payment confirmation",
};
const paymentLabels = {
  cod: "Cash on delivery",
  upi_on_delivery: "UPI on delivery",
  razorpay: "Online payment",
};
export default function ConfirmationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { authReady, customer } = useStore();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authReady) return;
    if (!customer) {
      const returnTo = `/orders/${id}/confirmation`;
      rememberLoginReturn(returnTo);
      router.replace(accountLoginHref(returnTo));
      return;
    }
    let cancelled = false;
    setError("");
    setOrder(null);
    fetchCustomerOrders()
      .then((data) => {
        if (cancelled) return;
        const found = (data.orders || []).find(
          (item) => String(item.id) === String(id),
        );
        if (!found)
          throw new Error("This order could not be found in your account.");
        setOrder(found);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, customer, id, router, attempt]);
  const successful =
    order &&
    !["payment_pending", "cancelled", "rejected"].includes(order.status);
  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-confirmation-page">
        {error ? (
          <div className="bz-empty" role="alert">
            <h1>Unable to load your order</h1>
            <p>{error}</p>
            <button
              className="bz-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
            <Link className="bz-text-link" href="/orders">
              View my orders
            </Link>
          </div>
        ) : !order ? (
          <p className="bz-empty" role="status">
            Loading your order…
          </p>
        ) : (
          <>
            <div className="bz-confirmation-layout">
              <section className="bz-confirmation-message">
                <span
                  className={`bz-confirmation-icon ${successful ? "" : "is-pending"}`}
                >
                  {successful ? <Check size={40} /> : <Clock3 size={40} />}
                </span>
                <span className="bz-eyebrow">
                  {successful
                    ? "THANK YOU FOR SHOPPING LOCAL"
                    : "YOUR ORDER STATUS"}
                </span>
                <h1>
                  {successful
                    ? "Your order has been placed!"
                    : statusLabels[order.status] || "Order update"}
                </h1>
                <p>
                  {successful
                    ? "A little everyday goodness is on its way."
                    : "Check your order details for the latest update."}
                  <br />
                  Order <b>{order.order_number}</b>
                </p>
                <p className="bz-order-status">
                  {statusLabels[order.status] || order.status}
                </p>
                <div className="bz-form-actions">
                  <Link className="bz-button" href={`/orders/${id}/track`}>
                    View order details <ArrowRight size={16} />
                  </Link>
                  <Link className="bz-button bz-button-light" href="/products">
                    Continue shopping
                  </Link>
                </div>
              </section>
              <aside className="bz-summary bz-confirmation-summary">
                <h2>Order summary</h2>
                <p className="bz-muted">{order.order_number}</p>
                <div className="bz-summary-items">
                  {(order.items || []).map((item) => (
                    <div key={item.id || item.product_id}>
                      <span className="bz-summary-image">
                        <ProductImage product={item} />
                      </span>
                      <span>
                        <b>{item.name}</b>
                        <small>Qty {item.qty}</small>
                      </span>
                      <strong>
                        {money(
                          item.line_total ??
                            Number(item.selling_price) * item.qty,
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(order.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>
                      {Number(order.delivery_fee)
                        ? money(order.delivery_fee)
                        : "FREE"}
                    </dd>
                  </div>
                </dl>
                <div className="bz-summary-total">
                  <span>Total</span>
                  <strong>{money(order.grand_total)}</strong>
                </div>
                <p className="bz-muted">
                  {paymentLabels[order.payment_method] || order.payment_method}
                  {order.payment_status
                    ? ` · ${order.payment_status.replaceAll("_", " ")}`
                    : ""}
                </p>
                {order.delivery_slot && (
                  <p className="bz-muted">
                    Requested delivery: {order.delivery_slot}
                  </p>
                )}
              </aside>
            </div>
            <section className="bz-tracking-banner">
              <Truck size={42} strokeWidth={1.5} />
              <div>
                <h2>Follow your order, every step of the way</h2>
                <p>See updates from your local store through to delivery.</p>
              </div>
              <Link className="bz-button" href={`/orders/${id}/track`}>
                Track order <ArrowRight size={16} />
              </Link>
            </section>
          </>
        )}
      </main>
      <PageFooter />
    </>
  );
}
