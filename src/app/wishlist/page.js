"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Heart, ShoppingBag, Sparkles } from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { EmptyState, ProductCard } from "@/components/shop/ShopUI";
import { useStore } from "@/context/StoreContext";
import { useCartSession } from "@/context/CartSessionContext";

export default function Wishlist() {
  const { cart, wishlist } = useStore();
  const { changeItem, sessionReady } = useCartSession();
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const available = useMemo(
    () => wishlist.filter((product) => Number(product.stock || 0) > 0),
    [wishlist],
  );
  const visible = wishlist.filter((product) =>
    filter === "all" ? true : filter === "available" ? Number(product.stock || 0) > 0 : Number(product.stock || 0) < 1,
  );
  async function addAvailable() {
    setAdding(true);
    try {
      for (const product of available) {
        if (!cart.some((item) => String(item.id) === String(product.id))) {
          await changeItem(product, 1);
        }
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-wishlist-page">
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">
              <Heart size={14} /> SAVED FOR LATER
            </span>
            <h1>
              My wishlist{" "}
              <span>
                ({wishlist.length} {wishlist.length === 1 ? "item" : "items"})
              </span>
            </h1>
            <p className="bz-muted">
              Keep favourites close and add them whenever you need.
            </p>
          </div>
        </div>

        {!wishlist.length ? (
          <EmptyState
            title="Your wishlist is empty"
            description="Save products you love and come back to them anytime."
            action="Browse products"
            href="/products"
          />
        ) : (
          <>
            <div className="bz-wishlist-tools">
              <div className="bz-segmented-control" aria-label="Filter saved products">
                <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All <span>{wishlist.length}</span></button>
                <button className={filter === "available" ? "is-active" : ""} onClick={() => setFilter("available")}>Available <span>{available.length}</span></button>
                <button className={filter === "unavailable" ? "is-active" : ""} onClick={() => setFilter("unavailable")}>Unavailable <span>{wishlist.length - available.length}</span></button>
              </div>
              <button className="bz-button bz-wishlist-add-all" type="button" disabled={!available.length || adding || !sessionReady} onClick={addAvailable}>
                <ShoppingBag size={16} /> {adding ? "Adding…" : "Add available"}
              </button>
            </div>
            <div className="bz-product-grid">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {!visible.length ? <div className="bz-inline-empty">No products in this view.</div> : null}
            <aside className="bz-wishlist-tip">
              <Sparkles size={18} />
              <span>
                <b>Live store prices</b>
                <small>
                  Wishlist prices follow your selected store&apos;s catalogue.
                </small>
              </span>
              <Link className="bz-text-link" href="/products">
                Keep shopping <ArrowRight size={14} />
              </Link>
            </aside>
          </>
        )}
      </main>
      <PageFooter />
    </>
  );
}
