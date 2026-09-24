"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import {
  AddToCart,
  EmptyState,
  Price,
  ProductGrid,
  ProductGallery,
  SaveProduct,
} from "@/components/shop/ShopUI";
import useCatalogStore from "@/components/shop/useCatalogStore";
import { fetchProduct, fetchProducts } from "@/lib/api";
import {
  discount,
  formatPackSize,
  listingUrl,
  money,
  productBrandLabel,
  titleCaseLabel,
} from "@/lib/shop.mjs";
import { useStore } from "@/context/StoreContext";

export default function ProductPage() {
  const { id } = useParams();
  const { store, error: storeError, retry } = useCatalogStore();
  const { storeVerified } = useStore();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [sameBrand, setSameBrand] = useState([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    setProduct(null);
    setRelated([]);
    setSameBrand([]);
    setError("");
    fetchProduct(id, store.id)
      .then((data) => {
        if (cancelled) return;
        const item = { ...(data.product || data), store_id: store.id };
        setProduct(item);
        const relatedRequest = fetchProducts({
          storeId: store.id,
          categoryId: item.category_id || "",
          pageSize: 8,
        }).then((result) => {
          if (cancelled) return;
          setRelated(
            (result.records || [])
              .filter((value) => String(value.id) !== String(id))
              .slice(0, 4)
              .map((value) => ({ ...value, store_id: store.id })),
          );
        });
        const brandRequest = item.brand_id
          ? fetchProducts({
              storeId: store.id,
              brandId: item.brand_id,
              pageSize: 8,
            }).then((result) => {
              if (cancelled) return;
              setSameBrand(
                (result.records || [])
                  .filter((value) => String(value.id) !== String(id))
                  .slice(0, 4)
                  .map((value) => ({ ...value, store_id: store.id })),
              );
            })
          : Promise.resolve();
        return Promise.all([relatedRequest, brandRequest]).catch(() => {});
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, store?.id, attempt]);

  const stock = Math.max(0, Math.floor(Number(product?.stock || 0)));
  const brand = product ? productBrandLabel(product) : "";
  const pack = product ? formatPackSize(product.unit) : "";
  const categoryLabel = product?.category_name
    ? titleCaseLabel(product.category_name)
    : "";
  const savingPct = product ? discount(product) : 0;
  const saveAmount =
    product && Number(product.mrp) > Number(product.selling_price)
      ? Number(product.mrp) - Number(product.selling_price)
      : 0;
  const description =
    product?.description?.trim() ||
    (product
      ? `${product.name} is available for local delivery from The Buyzaar Mart.`
      : "");

  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-detail-page">
        <nav className="bz-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} />
          <Link href="/products">Shop</Link>
          {categoryLabel && product && (
            <>
              <ChevronRight size={14} />
              <Link href={listingUrl({ category: product.category_id })}>
                {categoryLabel}
              </Link>
            </>
          )}
          {product?.name && (
            <>
              <ChevronRight size={14} />
              <span aria-current="page">{product.name}</span>
            </>
          )}
        </nav>
        {error || storeError ? (
          <>
            <EmptyState
              title="Product unavailable"
              description={error || storeError}
            />
            <button
              className="bz-button bz-button-light"
              onClick={() => {
                retry();
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </>
        ) : !product ? (
          <div className="bz-detail-loading" aria-label="Loading product">
            <div />
            <div />
          </div>
        ) : (
          <>
            <section className="bz-detail">
              <div className="bz-detail-media">
                <ProductGallery product={product} />
                {savingPct > 0 && (
                  <span className="bz-discount bz-detail-media-badge">
                    {savingPct}% OFF
                  </span>
                )}
                <SaveProduct product={product} />
              </div>
              <div className="bz-detail-copy">
                {brand ? (
                  product.brand_id ? (
                    <Link
                      className="bz-detail-brand"
                      href={listingUrl({ brand: product.brand_id })}
                    >
                      {brand}
                    </Link>
                  ) : (
                    <span className="bz-detail-brand">{brand}</span>
                  )
                ) : null}
                <h1>{product.name}</h1>

                <div className="bz-detail-chips" aria-label="Product highlights">
                  {pack ? (
                    <span>
                      <Package size={13} /> {pack}
                    </span>
                  ) : null}
                  {brand ? <span>{brand}</span> : null}
                  {categoryLabel ? <span>{categoryLabel}</span> : null}
                  <span className={stock > 0 ? "is-stock" : "is-out"}>
                    {stock > 0 ? "In stock" : "Out of stock"}
                  </span>
                </div>

                <div className="bz-detail-price">
                  <Price product={product} />
                  {savingPct > 0 && (
                    <span className="bz-discount">{savingPct}% OFF</span>
                  )}
                </div>
                {saveAmount > 0 && (
                  <p className="bz-detail-save">
                    You save {money(saveAmount)} on this item
                  </p>
                )}
                <small className="bz-muted">Inclusive of all taxes</small>
                {stock > 0 && !storeVerified ? (
                  <p className="bz-detail-availability bz-muted">
                    Availability checked for your delivery location
                  </p>
                ) : null}

                <div className="bz-detail-actions">
                  <AddToCart product={product} />
                  <Link className="bz-detail-cart-link" href="/cart">
                    View cart <ArrowRight size={16} />
                  </Link>
                </div>

                <div className="bz-detail-benefits">
                  <div>
                    <Truck size={22} />
                    <span>
                      <b>Local delivery</b>
                      <small>Free on orders ₹499+</small>
                    </span>
                  </div>
                  <div>
                    <ShieldCheck size={22} />
                    <span>
                      <b>Shop with confidence</b>
                      <small>Secure online payments</small>
                    </span>
                  </div>
                </div>

                <details className="bz-details" open>
                  <summary>About this product</summary>
                  <p>{description}</p>
                </details>
                <details className="bz-details" open>
                  <summary>Product information</summary>
                  <dl>
                    {pack ? (
                      <div>
                        <dt>Pack size</dt>
                        <dd>{pack}</dd>
                      </div>
                    ) : null}
                    {brand ? (
                      <div>
                        <dt>Brand</dt>
                        <dd>
                          {product.brand_id ? (
                            <Link href={listingUrl({ brand: product.brand_id })}>
                              {brand}
                            </Link>
                          ) : (
                            brand
                          )}
                        </dd>
                      </div>
                    ) : null}
                    {categoryLabel ? (
                      <div>
                        <dt>Category</dt>
                        <dd>
                          <Link
                            href={listingUrl({ category: product.category_id })}
                          >
                            {categoryLabel}
                          </Link>
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Availability</dt>
                      <dd>{stock > 0 ? "In stock" : "Out of stock"}</dd>
                    </div>
                    <div>
                      <dt>Product code</dt>
                      <dd>{product.sku || product.barcode || product.id}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            </section>

            {sameBrand.length > 0 && brand && (
              <section className="bz-section">
                <div className="bz-section-heading">
                  <div>
                    <span className="bz-eyebrow">SAME BRAND</span>
                    <h2>More from {brand}</h2>
                  </div>
                  {product.brand_id ? (
                    <Link href={listingUrl({ brand: product.brand_id })}>
                      View all <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
                <ProductGrid products={sameBrand} />
              </section>
            )}
            {related.length > 0 && (
              <section className="bz-section">
                <div className="bz-section-heading">
                  <div>
                    <span className="bz-eyebrow">COMPLETE YOUR BASKET</span>
                    <h2>You may also like</h2>
                  </div>
                  <Link href={listingUrl({ category: product.category_id })}>
                    View all <ArrowRight size={16} />
                  </Link>
                </div>
                <ProductGrid products={related} />
              </section>
            )}

            <div className="bz-detail-sticky" aria-label="Quick buy">
              <div className="bz-detail-sticky-copy">
                <b>{money(product.selling_price)}</b>
                {Number(product.mrp) > Number(product.selling_price) && (
                  <del>{money(product.mrp)}</del>
                )}
                <small>{product.name}</small>
              </div>
              <AddToCart product={product} compact />
            </div>
          </>
        )}
      </main>
      <PageFooter />
    </>
  );
}
