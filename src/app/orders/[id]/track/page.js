"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Bell,
  BellRing,
  Clock3,
  MapPin,
  Navigation,
  PackageCheck,
  Truck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { useStore } from "@/context/StoreContext";
import { accountLoginHref, rememberLoginReturn } from "@/lib/authNav.mjs";

const LABELS = {
  pending_store_acceptance: "Waiting for store confirmation",
  accepted: "Order accepted",
  picking: "Items are being picked",
  packed: "Order packed",
  billed: "Ready for rider pickup",
  dispatched: "Out for delivery",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const TRACKING_STEPS = [
  { status: "pending_store_acceptance", label: "Confirmed" },
  { status: "accepted", label: "Accepted" },
  { status: "picking", label: "Picking" },
  { status: "packed", label: "Packed" },
  { status: "dispatched", label: "On the way" },
  { status: "delivered", label: "Delivered" },
];

export default function TrackOrderPage() {
  const reduceMotion = useReducedMotion();
  const params = useParams();
  const router = useRouter();
  const { authReady, customer } = useStore();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const previousStatusRef = useRef(null);

  const returnTo = `/orders/${params.id}/track`;

  const loadTracking = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${params.id}/tracking`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        rememberLoginReturn(returnTo);
        router.replace(accountLoginHref(returnTo));
        return;
      }
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "Unable to load tracking");
      }
      setOrder(payload.data.order);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [params.id, returnTo, router]);

  useEffect(() => {
    if (!authReady) return;
    if (!customer) {
      rememberLoginReturn(returnTo);
      router.replace(accountLoginHref(returnTo));
      return;
    }
    loadTracking();
    const interval = setInterval(loadTracking, 5000);
    return () => clearInterval(interval);
  }, [authReady, customer, loadTracking, returnTo, router]);

  useEffect(() => {
    setNotificationsEnabled(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        localStorage.getItem("tbm-order-notifications") === "1",
    );
  }, []);

  useEffect(() => {
    if (!order?.status) return;
    const previous = previousStatusRef.current;
    previousStatusRef.current = order.status;
    if (!previous || previous === order.status || !notificationsEnabled) return;
    const title = LABELS[order.status] || "Order updated";
    const options = {
      body: `${order.order_number}: ${title}`,
      icon: "/icon.svg",
      badge: "/favicon.png",
      tag: `buyzaar-order-${order.id}`,
      data: { url: returnTo },
    };
    navigator.serviceWorker?.ready
      .then((registration) => registration.showNotification(title, options))
      .catch(() => new Notification(title, options));
  }, [notificationsEnabled, order?.id, order?.order_number, order?.status, returnTo]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setError("Order notifications are not supported in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setNotificationsEnabled(enabled);
    localStorage.setItem("tbm-order-notifications", enabled ? "1" : "0");
    if (!enabled) setError("Allow notifications in your browser to receive order updates.");
    else setError("");
  }

  const mapUrl = useMemo(() => {
    if (order?.rider_latitude == null || order?.rider_longitude == null) {
      return "";
    }
    const latitude = Number(order?.rider_latitude);
    const longitude = Number(order?.rider_longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
    const delta = 0.012;
    const bbox = [
      longitude - delta,
      latitude - delta,
      longitude + delta,
      latitude + delta,
    ].join(",");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  }, [order?.rider_latitude, order?.rider_longitude]);

  const normalizedStatus = order?.status === "billed" ? "packed" : order?.status;
  const currentStep = order
    ? Math.max(
        0,
        TRACKING_STEPS.findIndex((item) => item.status === normalizedStatus),
      )
    : 0;
  const progress = (currentStep / (TRACKING_STEPS.length - 1)) * 100;
  const trackingStopped = ["cancelled", "rejected"].includes(order?.status);

  if (!authReady || !customer) {
    return (
      <>
        <AppHeader />
        <main className="tracking-page">
          <div className="bz-empty" style={{ marginTop: 40 }}>
            <PackageCheck size={42} />
            <h2>Login to track this order</h2>
            <p>Sign in with the same account used to place the order.</p>
            <Link className="bz-button" href={accountLoginHref(returnTo)}>
              Login with OTP
            </Link>
          </div>
        </main>
        <PageFooter />
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="tracking-page">
        <Link
          href="/orders"
          style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
        >
          <ArrowLeft size={18} /> Back to orders
        </Link>
        {error && <p className="form-error">{error}</p>}
        {!order ? (
          <p style={{ marginTop: 32 }}>Loading live tracking...</p>
        ) : (
          <div className="tracking-stack">
            <section className="checkout-card">
              <div className="checkout-card-title">
                <span>
                  <PackageCheck />
                </span>
                <div>
                  <small>{order.order_number}</small>
                  <h1>{LABELS[order.status] || order.status}</h1>
                  <p>{order.store_name}</p>
                </div>
              </div>
            </section>

            <section className="checkout-card bz-live-timeline" aria-label="Order progress">
              <div className="bz-live-timeline-head">
                <div>
                  <small>LIVE ORDER PROGRESS</small>
                  <h2>{trackingStopped ? LABELS[order.status] : "Your order journey"}</h2>
                </div>
                {!trackingStopped ? (
                  <button
                    type="button"
                    className={`bz-tracking-notify${notificationsEnabled ? " is-enabled" : ""}`}
                    onClick={enableNotifications}
                    disabled={notificationsEnabled}
                  >
                    {notificationsEnabled ? <BellRing size={15} /> : <Bell size={15} />}
                    {notificationsEnabled ? "Notifications on" : "Notify me"}
                  </button>
                ) : null}
              </div>
              {trackingStopped ? (
                <p className="bz-live-timeline-stopped">
                  This order will not progress further. Visit your orders for details.
                </p>
              ) : (
                <div className="bz-live-timeline-steps">
                  <div className="bz-live-timeline-line" aria-hidden="true">
                    <motion.span
                      initial={false}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  {TRACKING_STEPS.map((item, index) => {
                    const complete = index < currentStep;
                    const active = index === currentStep;
                    return (
                      <div
                        key={item.status}
                        className={`bz-live-timeline-step${complete ? " is-complete" : ""}${active ? " is-active" : ""}`}
                        aria-current={active ? "step" : undefined}
                      >
                        <motion.span
                          animate={active && !reduceMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                          transition={active && !reduceMotion ? { duration: 1.8, repeat: Infinity } : { duration: 0 }}
                        >
                          {complete ? "✓" : index + 1}
                        </motion.span>
                        <small>{item.label}</small>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {mapUrl ? (
              <section className="checkout-card">
                <iframe
                  className="tracking-map"
                  title="Live rider location"
                  src={mapUrl}
                  style={{
                    width: "100%",
                    height: 380,
                    border: 0,
                    borderRadius: 12,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    marginTop: 14,
                  }}
                >
                  <b>
                    <Truck size={17} />{" "}
                    {order.delivery_agent_name || "Store rider"}
                  </b>
                  {order.remaining_distance_km != null && (
                    <span>
                      <Navigation size={17} /> Approximately{" "}
                      {order.remaining_distance_km} km away
                    </span>
                  )}
                  <span>
                    <Clock3 size={17} /> Updated{" "}
                    {order.rider_location_updated_at
                      ? new Date(
                          order.rider_location_updated_at,
                        ).toLocaleTimeString("en-IN")
                      : "recently"}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${order.rider_latitude},${order.rider_longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="next-button"
                  style={{ marginTop: 16 }}
                >
                  <MapPin size={18} /> Open rider location
                </a>
              </section>
            ) : (
              <section className="checkout-card">
                <Truck />
                <h2>
                  {order.delivery_agent_name
                    ? `${order.delivery_agent_name} is assigned`
                    : "Rider will be assigned soon"}
                </h2>
                <p>Live map starts after the rider picks up your order.</p>
              </section>
            )}

            {order.delivery_otp && (
              <section
                className="checkout-card"
                style={{ textAlign: "center" }}
              >
                <small>SHARE ONLY AFTER RECEIVING THE ORDER</small>
                <h2 style={{ fontSize: 34, letterSpacing: 10 }}>
                  {order.delivery_otp}
                </h2>
                <p>Delivery OTP</p>
              </section>
            )}
          </div>
        )}
      </main>
      <PageFooter />
    </>
  );
}
