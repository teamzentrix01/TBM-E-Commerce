"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Gift,
  Share2,
  Trash2,
  Truck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import {
  EmptyState,
  Modal,
  OrderSummary,
  ProductGrid,
  ProductImage,
  QuantityControl,
} from "@/components/shop/ShopUI";
import { useStore } from "@/context/StoreContext";
import { useCartSession } from "@/context/CartSessionContext";
import { fetchProducts } from "@/lib/api";
import { accountLoginHref, rememberLoginReturn } from "@/lib/authNav.mjs";
import { readHamperGiftMeta } from "@/lib/hampers.mjs";
import { cartTotals, money } from "@/lib/shop.mjs";

export default function CartPage() {
  const { activeStore, authReady, cart, cartCount, customer, ready } =
    useStore();
  const {
    changeItem,
    session,
    sessionReady,
    invite,
    error: syncError,
  } = useCartSession();
  const [recommendations, setRecommendations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [hamperGift, setHamperGift] = useState({ message: "", styleName: "" });
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [copied, setCopied] = useState(false);
  const [removedItem, setRemovedItem] = useState(null);
  const undoTimerRef = useRef(null);
  useEffect(() => {
    setHamperGift(readHamperGiftMeta());
  }, []);
  useEffect(() => {
    if (!activeStore?.id) return;
    const controller = new AbortController();
    setRecommendations([]);
    fetchProducts({
      storeId: activeStore.id,
      pageSize: 12,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setRecommendations(
            (data.records || []).map((product) => ({
              ...product,
              store_id: activeStore.id,
            })),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeStore?.id]);
  async function change(product, amount) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await changeItem(product, amount);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function share() {
    setShareOpen(true);
    setShareBusy(true);
    setShareError("");
    setCopied(false);
    try {
      await invite();
    } catch (failure) {
      setShareError(failure.message);
    } finally {
      setShareBusy(false);
    }
  }
  const totals = cartTotals(cart);
  useEffect(() => () => clearTimeout(undoTimerRef.current), []);
  async function removeWithUndo(item) {
    const removed = await change(item, -item.qty);
    if (!removed) return;
    setRemovedItem(item);
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setRemovedItem(null), 5000);
  }
  async function undoRemove() {
    if (!removedItem) return;
    const item = removedItem;
    setRemovedItem(null);
    clearTimeout(undoTimerRef.current);
    await change(item, item.qty);
  }
  const inviteUrl =
    session?.inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/cart/join/${session.inviteToken}`
      : "";
  const related = recommendations
    .filter(
      (product) => !cart.some((item) => String(item.id) === String(product.id)),
    )
    .slice(0, 4);
  return (
    <>
      <AppHeader />
      <main
        className={`bz-shell bz-cart-page${ready && sessionReady && cart.length > 0 ? " has-mobile-checkout" : ""}`}
      >
        <Link className="bz-back-link" href="/products">
          <ArrowLeft size={16} /> Continue shopping
        </Link>
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">GOOD THINGS IN YOUR BASKET</span>
            <h1>
              Your cart{" "}
              <span>
                ({cartCount} {cartCount === 1 ? "item" : "items"})
              </span>
            </h1>
          </div>
          {cart.length > 0 && (
            <button
              className="bz-button bz-button-light"
              onClick={share}
              disabled={shareBusy}
            >
              <Share2 size={16} />
              {session ? "Share basket" : "Invite friends"}
            </button>
          )}
        </div>
        {(hamperGift.message || hamperGift.styleName) && cart.length > 0 ? (
          <div className="bz-hamper-gift-banner">
            <Gift size={16} />
            {hamperGift.styleName ? (
              <span>
                Basket style: <strong>{hamperGift.styleName}</strong>
              </span>
            ) : null}
            {hamperGift.message ? (
              <span>
                Gift note: <strong>{hamperGift.message}</strong>
              </span>
            ) : null}
          </div>
        ) : null}
        {!ready || !sessionReady ? (
          <p className="bz-muted">Loading your basket…</p>
        ) : !cart.length ? (
          <div className="bz-cart-empty-wrap">
            <EmptyState
              title="Your basket is waiting"
              description="Add your everyday favourites and we will take care of the rest."
            />
            {related.length > 0 && (
              <section className="bz-section">
                <div className="bz-section-heading">
                  <div>
                    <span className="bz-eyebrow">START HERE</span>
                    <h2>Popular near you</h2>
                  </div>
                  <Link href="/products">
                    View all <ArrowRight size={16} />
                  </Link>
                </div>
                <ProductGrid products={related} />
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="bz-cart-layout">
              <section>
                <div className="bz-delivery-banner">
                  <Truck size={22} />
                  <span>
                    <b>Shopping from your selected local store</b>
                    <small>
                      {activeStore?.name || "Choose a store to confirm live availability"}
                    </small>
                  </span>
                </div>
                {(error || syncError) && (
                  <p className="bz-notice" role="alert">
                    {error || syncError}
                  </p>
                )}
                <div className="bz-cart-items">
                  {cart.map((item) => (
                    <article className="bz-cart-row" key={item.id}>
                      <Link
                        className="bz-cart-image"
                        href={`/product/${item.id}`}
                      >
                        <ProductImage product={item} />
                      </Link>
                      <div className="bz-cart-item-copy">
                        <Link href={`/product/${item.id}`}>{item.name}</Link>
                        <small>{item.unit || "1 unit"}</small>
                        <span>{money(item.selling_price)} each</span>
                        <QuantityControl
                          product={item}
                          quantity={item.qty}
                          onUpdate={change}
                          busy={busy}
                        />
                      </div>
                      <div className="bz-cart-item-end">
                        <button
                          className="bz-icon-button"
                          aria-label={`Remove ${item.name} from cart`}
                          disabled={busy}
                          onClick={() => removeWithUndo(item)}
                        >
                          <Trash2 size={17} />
                        </button>
                        <strong>
                          {money(Number(item.selling_price) * item.qty)}
                        </strong>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <OrderSummary items={cart}>
                {!customer && authReady ? (
                  <p className="bz-guest-checkout-note">
                    Login required to place your order. You can keep adding items
                    as a guest.
                  </p>
                ) : null}
                <Link
                  className={`bz-button bz-full ${busy ? "is-disabled" : ""}`}
                  aria-disabled={busy}
                  href={
                    customer
                      ? "/checkout"
                      : accountLoginHref("/checkout")
                  }
                  onClick={(event) => {
                    if (busy) {
                      event.preventDefault();
                      return;
                    }
                    if (!customer) rememberLoginReturn("/checkout");
                  }}
                >
                  {customer
                    ? "Proceed to checkout"
                    : "Login to checkout"}{" "}
                  <ArrowRight size={17} />
                </Link>
                <Link className="bz-summary-continue" href="/products">
                  Continue shopping
                </Link>
              </OrderSummary>
            </div>
            {related.length > 0 && (
              <section className="bz-section">
                <div className="bz-section-heading">
                  <div>
                    <span className="bz-eyebrow">ANYTHING ELSE?</span>
                    <h2>You may also need</h2>
                  </div>
                </div>
                <ProductGrid products={related} />
              </section>
            )}
          </>
        )}
      </main>
      {ready && sessionReady && cart.length > 0 ? (
        <div className="bz-cart-mobile-checkout">
          <span>
            <small>Total</small>
            <strong>{money(totals.total)}</strong>
          </span>
          <Link
            className={`bz-button${busy ? " is-disabled" : ""}`}
            aria-disabled={busy}
            href={customer ? "/checkout" : accountLoginHref("/checkout")}
            onClick={(event) => {
              if (busy) {
                event.preventDefault();
                return;
              }
              if (!customer) rememberLoginReturn("/checkout");
            }}
          >
            {customer ? "Checkout" : "Login to checkout"}
            <ArrowRight size={17} />
          </Link>
        </div>
      ) : null}
      {removedItem ? (
        <div className="bz-undo-snackbar" role="status">
          <span><b>Removed from cart</b><small>{removedItem.name}</small></span>
          <button type="button" onClick={undoRemove}>Undo</button>
        </div>
      ) : null}
      <PageFooter />
      {shareOpen && (
        <Modal
          title="A basket for everyone"
          onClose={() => setShareOpen(false)}
        >
          <p>
            Invite friends to add their favourites. Your delivery store stays
            the same, and you handle checkout.
          </p>
          {shareError && (
            <p className="bz-error" role="alert">
              {shareError}
            </p>
          )}
          {shareBusy ? (
            <p role="status">Preparing your invite…</p>
          ) : inviteUrl ? (
            <div className="bz-share-actions">
              <a
                className="bz-button bz-button-green"
                href={`https://wa.me/?text=${encodeURIComponent(`Join my Buyzaar Mart cart: ${inviteUrl}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Share2 size={17} /> Share on WhatsApp
              </a>
              <button
                className="bz-button bz-button-light"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                  } catch {
                    setShareError(
                      "Could not copy the link. Select and copy the link below.",
                    );
                  }
                }}
              >
                <Copy size={16} />
                {copied ? "Link copied" : "Copy invite link"}
              </button>
              <input
                aria-label="Invite link"
                readOnly
                value={inviteUrl}
                onFocus={(event) => event.target.select()}
              />
              <small>Invites expire after 6 hours.</small>
            </div>
          ) : (
            <button className="bz-button" onClick={share}>
              Create invite
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
