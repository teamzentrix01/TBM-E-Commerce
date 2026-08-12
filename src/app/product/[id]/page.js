"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Heart,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { fetchProduct, resolveStoreByPincode } from "@/lib/api";
import { useStore } from "@/context/StoreContext";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const sentenceCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ProductPage() {
  const { id } = useParams();
  const {
    activeStore,
    cart,
    pincode,
    ready,
    selectStore,
    storeVerified,
    toggleWishlist,
    updateCart,
    wishlist,
  } = useStore();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      try {
        let store = activeStore;
        if (!store) {
          const resolved = await resolveStoreByPincode(
            pincode || "201304",
          );
          store = resolved.store;
          if (!cancelled) {
            selectStore(store, pincode || "201304");
          }
        }
        const data = await fetchProduct(id, store.id);
        if (!cancelled) {
          setProduct({
            ...(data.product || data),
            store_id: store.id,
          });
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeStore?.id, id, ready]);

  if (error) {
    return (
      <>
        <AppHeader />
        <div className="route-empty">
          <ShoppingBag />
          <h1>Product unavailable</h1>
          <p>{error}</p>
          <Link href="/">Back to shopping</Link>
        </div>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <AppHeader />
        <div className="detail-loading">
          <div />
          <div />
        </div>
      </>
    );
  }

  const quantity =
    cart.find((item) => String(item.id) === String(product.id))?.qty || 0;
  const saved = wishlist.some(
    (item) => String(item.id) === String(product.id),
  );
  const stock = Math.max(Math.floor(Number(product.stock) || 0), 0);
  const category = sentenceCase(product.category_name || "General");
  const brand = sentenceCase(product.brand_name || "The Buyzaar Mart");
  const unit = product.unit || "1 unit";
  const description =
    product.description?.trim() ||
    `${product.name} is available for local delivery from The Buyzaar Mart.`;
  const descriptionHighlights = [
    `${unit} pack`,
    `${category} essential`,
    storeVerified ? "Available locally" : "Store checked on add",
  ];

  return (
    <>
      <AppHeader />
      <main className="route-page product-route">
        <Link className="back-link" href="/">
          <ChevronLeft /> Back to products
        </Link>
        <section className="product-detail">
          <div className="detail-media">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt={product.name} />
            ) : (
              <div>
                <ShoppingBag />
                <span>{product.name}</span>
              </div>
            )}
          </div>
          <div className="detail-copy">
            <span className="eyebrow">
              {product.brand_name ||
                product.category_name ||
                "THE BUYZAAR MART"}
            </span>
            <h1>{product.name}</h1>
            <p className="detail-meta">
              {product.unit || "1 unit"} - SKU{" "}
              {product.sku || product.barcode || product.id}
            </p>
            <div className="detail-price">
              <strong>{money(product.selling_price)}</strong>
              {product.mrp > product.selling_price && (
                <del>{money(product.mrp)}</del>
              )}
            </div>
            <p className="tax-note">Inclusive of all taxes</p>
            <div className="stock-pill">In stock</div>
            <div className="detail-actions">
              {quantity === 0 ? (
                <button
                  className="primary-action"
                  onClick={() => updateCart(product, 1)}
                >
                  Add to cart <Plus />
                </button>
              ) : (
                <div className="large-qty">
                  <button
                    aria-label="Remove one item from cart"
                    onClick={() => updateCart(product, -1)}
                  >
                    <Minus />
                  </button>
                  <span>
                    <b>{quantity}</b>
                    <small>{quantity === 1 ? "item" : "items"} in cart</small>
                  </span>
                  <button
                    aria-label="Add one more item to cart"
                    disabled={quantity >= stock}
                    onClick={() => updateCart(product, 1)}
                  >
                    <Plus />
                  </button>
                </div>
              )}
              <button
                className={`save-action ${saved ? "saved" : ""}`}
                onClick={() => toggleWishlist(product)}
              >
                <Heart />
                {saved ? "Saved" : "Save item"}
              </button>
            </div>
            <div className="detail-benefits">
              <div>
                <Truck />
                <span>
                  <b>Local delivery</b>
                  <small>
                    {storeVerified
                      ? `From ${activeStore?.name || "your selected store"}`
                      : "Nearest store verified when you add"}
                  </small>
                </span>
              </div>
              <div>
                <ShieldCheck />
                <span>
                  <b>Quality assured</b>
                  <small>Carefully sourced product</small>
                </span>
              </div>
            </div>
            <div className="product-facts">
              <h2>Product details</h2>
              <p>
                <span>Category</span>
                <b>{category}</b>
              </p>
              <p>
                <span>Brand</span>
                <b>{brand}</b>
              </p>
              <p>
                <span>Tax rate</span>
                <b>{product.tax_rate || 0}%</b>
              </p>
            </div>
            <div className="product-facts product-description">
              <span className="description-kicker">Why you’ll like it</span>
              <h2>Description</h2>
              <p>{description}</p>
              <div className="description-highlights">
                {descriptionHighlights.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <PageFooter />
    </>
  );
}
