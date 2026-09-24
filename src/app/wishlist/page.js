"use client";

import Link from "next/link";
import { ArrowRight, Heart, Sparkles } from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { EmptyState, ProductCard } from "@/components/shop/ShopUI";
import { useStore } from "@/context/StoreContext";

export default function Wishlist() {
  const { wishlist } = useStore();

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
            <div className="bz-product-grid">
              {wishlist.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
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
