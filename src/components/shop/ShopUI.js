"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  ShoppingBag,
  ShieldCheck,
  X,
} from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useCartSession } from "@/context/CartSessionContext";
import { cartTotals, discount, formatPackSize, listingUrl, money, productBrandLabel } from "@/lib/shop.mjs";

export function ProductImage({ product, eager = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const imageUrl = product?.image_url;
  if (!product) {
    return (
      <span className="bz-image-fallback">
        <ShoppingBag aria-hidden="true" />
        <span>Product image unavailable</span>
      </span>
    );
  }
  return imageUrl && failedUrl !== imageUrl ? (
    <span className={`bz-image-frame${loadedUrl === imageUrl ? " is-loaded" : ""}`}>
      {loadedUrl !== imageUrl && <span className="bz-image-placeholder" aria-hidden="true" />}
      <img
        src={imageUrl}
        alt={product.name || "Product"}
        loading={eager ? "eager" : "lazy"}
        onLoad={() => setLoadedUrl(imageUrl)}
        onError={() => setFailedUrl(imageUrl)}
      />
    </span>
  ) : (
    <span className="bz-image-fallback">
      <ShoppingBag aria-hidden="true" />
      <span>{product.name || "Product image unavailable"}</span>
    </span>
  );
}

function productGalleryUrls(product) {
  const fromImages = Array.isArray(product?.images)
    ? product.images
        .map((img) => (typeof img === "string" ? img : img?.url))
        .filter(Boolean)
    : [];
  if (fromImages.length) {
    return [...new Set(fromImages)];
  }
  return product?.image_url ? [product.image_url] : [];
}

const GALLERY_ZOOM = 2.4;
const GALLERY_LENS = 38;

export function ProductGallery({ product }) {
  const urls = productGalleryUrls(product);
  const [active, setActive] = useState(0);
  const [failedUrl, setFailedUrl] = useState(null);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [zoom, setZoom] = useState(null);
  const mainRef = useRef(null);
  const thumbsRef = useRef(null);
  const current = urls[active] || urls[0] || null;

  useEffect(() => {
    setActive(0);
    setFailedUrl(null);
    setLoadedUrl(null);
    setZoom(null);
  }, [product?.id, product?.image_url, urls.length, urls[0]]);

  function handleMove(event) {
    const node = mainRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
    );
    setZoom({ x, y });
  }

  function scrollThumbs(direction) {
    const node = thumbsRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * 140, behavior: "smooth" });
  }

  if (!current || failedUrl === current) {
    return (
      <span className="bz-image-fallback">
        <ShoppingBag aria-hidden="true" />
        <span>{product?.name || "Product image unavailable"}</span>
      </span>
    );
  }

  const half = GALLERY_LENS / 2;
  const lensX = zoom
    ? Math.max(half, Math.min(100 - half, zoom.x))
    : half;
  const lensY = zoom
    ? Math.max(half, Math.min(100 - half, zoom.y))
    : half;
  const zooming = Boolean(zoom);

  return (
    <div className={`bz-gallery${zooming ? " is-zooming" : ""}`}>
      <div className="bz-gallery-stage">
        <div
          ref={mainRef}
          className="bz-gallery-main"
          onMouseEnter={handleMove}
          onMouseMove={handleMove}
          onMouseLeave={() => setZoom(null)}
        >
          {loadedUrl !== current && <span className="bz-image-placeholder" aria-hidden="true" />}
          <img
            src={current}
            alt={product?.name || "Product"}
            loading="eager"
            onLoad={() => setLoadedUrl(current)}
            onError={() => setFailedUrl(current)}
          />
          {zooming ? (
            <span
              className="bz-gallery-lens"
              style={{
                width: `${GALLERY_LENS}%`,
                height: `${GALLERY_LENS}%`,
                left: `${lensX - half}%`,
                top: `${lensY - half}%`,
              }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        {zooming ? (
          <div
            className="bz-gallery-zoom"
            style={{
              backgroundImage: `url(${current})`,
              backgroundSize: `${GALLERY_ZOOM * 100}%`,
              backgroundPosition: `${zoom.x}% ${zoom.y}%`,
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {urls.length > 1 ? (
        <div className="bz-gallery-thumbs-wrap">
          {urls.length > 4 ? (
            <button
              type="button"
              className="bz-gallery-nav is-prev"
              aria-label="Previous images"
              onClick={() => scrollThumbs(-1)}
            >
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <div className="bz-gallery-thumbs" role="list" ref={thumbsRef}>
            {urls.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                role="listitem"
                className={`bz-gallery-thumb${active === index ? " is-active" : ""}`}
                onClick={() => {
                  setActive(index);
                  setFailedUrl(null);
                  setZoom(null);
                }}
                aria-label={`View image ${index + 1}`}
              >
                <img src={url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          {urls.length > 4 ? (
            <button
              type="button"
              className="bz-gallery-nav is-next"
              aria-label="Next images"
              onClick={() => scrollThumbs(1)}
            >
              <ChevronRight size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Price({ product }) {
  return (
    <span className="bz-price">
      <strong>{money(product.selling_price)}</strong>
      {Number(product.mrp) > Number(product.selling_price) && (
        <del>{money(product.mrp)}</del>
      )}
    </span>
  );
}

export function QuantityControl({ product, quantity, onUpdate, busy = false }) {
  return (
    <div className="bz-quantity" aria-label={`Quantity for ${product.name}`}>
      <button
        type="button"
        aria-label={`Remove one ${product.name}`}
        disabled={busy}
        onClick={() => onUpdate(product, -1)}
      >
        <Minus size={15} />
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        type="button"
        aria-label={`Add one ${product.name}`}
        disabled={
          busy ||
          quantity >= Math.max(0, Math.floor(Number(product.stock || 0)))
        }
        onClick={() => onUpdate(product, 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export function AddToCart({ product, compact = false }) {
  const { cart } = useStore();
  const { changeItem, sessionReady } = useCartSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quantity =
    cart.find((item) => String(item.id) === String(product.id))?.qty || 0;
  async function change(item, amount) {
    setBusy(true);
    setError("");
    try {
      await changeItem(item, amount);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const outOfStock = Number(product.stock || 0) < 1;
  return (
    <div className="bz-add-wrap">
      {quantity > 0 ? (
        <QuantityControl
          product={product}
          quantity={quantity}
          busy={busy || !sessionReady}
          onUpdate={change}
        />
      ) : (
        <button
          className={`bz-button bz-add${compact ? " bz-add-soft" : ""}`}
          disabled={busy || !sessionReady || outOfStock}
          onClick={() => change(product, 1)}
        >
          {outOfStock ? "Out of stock" : busy ? "Adding…" : compact ? "ADD" : "Add to cart"}
          {!outOfStock && <Plus size={15} />}
        </button>
      )}
      {error && (
        <small className="bz-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function SaveProduct({ product }) {
  const { wishlist, toggleWishlist } = useStore();
  const saved = wishlist.some((item) => String(item.id) === String(product.id));
  return (
    <button
      className={`bz-save ${saved ? "is-saved" : ""}`}
      aria-label={`${saved ? "Remove" : "Save"} ${product.name}${saved ? " from wishlist" : " to wishlist"}`}
      aria-pressed={saved}
      onClick={() => toggleWishlist(product)}
    >
      <Heart size={18} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

export function ProductCard({ product }) {
  const saving = discount(product);
  const brand = productBrandLabel(product);
  const pack = formatPackSize(product.unit);
  const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
  return (
    <article className="bz-product-card">
      <div className="bz-product-media">
        <Link
          href={`/product/${product.id}`}
          aria-label={`View ${product.name}`}
        >
          <ProductImage product={product} />
        </Link>
        {saving > 0 && <span className="bz-discount">{saving}% OFF</span>}
        <SaveProduct product={product} />
      </div>
      <div className="bz-product-info">
        <Link className="bz-product-name" href={`/product/${product.id}`} title={product.name}>
          {product.name}
        </Link>
        <Price product={product} />
        {brand && product.brand_id ? (
          <Link
            className="bz-product-brand"
            href={listingUrl({ brand: product.brand_id })}
          >
            {brand}
          </Link>
        ) : (
          <span className={`bz-product-brand${brand ? "" : " is-empty"}`}>
            {brand || "\u00A0"}
          </span>
        )}
        <div className="bz-product-meta">
          {pack ? <span className="bz-unit">{pack}</span> : null}
          {stock > 0 ? (
            <span className="bz-stock-ok">Available</span>
          ) : (
            <span className="bz-stock-out">Out of stock</span>
          )}
        </div>
        <AddToCart product={product} compact />
      </div>
    </article>
  );
}

export function ProductGrid({ products, loading = false }) {
  return (
    <div className="bz-product-grid" aria-busy={loading}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
      {loading
        ? Array.from({ length: products.length ? 4 : 8 }, (_, i) => (
            <div className="bz-skeleton-card" key={`loading-${i}`}>
              <div />
              <span />
              <span />
              <span />
            </div>
          ))
        : null}
    </div>
  );
}

export function OrderSummary({ items, children, showItems = false }) {
  const totals = cartTotals(items);
  return (
    <aside className="bz-summary">
      <h2>Order summary</h2>
      {showItems && (
        <div className="bz-summary-items">
          {items.map((item) => (
            <div key={item.id}>
              <span className="bz-summary-image">
                <ProductImage product={item} />
              </span>
              <span>
                <b>{item.name}</b>
                <small>Qty {item.qty}</small>
              </span>
              <strong>{money(Number(item.selling_price) * item.qty)}</strong>
            </div>
          ))}
        </div>
      )}
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{money(totals.subtotal)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd className={totals.delivery === 0 ? "bz-green" : ""}>
            {totals.delivery ? money(totals.delivery) : "FREE"}
          </dd>
        </div>
      </dl>
      <div className="bz-summary-total">
        <span>Total</span>
        <strong>{money(totals.total)}</strong>
      </div>
      {totals.savings > 0 && (
        <p className="bz-savings">
          You save {money(totals.savings)} on this order
        </p>
      )}
      {children}
      <small className="bz-secure">
        <ShieldCheck size={15} /> Taxes included in product prices
      </small>
    </aside>
  );
}

export function EmptyState({
  title,
  description,
  href = "/products",
  action = "Explore products",
}) {
  return (
    <div className="bz-empty">
      <ShoppingBag size={42} />
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="bz-button" href={href}>
        {action}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this right now",
  description = "Please try again in a moment.",
  onRetry,
}) {
  return (
    <section className="bz-error-state" role="alert">
      <span className="bz-error-state-icon" aria-hidden="true">
        <ShoppingBag size={22} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {onRetry ? (
        <button type="button" className="bz-button bz-button-light" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}

export function Modal({ title, children, onClose, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`bz-dialog ${className}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bz-dialog-content">
        <div className="bz-section-heading">
          <h2>{title}</h2>
          <button
            className="bz-icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
