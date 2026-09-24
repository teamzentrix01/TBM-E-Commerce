"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Coffee,
  Grid2X2,
  House,
  Leaf,
  Package,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { EmptyState, ErrorState, Modal, ProductGrid } from "@/components/shop/ShopUI";
import useCatalogStore from "@/components/shop/useCatalogStore";
import {
  fetchProducts,
  fetchStorefrontFacets,
  searchProducts,
} from "@/lib/api";
import { filterPublicFacets, listingUrl, sortProducts, titleCaseLabel } from "@/lib/shop.mjs";

function categoryGlyph(name = "") {
  const label = String(name).trim().toLowerCase();
  if (/^all$/.test(label)) return Grid2X2;
  if (/non[\s-]?food/.test(label)) return Package;
  if (/house|home|clean/.test(label)) return House;
  if (/fruit|vegetable|fresh|produce/.test(label)) return Leaf;
  if (/beverage|drink|tea|coffee/.test(label)) return Coffee;
  if (/personal|beauty|cosmetic|care/.test(label)) return Sparkles;
  if (/food|grocery|staple/.test(label)) return ShoppingBasket;
  return Package;
}

function CategoryRailIcon({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = categoryGlyph(item.name);
  return item.image_url && !imageFailed ? (
    <img src={item.image_url} alt="" onError={() => setImageFailed(true)} />
  ) : (
    <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
  );
}

function Results({ store, query, category, subcategory, brand, sort, attempt }) {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const request = query
      ? searchProducts(store.id, query, { signal: controller.signal })
      : fetchProducts({
          storeId: store.id,
          categoryId: category,
          subCategoryId: subcategory,
          brandId: brand,
          page,
          pageSize: 24,
          signal: controller.signal,
        });
    request
      .then((data) => {
        if (controller.signal.aborted) return;
        let records = (data.records || []).map((product) => ({
          ...product,
          store_id: store.id,
        }));
        if (query)
          records = records.filter(
            (product) =>
              (!category || String(product.category_id) === category) &&
              (!subcategory ||
                String(product.sub_category_id) === subcategory) &&
              (!brand || String(product.brand_id) === brand),
          );
        setProducts((current) => [
          ...new Map(
            (page === 1 ? records : [...current, ...records]).map((item) => [
              String(item.id),
              item,
            ]),
          ).values(),
        ]);
        setTotalPages(query ? 1 : Number(data.totalPages || 1));
        setTotalResults(Number.isFinite(Number(data.total)) ? Number(data.total) : null);
      })
      .catch((failure) => {
        if (failure.name !== "AbortError") setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [store.id, query, category, subcategory, brand, page, retry, attempt]);
  return (
    <>
      <div className="bz-results-count" aria-live="polite">
        {loading && !products.length
          ? "Finding your local favourites…"
          : totalResults != null
            ? `${totalResults.toLocaleString("en-IN")} products`
            : `${products.length.toLocaleString("en-IN")} products shown`}
        {totalResults != null && totalResults > products.length ? (
          <span>Showing {products.length.toLocaleString("en-IN")} so far · sorted items shown</span>
        ) : null}
      </div>
      {error && (
        <ErrorState
          title="We couldn't load products"
          description="Your selected store's inventory couldn't be loaded right now. Please try again."
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      <ProductGrid products={sortProducts(products, sort)} loading={loading} />
      {!loading && !error && !products.length && (
          <EmptyState
            title="No matching products"
          description="Try a different search, category or brand."
          action="Clear filters"
        />
      )}
      {page < totalPages && !query && (
        <div className="bz-load-more">
          <button
            className="bz-button bz-button-light"
            disabled={loading || Boolean(error)}
            onClick={() => setPage((value) => value + 1)}
          >
            {loading ? "Loading…" : "Load more products"}
          </button>
        </div>
      )}
    </>
  );
}

function Listing() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.get("q") || "";
  const category = params.get("category") || "";
  const subcategory = params.get("subcategory") || "";
  const brand = params.get("brand") || "";
  const sort = ["price-low", "price-high", "discount"].includes(
    params.get("sort"),
  )
    ? params.get("sort")
    : "featured";
  const { store, error, retry } = useCatalogStore();
  const [facets, setFacets] = useState({ categories: [], brands: [] });
  const [facetError, setFacetError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!store?.id) return;
    const controller = new AbortController();
    setFacets({ categories: [], brands: [] });
    setFacetError("");
    fetchStorefrontFacets(store.id, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setFacets({
          categories: filterPublicFacets(data.categories || []),
          brands: filterPublicFacets(data.brands || []),
        });
      })
      .catch((failure) => {
        if (failure.name !== "AbortError") setFacetError(failure.message);
      });
    return () => controller.abort();
  }, [store?.id, attempt]);
  function change(key, value) {
    router.push(
      listingUrl({
        q: query,
        category,
        subcategory,
        brand,
        sort,
        [key]: value,
      }),
      {
        scroll: false,
      },
    );
  }
  const activeCategory = facets.categories.find(
    (item) => String(item.id) === category,
  );
  const title = query
    ? `Results for “${query}”`
    : activeCategory?.name
      ? titleCaseLabel(activeCategory.name)
      : facets.brands.find((item) => String(item.id) === brand)?.name ||
        "Shop everyday essentials";
  const popularBrands = [...(facets.brands || [])]
    .sort((a, b) => Number(b.product_count || 0) - Number(a.product_count || 0))
    .slice(0, 12);
  const activeFilterCount = [query, category, subcategory, brand].filter(Boolean).length;
  function filters() {
    return (
      <>
        <div className="bz-filter-title">
          <h2>Filters</h2>
          <Link href="/products" scroll={false}>
            Clear all
          </Link>
        </div>
        {facetError && (
          <div className="bz-error" role="alert">
            Filters unavailable.{" "}
            <button onClick={() => setAttempt((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}
        {[
          {
            key: "category",
            title: "Category",
            records: facets.categories,
            value: category,
          },
          {
            key: "brand",
            title: "Brand",
            records: facets.brands,
            value: brand,
          },
        ].map((group) => (
          <fieldset key={group.key}>
            <legend>{group.title}</legend>
            <div className="bz-filter-options">
              <label>
                <input
                  type="radio"
                  name={`${open ? "mobile" : "desktop"}-${group.key}`}
                  checked={!group.value}
                  onChange={() => change(group.key, "")}
                />
                All {group.key === "brand" ? "brands" : "categories"}
              </label>
              {group.records.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name={`${open ? "mobile" : "desktop"}-${group.key}`}
                    checked={group.value === String(item.id)}
                    onChange={() => change(group.key, String(item.id))}
                  />
                  <span>{item.name}</span>
                  <small>{item.product_count || ""}</small>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </>
    );
  }
  return (
    <>
      <AppHeader search={query} />
      <main className="bz-shell bz-listing">
        <nav className="bz-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} />
          <Link href="/products">Shop</Link>
          {activeCategory?.name ? (
            <>
              <ChevronRight size={14} />
              <span aria-current="page">
                {titleCaseLabel(activeCategory.name)}
              </span>
            </>
          ) : null}
        </nav>
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">YOUR LOCAL STORE, ONLINE</span>
            <h1>{title}</h1>
          </div>
          <label className="bz-sort">
            Sort by
            <select
              value={sort}
              onChange={(event) => change("sort", event.target.value)}
            >
              <option value="featured">Store picks</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="discount">Biggest savings</option>
            </select>
          </label>
        </div>
        <div className="bz-listing-layout">
          <aside className="bz-category-rail" aria-label="Categories">
            <button
              type="button"
              className={`bz-category-rail-item${!category ? " is-active" : ""}`}
              onClick={() => change("category", "")}
            >
              <span className="bz-category-rail-icon" aria-hidden="true">
                <Grid2X2 size={23} strokeWidth={1.8} />
              </span>
              <span>All</span>
            </button>
            {facets.categories.map((item) => {
              const active = category === String(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`bz-category-rail-item${active ? " is-active" : ""}`}
                  onClick={() =>
                    change("category", active ? "" : String(item.id))
                  }
                  title={item.name}
                >
                  <span className="bz-category-rail-icon" aria-hidden="true">
                    <CategoryRailIcon item={item} />
                  </span>
                  <span>{titleCaseLabel(item.name)}</span>
                </button>
              );
            })}
          </aside>
          <section className="bz-results">
            <div className="bz-mobile-listing-tools">
              <button
                className="bz-button bz-button-light bz-mobile-filter"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
              >
                <SlidersHorizontal size={16} />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="bz-filter-count" aria-label={`${activeFilterCount} active filters`}>
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <label className="bz-mobile-sort">
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(event) => change("sort", event.target.value)}
                  aria-label="Sort products"
                >
                  <option value="featured">Recommended</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="discount">Biggest savings</option>
                </select>
              </label>
            </div>
            {popularBrands.length > 0 && (
              <div className="bz-brand-chips" aria-label="Shop by brand">
                <button
                  type="button"
                  className={!brand ? "is-active" : ""}
                  onClick={() => change("brand", "")}
                >
                  All brands
                </button>
                {popularBrands.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={brand === String(item.id) ? "is-active" : ""}
                    onClick={() =>
                      change(
                        "brand",
                        brand === String(item.id) ? "" : String(item.id),
                      )
                    }
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            {(query || category || subcategory || brand) && (
              <div className="bz-filter-chips">
                {[
                  { key: "q", value: query, label: query },
                  {
                    key: "category",
                    value: category,
                    label:
                      facets.categories.find(
                        (item) => String(item.id) === category,
                      )?.name || "Category",
                  },
                  {
                    key: "subcategory",
                    value: subcategory,
                    label: "Subcategory",
                  },
                  {
                    key: "brand",
                    value: brand,
                    label:
                      facets.brands.find((item) => String(item.id) === brand)
                        ?.name || "Brand",
                  },
                ]
                  .filter((item) => item.value)
                  .map((item) => (
                    <button key={item.key} onClick={() => change(item.key, "")}>
                      {item.label}
                      <X size={14} />
                      <span className="bz-sr-only">Remove filter</span>
                    </button>
                  ))}
              </div>
            )}
            {error ? (
              <div className="bz-notice" role="alert">
                <p>{error}</p>
                <button className="bz-button" onClick={retry}>
                  Try again
                </button>
              </div>
            ) : store?.id ? (
              <Results
                key={`${store.id}:${query}:${category}:${subcategory}:${brand}`}
                store={store}
                query={query}
                category={category}
                subcategory={subcategory}
                brand={brand}
                sort={sort}
                attempt={attempt}
              />
            ) : (
              <ProductGrid products={[]} loading />
            )}
          </section>
        </div>
      </main>
      <PageFooter />
      {open && (
        <Modal
          title="Refine your search"
          className="bz-filter-dialog"
          onClose={() => setOpen(false)}
        >
          {filters()}
          <button className="bz-button bz-full" onClick={() => setOpen(false)}>
            Show products
          </button>
        </Modal>
      )}
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <main className="bz-shell">
            <ProductGrid products={[]} loading />
        </main>
      }
    >
      <Listing />
    </Suspense>
  );
}
