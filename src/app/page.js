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
import { fetchCategories, fetchProducts, fetchStorefrontBanners, fetchStorefrontHampers } from "@/lib/api";
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
  const [banners, setBanners] = useState(() => resolveHomeBanners(null));
  const [readyPacks, setReadyPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

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
      setBanners(resolveHomeBanners(null));
      setReadyPacks([]);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      fetchProducts({
        storeId: store.id,
        pageSize: 48,
        signal: controller.signal,
      }),
      fetchCategories(store.id),
      fetchStorefrontBanners(store.id, { signal: controller.signal }).catch(
        () => null,
      ),
      fetchStorefrontHampers(store.id, { signal: controller.signal }).catch(
        () => null,
      ),
    ])
      .then(([data, categoryData, bannerData, hamperData]) => {
        if (cancelled) return;
        setProducts(
          (data.records || []).map((product) => ({
            ...product,
            store_id: store.id,
          })),
        );
        setCategories(categoryData.records || []);
        setBanners(resolveHomeBanners(bannerData));
        setReadyPacks(
          (hamperData?.packs || []).filter(
            (pack) => pack.kind === "ready" || !pack.kind || pack.kind === "occasion",
          ),
        );
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

  const picks = sortProducts(products, "featured");
  const savings = sortProducts(products, "discount").slice(0, 8);
  const images = savings.filter((product) => product.image_url).slice(0, 3);
  const showCatalogLoading = !ready || (loading && !products.length);
  const shopCategories = buildShopCategories({
    categories,
    products,
    limit: 20,
  });
  const { hero, promoCards, strip } = banners;

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

        <section className="bz-promo-grid" aria-label="Featured offers">
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
        </section>

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
          <div>
            <span className="bz-eyebrow">
              <Gift size={15} /> MULTI-OPTION GIFT HAMPERS
            </span>
            <h2>Ready packs or customise your own</h2>
            <p>
              Build thoughtful gift boxes from the same local store catalogue —
              by budget, occasion, or fully your way.
            </p>
            <div className="bz-hamper-chips">
              {readyPacks.slice(0, 3).map((pack) => (
                <Link key={pack.id} href={`/hamper?tab=ready&pack=${pack.id}`}>
                  {pack.title}
                </Link>
              ))}
              <Link className="is-primary" href="/hamper?tab=customise">
                Customise <ArrowRight size={14} />
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

        <section className="bz-section">
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
          <ProductGrid
            products={savings}
            loading={showCatalogLoading && !storeError && !savings.length}
          />
        </section>

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
