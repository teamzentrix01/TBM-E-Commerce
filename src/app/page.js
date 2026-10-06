"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  Gift,
  PackageCheck,
  ShoppingBasket,
  Sparkles,
  Truck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { ErrorState, ProductGrid, ProductImage } from "@/components/shop/ShopUI";
import useCatalogStore from "@/components/shop/useCatalogStore";
import { fetchCategories, fetchProducts, fetchStorefrontBanners, fetchStorefrontFacets, fetchStorefrontHampers } from "@/lib/api";
import { resolveHomeBanners } from "@/lib/banners.mjs";
import {
  buildShopCategories,
  listingUrl,
  sortProducts,
} from "@/lib/shop.mjs";

function promoCardIcon(card) {
  const key = `${card.id || ""} ${card.title || ""} ${card.href || ""}`.toLowerCase();
  if (key.includes("hamper") || key.includes("gift")) {
    return <Gift size={42} strokeWidth={1.4} />;
  }
  if (key.includes("saving") || key.includes("deal") || key.includes("discount")) {
    return <BadgePercent size={42} strokeWidth={1.4} />;
  }
  return <ShoppingBasket size={42} strokeWidth={1.4} />;
}

export default function Home() {
  const router = useRouter();
  const { store, ready, error: storeError, retry } = useCatalogStore();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [categoryCovers, setCategoryCovers] = useState({});
  const [banners, setBanners] = useState(() => resolveHomeBanners(null));
  const [readyPacks, setReadyPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [nextPage, setNextPage] = useState(2);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [visibleSavingsCount, setVisibleSavingsCount] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreProductsError, setMoreProductsError] = useState(false);
  const [promoIndex, setPromoIndex] = useState(0);
  const [promoCarousel, setPromoCarousel] = useState(false);
  const [recentProducts, setRecentProducts] = useState([]);

  useEffect(() => {
    try {
      setRecentProducts(JSON.parse(localStorage.getItem("tbm-recent-products") || "[]"));
    } catch {
      setRecentProducts([]);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) router.replace(listingUrl({ q }));
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!store?.id) {
      setLoading(false);
      setProducts([]);
      setCategories([]);
      setSubCategories([]);
      setCategoryCovers({});
      setBanners(resolveHomeBanners(null));
      setReadyPacks([]);
      setHasMoreProducts(false);
      setVisibleSavingsCount(8);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setProducts([]);
    setNextPage(2);
    setHasMoreProducts(false);
    setVisibleSavingsCount(8);
    setLoadingMore(false);
    setMoreProductsError(false);
    setSubCategories([]);
    setCategoryCovers({});
    fetchStorefrontFacets(store.id, { signal: controller.signal })
      .then((facetData) => {
        if (cancelled) return;
        const nextCategories = facetData?.categories || [];
        setSubCategories(facetData?.subCategories || []);
        if (nextCategories.length) {
          setCategories(nextCategories);
          return;
        }
        return fetchCategories(store.id).then((categoryData) => {
          if (!cancelled) setCategories(categoryData?.records || []);
        });
      })
      .catch((failure) => {
        if (cancelled || failure?.name === "AbortError") return;
        fetchCategories(store.id)
          .then((categoryData) => {
            if (!cancelled) setCategories(categoryData?.records || []);
          })
          .catch(() => {});
      });
    fetchStorefrontBanners(store.id, { signal: controller.signal })
      .then((bannerData) => {
        if (!cancelled) setBanners(resolveHomeBanners(bannerData));
      })
      .catch(() => {
        if (!cancelled) setBanners(resolveHomeBanners(null));
      });
    fetchStorefrontHampers(store.id, { signal: controller.signal })
      .then((hamperData) => {
        if (cancelled) return;
        setReadyPacks(
          (hamperData?.packs || []).filter(
            (pack) => pack.kind === "ready" || !pack.kind || pack.kind === "occasion",
          ),
        );
      })
      .catch(() => {});
    fetchProducts({
      storeId: store.id,
      pageSize: 24,
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled) return;
        setProducts(
          (data.records || []).map((product) => ({
            ...product,
            store_id: store.id,
          })),
        );
        setNextPage(2);
        setHasMoreProducts(Number(data.totalPages || 1) > 1);
        setVisibleSavingsCount(8);
        setMoreProductsError(false);
      })
      .catch((failure) => {
        if (!cancelled && failure.name !== "AbortError")
          setError(failure.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ready, store?.id, attempt]);

  async function loadMoreProducts() {
    if (!store?.id || loadingMore) return;
    const retrying = moreProductsError;
    const targetCount = retrying
      ? visibleSavingsCount
      : visibleSavingsCount + 8;
    if (!retrying) setVisibleSavingsCount(targetCount);
    setLoadingMore(true);
    setMoreProductsError(false);
    try {
      if (targetCount >= products.length && hasMoreProducts) {
        const data = await fetchProducts({
          storeId: store.id,
          page: nextPage,
          pageSize: 24,
        });
        const nextRecords = (data.records || []).map((product) => ({
          ...product,
          store_id: store.id,
        }));
        setProducts((current) => [
          ...new Map(
            [...current, ...nextRecords].map((product) => [
              String(product.id),
              product,
            ]),
          ).values(),
        ]);
        setNextPage(nextPage + 1);
        setHasMoreProducts(nextPage < Number(data.totalPages || nextPage));
      }
    } catch {
      setMoreProductsError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const picks = sortProducts(products, "featured");
  const savings = sortProducts(products, "discount");
  const images = savings.filter((product) => product.image_url).slice(0, 3);
  const hamperPreviewItems = products.filter((product) => product.image_url).slice(0, 4);
  const showCatalogLoading = !ready || (loading && !products.length);
  const shopCategories = buildShopCategories({
    categories,
    subCategories,
    products,
    limit: 32,
  });
  const coverKey = shopCategories
    .filter((category) => category.kind === "subcategory" && !category.imageProduct)
    .map((category) => String(category.id))
    .join(",");

  useEffect(() => {
    if (!store?.id || !coverKey) return undefined;
    const missingIds = coverKey.split(",");
    let cancelled = false;
    Promise.all(
      missingIds.map(async (id) => {
        try {
          const data = await fetchProducts({
            storeId: store.id,
            subCategoryId: id,
            pageSize: 6,
          });
          const product =
            (data.records || []).find((item) => item.image_url) || null;
          return [id, product];
        } catch {
          return [id, null];
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setCategoryCovers((current) => {
        const next = { ...current };
        for (const [id, product] of pairs) next[id] = product;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [store?.id, coverKey]);
  const { hero, promoCards, strip } = banners;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 801px)");
    const sync = () => setPromoCarousel(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setPromoIndex(0);
  }, [promoCards.length]);

  useEffect(() => {
    if (!promoCarousel || promoCards.length < 2) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return undefined;
    const timer = window.setInterval(() => {
      setPromoIndex((current) => (current + 1) % promoCards.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [promoCarousel, promoCards.length]);

  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-home">
        {strip ? (
          <Link
            href={strip.href || "/products"}
            className={`bz-festival-strip bz-promo-${strip.tone || "red"}`}
          >
            <span>{strip.eyebrow || "FESTIVE OFFER"}</span>
            <strong>{strip.title}</strong>
            <em>{strip.cta || "Shop now"}</em>
          </Link>
        ) : null}

        <div className="bz-home-featured">
          <section
            className={`bz-hero bz-hero-banner${hero.image_url ? " has-banner-image" : ""}`}
            style={
              hero.image_url
                ? { "--bz-hero-image": `url(${hero.image_url})` }
                : undefined
            }
          >
          <div className="bz-hero-copy">
            <span className="bz-eyebrow">{hero.eyebrow}</span>
            <h1>{hero.title}</h1>
            <p>{hero.subtitle}</p>
            <div className="bz-hero-actions">
              <Link className="bz-button bz-button-light" href={hero.href}>
                {hero.cta} <ArrowRight size={17} />
              </Link>
            </div>
          </div>
          <div
            className="bz-hero-art"
            aria-hidden={hero.image_url || images.length ? undefined : true}
          >
            {hero.image_url ? (
              <div className="bz-hero-banner-image">
                <img src={hero.image_url} alt="" />
              </div>
            ) : images.length ? (
              images.map((product, index) => (
                <Link
                  href={"/product/" + product.id}
                  className={"bz-hero-product bz-hero-product-" + index}
                  key={product.id}
                >
                  <ProductImage product={product} eager />
                </Link>
              ))
            ) : (
              <div className="bz-hero-basket">
                <ShoppingBasket size={96} strokeWidth={1.2} />
                <span>
                  Fresh picks.
                  <br />
                  <b>Closer to home.</b>
                </span>
              </div>
            )}
          </div>
          </section>

          <section
            className="bz-promo-carousel"
            aria-label="Featured offers"
            aria-roledescription={promoCarousel ? "carousel" : undefined}
          >
          <div
            className="bz-promo-grid"
            style={promoCarousel ? { "--bz-promo-index": promoIndex } : undefined}
          >
            {promoCards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className={"bz-promo-card bz-promo-" + card.tone}
              >
                <div>
                  <h2>{card.title}</h2>
                  <p>{card.subtitle}</p>
                  <span>{card.cta}</span>
                </div>
                {card.image_url ? (
                  <span className="bz-promo-card-media">
                    <img src={card.image_url} alt="" />
                  </span>
                ) : (
                  promoCardIcon(card)
                )}
              </Link>
            ))}
          </div>
          {promoCarousel && promoCards.length > 1 ? (
            <div className="bz-promo-dots" aria-label="Choose featured offer">
              {promoCards.map((card, index) => (
                <button
                  key={card.id}
                  type="button"
                  className={index === promoIndex ? "is-active" : ""}
                  aria-label={`Show offer ${index + 1}: ${card.title}`}
                  aria-current={index === promoIndex ? "true" : undefined}
                  onClick={() => setPromoIndex(index)}
                />
              ))}
            </div>
          ) : null}
          </section>
        </div>

        <section id="categories" className="bz-category-section">
          <div className="bz-section-heading">
            <div>
              <span className="bz-eyebrow">SHOP BY CATEGORY</span>
              <h2>Grocery & everyday essentials</h2>
            </div>
            <Link href="/products">
              See all <ArrowRight size={16} />
            </Link>
          </div>
          <div className="bz-categories bz-categories-grid">
            <Link href="/hamper" className="bz-category-tile bz-category-special">
              <span className="bz-category-icon bz-tone-hamper">
                <Gift size={32} strokeWidth={1.5} />
              </span>
              <b>Gift hampers</b>
            </Link>
            {shopCategories.map((category, index) => {
              const product =
                categoryCovers[String(category.id)] ||
                category.imageProduct ||
                products.find(
                  (item) =>
                    (category.kind === "subcategory"
                      ? String(item.sub_category_id) === String(category.id)
                      : String(item.category_id) === String(category.id)) &&
                    item.image_url,
                );
              const href =
                category.kind === "subcategory"
                  ? listingUrl({
                      category: category.categoryId,
                      subcategory: category.id,
                    })
                  : listingUrl({ category: category.id });
              return (
                <Link
                  key={`${category.kind}-${category.id}`}
                  href={href}
                  className="bz-category-tile"
                >
                  <span className={"bz-category-icon bz-tone-" + (index % 6)}>
                    {product ? (
                      <ProductImage product={product} />
                    ) : (
                      <ShoppingBasket size={28} strokeWidth={1.4} />
                    )}
                  </span>
                  <b>{category.name}</b>
                </Link>
              );
            })}
            {showCatalogLoading &&
              !shopCategories.length &&
              Array.from({ length: 12 }, (_, i) => (
                <div className="bz-category-skeleton" key={i} />
              ))}
          </div>
        </section>

        <section className="bz-hamper-teaser">
          <div className="bz-hamper-teaser-art" aria-hidden="true">
            <span className="bz-hamper-teaser-tag">
              <Gift size={15} /> READY TO GIFT
            </span>
            <div className="bz-hamper-teaser-products">
              {hamperPreviewItems.length ? (
                hamperPreviewItems.map((product) => (
                  <span className="bz-hamper-teaser-product" key={product.id}>
                    <ProductImage product={product} />
                  </span>
                ))
              ) : (
                <span className="bz-hamper-teaser-gift">
                  <Gift size={38} strokeWidth={1.5} />
                  <b>Gift box</b>
                </span>
              )}
            </div>
            <div className="bz-hamper-teaser-basket">
              <span />
            </div>
            <span className="bz-hamper-teaser-ribbon" />
          </div>
          <div className="bz-hamper-teaser-copy">
            <span className="bz-eyebrow">
              <Gift size={15} /> GIFT HAMPERS
            </span>
            <h2>Send a hamper made your way</h2>
            <p>
              Pick a ready-made gift box or build one with local favourites and
              add a personal message.
            </p>
            <div className="bz-hamper-chips">
              {readyPacks.slice(0, 3).map((pack) => (
                <Link key={pack.id} href={`/hamper?tab=ready&pack=${pack.id}`}>
                  {pack.title}
                </Link>
              ))}
              <Link className="is-primary" href="/hamper?tab=customise">
                Build a hamper <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {(error || storeError) && (
          <ErrorState
            title={storeError ? "We couldn't find a store for this area" : "We couldn't load products"}
            description={storeError
              ? "Choose another delivery location or try again."
              : "Your selected store's inventory couldn't be loaded right now."}
            onRetry={() => {
              retry();
              setAttempt((value) => value + 1);
            }}
          />
        )}

        <section className="bz-section">
          <div className="bz-section-heading">
            <div>
              <span className="bz-eyebrow">PICKED FOR YOU</span>
              <h2>Bestsellers near you</h2>
            </div>
            <Link href="/products">
              View all <ArrowRight size={16} />
            </Link>
          </div>
          <ProductGrid
            products={picks.slice(0, 8)}
            loading={showCatalogLoading && !storeError}
          />
          {!showCatalogLoading && !error && !products.length && (
            <p className="bz-muted">
              No products are available for this location yet. Choose another
              delivery pincode to browse.
            </p>
          )}
        </section>

        <section className="bz-section bz-deals-section">
          <div className="bz-section-heading">
            <div>
              <span className="bz-eyebrow">
                <BadgePercent size={14} /> BIGGEST SAVINGS
              </span>
              <h2>Deals from your store</h2>
            </div>
            <Link href="/products?sort=discount">
              Explore savings <ArrowRight size={16} />
            </Link>
          </div>
          <div className="bz-deals-carousel">
            <ProductGrid
              products={savings.slice(0, visibleSavingsCount)}
              loading={showCatalogLoading && !storeError && !savings.length}
            />
          </div>
          {moreProductsError ? (
            <p className="bz-load-more-error" role="alert">
              Could not load more products. Please try again.
            </p>
          ) : null}
          {visibleSavingsCount < savings.length || hasMoreProducts ? (
            <div className="bz-load-more">
              <button
                className="bz-button bz-button-light"
                type="button"
                onClick={loadMoreProducts}
                disabled={loadingMore}
              >
                {loadingMore
                  ? "Loading more products…"
                  : moreProductsError
                    ? "Try again"
                    : "Load more products"}
              </button>
            </div>
          ) : null}
        </section>

        {recentProducts.filter((item) => !store?.id || String(item.store_id) === String(store.id)).length ? (
          <section className="bz-section bz-recent-section">
            <div className="bz-section-heading">
              <div><span className="bz-eyebrow">CONTINUE BROWSING</span><h2>Recently viewed</h2></div>
            </div>
            <div className="bz-horizontal-products"><ProductGrid products={recentProducts.filter((item) => !store?.id || String(item.store_id) === String(store.id)).slice(0, 6)} /></div>
          </section>
        ) : null}

        <section className="bz-benefits" aria-label="Shopping with Buyzaar">
          <div>
            <Truck />
            <span>
              <b>Delivered locally</b>
              <small>From your neighbourhood mart</small>
            </span>
          </div>
          <div>
            <BadgePercent />
            <span>
              <b>Everyday value</b>
              <small>Prices from your selected store</small>
            </span>
          </div>
          <div>
            <PackageCheck />
            <span>
              <b>Live availability</b>
              <small>Stock checked when you shop</small>
            </span>
          </div>
          <div>
            <Sparkles />
            <span>
              <b>Gift hampers</b>
              <small>Ready packs or customise</small>
            </span>
          </div>
        </section>
      </main>
      <PageFooter />
    </>
  );
}
