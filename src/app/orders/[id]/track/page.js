"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
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

export default function TrackOrderPage() {
  const params = useParams();
  const router = useRouter();
  const { authReady, customer } = useStore();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

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
