"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { useStore } from "@/context/StoreContext";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function SavedProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  return product.image_url && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.image_url}
      alt={product.name}
      onError={() => setFailed(true)}
    />
  ) : (
    <ShoppingBag />
  );
}

export default function Wishlist() {
  const { wishlist, toggleWishlist, updateCart } = useStore();

  return (
    <>
      <AppHeader />
      <main className="route-page modern-wishlist-page">
        <header className="modern-wishlist-heading">
          <div>
            <span>SAVED FOR LATER</span>
            <h1>My wishlist</h1>
            <p>Keep your everyday favourites close and add them whenever you need.</p>
          </div>
          <em><Heart /> {wishlist.length} saved</em>
        </header>

        {wishlist.length === 0 ? (
          <div className="modern-wishlist-empty">
            <span><Heart /></span>
            <small>YOUR WISHLIST</small>
            <h2>Save what you love</h2>
            <p>Tap the heart on any product and it will wait for you right here.</p>
            <Link href="/">Explore products <ArrowRight /></Link>
          </div>
        ) : (
          <section className="modern-wishlist-grid">
            {wishlist.map((product) => {
              const mrp = Number(product.mrp || product.selling_price || 0);
              const price = Number(product.selling_price || 0);
              const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
              return (
                <article key={product.id} className="modern-wishlist-card">
                  <div className="modern-wishlist-media-wrap">
                    {discount > 0 && <span className="modern-wishlist-discount">{discount}% OFF</span>}
                    <button
                      type="button"
                      aria-label={`Remove ${product.name} from wishlist`}
                      onClick={() => toggleWishlist(product)}
                    >
                      <Trash2 />
                    </button>
                    <Link href={`/product/${product.id}`} className="modern-wishlist-media">
                      <SavedProductImage product={product} />
                    </Link>
                  </div>
                  <div className="modern-wishlist-info">
                    <small>{product.brand_name || product.category_name || "THE BUYZAAR MART"}</small>
                    <Link href={`/product/${product.id}`}>{product.name}</Link>
                    <span>{product.unit || "1 unit"}</span>
                    <div className="modern-wishlist-price">
                      <b>{money(price)}</b>
                      {mrp > price && <del>{money(mrp)}</del>}
                    </div>
                    <button type="button" onClick={() => updateCart(product, 1)}>
                      <Plus /> Add to cart
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {wishlist.length > 0 && (
          <aside className="modern-wishlist-tip">
            <Sparkles />
            <span><b>Smart saving</b><small>Wishlist prices follow your selected store's live pricing.</small></span>
          </aside>
        )}
      </main>
      <PageFooter />
    </>
  );
}
