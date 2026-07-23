"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  ListFilter,
  MapPin,
  Menu,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import {
  fetchCategories,
  fetchProducts,
  fetchStorefrontFacets,
  resolveStoreByPincode,
  searchProducts,
} from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { PageFooter } from "@/components/AppHeader";

const DEFAULT_PINCODE = "201304";
const DELIVERY_FEE = 39;
const FREE_DELIVERY_MINIMUM = 499;

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function ProductImage({ product, compact = false }) {
  if (product.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={product.name}
        className="product-image"
        loading="lazy"
        src={product.image_url}
      />
    );
  }
  return (
    <div className={`product-placeholder ${compact ? "compact" : ""}`}>
      <ShoppingBag size={compact ? 20 : 34} strokeWidth={1.6} />
      <span>{product.name}</span>
    </div>
  );
}

function QuantityControl({ product, quantity, onUpdate }) {
  return (
    <div className="qty-control" aria-label={`Quantity for ${product.name}`}>
      <button
        aria-label={`Remove one ${product.name}`}
        onClick={() => onUpdate(product, -1)}
      >
        {quantity === 1 ? <Trash2 /> : <Minus />}
      </button>
      <b>{quantity}</b>
      <button
        aria-label={`Add one ${product.name}`}
        disabled={quantity >= Math.floor(Number(product.stock || 0))}
        onClick={() => onUpdate(product, 1)}
      >
        <Plus />
      </button>
    </div>
  );
}

export default function Home() {
  const {
    activeStore,
    cart,
    cartCount,
    cartSavings,
    cartTotal,
    pincode,
    ready,
    removeFromCart,
    selectStore,
    setPincode,
    storeVerified,
    toggleWishlist,
    updateCart,
    wishlist,
  } = useStore();
  const [categories, setCategories] = useState([]);
  const [facets, setFacets] = useState({
    brands: [],
    categories: [],
    subCategories: [],
    product_count: 0,
  });
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [sort, setSort] = useState("featured");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [status, setStatus] = useState("Choose your delivery location");
  const [locationOpen, setLocationOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogTab, setCatalogTab] = useState("categories");
  const [filterOpen, setFilterOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [quickView, setQuickView] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [toast, setToast] = useState(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);
  const [draftPincode, setDraftPincode] = useState(DEFAULT_PINCODE);
  const toastTimer = useRef(null);

  useEffect(() => {
    if (!ready) return;
    const query = new URLSearchParams(window.location.search).get("q");
    if (query) setSearch(query);
    setDraftPincode(pincode || DEFAULT_PINCODE);

    let cancelled = false;
    async function initialize() {
      setLoading(true);
      try {
        if (!activeStore) {
          const resolved = await resolveStoreByPincode(
            pincode || DEFAULT_PINCODE,
          );
          if (!cancelled) {
            selectStore(resolved.store, pincode || DEFAULT_PINCODE);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initialize();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!activeStore?.id) return;
    const controller = new AbortController();
    setCatalogLoading(true);
    Promise.all([
      fetchCategories(activeStore.id),
      fetchStorefrontFacets(activeStore.id, { signal: controller.signal }),
    ])
      .then(([categoryData, facetData]) => {
        setCategories(categoryData.records || facetData.categories || []);
        setFacets(facetData);
        setStatus(`Delivering from ${activeStore.name}`);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus(error.message);
      })
      .finally(() => setCatalogLoading(false));
    return () => controller.abort();
  }, [activeStore?.id]);

  useEffect(() => {
    setPage(1);
    setProducts([]);
  }, [activeStore?.id, brandId, categoryId, search]);

  useEffect(() => {
    if (!activeStore?.id) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = search.trim()
          ? await searchProducts(activeStore.id, search, {
              signal: controller.signal,
            })
          : await fetchProducts({
              storeId: activeStore.id,
              categoryId,
              brandId,
              page,
              pageSize: 36,
              signal: controller.signal,
            });
        const nextRecords = (data.records || []).map((product) => ({
          ...product,
          store_id: activeStore.id,
        }));
        setProducts((current) =>
          page === 1 ? nextRecords : [...current, ...nextRecords],
        );
        setTotalPages(search.trim() ? 1 : data.totalPages || 1);
      } catch (error) {
        if (error.name !== "AbortError") setStatus(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search.trim() ? 300 : 80);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeStore?.id, brandId, categoryId, page, search]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setHeroIndex((current) => current + 1),
      5000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const modalOpen = locationOpen || catalogOpen || filterOpen || quickView;
    document.body.style.overflow = modalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [catalogOpen, filterOpen, locationOpen, quickView]);

  const sortedProducts = useMemo(() => {
    const next = [...products];
    if (sort === "price-low") {
      next.sort((a, b) => a.selling_price - b.selling_price);
    } else if (sort === "price-high") {
      next.sort((a, b) => b.selling_price - a.selling_price);
    } else if (sort === "discount") {
      next.sort((a, b) => b.discount_percent - a.discount_percent);
    }
    return next;
  }, [products, sort]);

  const featuredProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.discount_percent - a.discount_percent)
        .slice(0, 4),
    [products],
  );

  const heroSlides = [
    {
      kicker: "Fresh savings, every day",
      title: "Your neighbourhood mart, now at your doorstep.",
      copy: storeVerified && activeStore
        ? `Shop live inventory and local prices from ${activeStore.name}.`
        : "Browse freely. We verify a nearby store only when you add to cart.",
      action: "Shop today's deals",
    },
    {
      kicker: "Store-wise availability",
      title: "What you see is what your local store has.",
      copy: `${facets.product_count || products.length} products available for ${
        pincode || "your location"
      }.`,
      action: "Explore categories",
    },
    {
      kicker: "More value in every basket",
      title: "Top brands. Honest prices. Easy local delivery.",
      copy: `Discover ${facets.brands.length || "all"} brands selected for your nearest store.`,
      action: "Browse brands",
    },
  ];
  const activeHero = heroSlides[heroIndex % heroSlides.length];

  const quantityFor = (productId) =>
    cart.find((item) => String(item.id) === String(productId))?.qty || 0;
  const selectedCategory = categories.find(
    (item) => String(item.id) === String(categoryId),
  );
  const selectedBrand = facets.brands.find(
    (item) => String(item.id) === String(brandId),
  );
  const deliveryFee =
    cartTotal >= FREE_DELIVERY_MINIMUM || cartTotal === 0 ? 0 : DELIVERY_FEE;
  const freeDeliveryRemaining = Math.max(
    FREE_DELIVERY_MINIMUM - cartTotal,
    0,
  );

  function notify(message, product = null) {
    setToast({ message, product });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  function addProduct(product) {
    const currentQuantity = quantityFor(product.id);
    if (currentQuantity >= Math.floor(Number(product.stock || 0))) {
      notify("Maximum available stock is already in your cart");
      return;
    }
    if (!updateCart(product, 1)) return;
    setRecentlyAddedId(product.id);
    window.setTimeout(() => setRecentlyAddedId(null), 650);
    notify("This product has been added to your cart", product);
  }

  function chooseCategory(category) {
    setCategoryId(category ? String(category.id) : "");
    setBrandId("");
    setSearch("");
    setCatalogOpen(false);
    setFilterOpen(false);
    window.setTimeout(
      () => document.getElementById("products")?.scrollIntoView(),
      80,
    );
  }

  function chooseBrand(brand) {
    setBrandId(brand ? String(brand.id) : "");
    setCategoryId("");
    setSearch("");
    setCatalogOpen(false);
    setFilterOpen(false);
    window.setTimeout(
      () => document.getElementById("products")?.scrollIntoView(),
      80,
    );
  }

  async function applyPincode(event) {
    event.preventDefault();
    if (draftPincode.length !== 6) return;
    setLoading(true);
    setStatus("Finding your nearest store...");
    try {
      const data = await resolveStoreByPincode(draftPincode);
      selectStore(data.store, draftPincode);
      setCategoryId("");
      setBrandId("");
      setSearch("");
      setLocationOpen(false);
      notify(`Store changed to ${data.store.name}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  function chooseStore(store) {
    selectStore(store, store.pincode);
    setDraftPincode(store.pincode);
    setCategoryId("");
    setBrandId("");
    setSearch("");
    setLocationOpen(false);
    notify(`Now shopping from ${store.name}`);
  }

  function clearFilters() {
    setSearch("");
    setCategoryId("");
    setBrandId("");
    setSort("featured");
  }

  return (
    <main className="storefront storefront-v2">
      <div className="service-strip">
        <span>
          <ShieldCheck size={15} /> Genuine products
        </span>
        <span>
          <Truck size={15} /> Local store delivery
        </span>
        <span>
          <PackageCheck size={15} /> Live inventory and pricing
        </span>
      </div>

      <header className="site-header storefront-header">
        <div className="header-main">
          <button
            className="back-button storefront-back"
            aria-label="Go back"
            onClick={() => window.history.back()}
          >
            <ArrowLeft />
            <span>Back</span>
          </button>
          <button
            className="icon-button mobile-only"
            aria-label="Open navigation"
            onClick={() => setMobileMenu((current) => !current)}
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
          <Link className="brand" href="/" aria-label="The Buyzaar Mart home">
            <img
              className="brand-logo"
              src="/buyzaar-logo.png"
              alt="The Buyzaar Mart"
            />
          </Link>

          <button
            className="location-button"
            onClick={() =>
              notify(
                storeVerified
                  ? "Your delivery location is verified"
                  : "Your current location will be verified when you add a product",
              )
            }
          >
            <MapPin />
            <span>
              <small>Deliver to</small>
              <b>
                {storeVerified && activeStore
                  ? `${activeStore.city} ${pincode || activeStore.pincode}`
                  : "Verify on add to cart"}
              </b>
            </span>
            <ChevronDown size={16} />
          </button>

          <label className="search-box">
            <Search />
            <input
              aria-label="Search products, brands and categories"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products, brands and categories"
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch("")}>
                <X size={18} />
              </button>
            )}
          </label>

          <nav className={`header-actions ${mobileMenu ? "is-open" : ""}`}>
            <Link href="/orders">
              <PackageCheck />
              <span>Orders</span>
            </Link>
            <Link href="/account">
              <UserRound />
              <span>Account</span>
            </Link>
            <Link href="/wishlist">
              <Heart />
              <span>Saved</span>
              {wishlist.length > 0 && <em>{wishlist.length}</em>}
            </Link>
            <button className="cart-button" onClick={() => setCartOpen(true)}>
              <ShoppingCart />
              <span>Cart</span>
              {cartCount > 0 && <em>{cartCount}</em>}
            </button>
          </nav>
        </div>
        <div className="mobile-search">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search local products"
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X />
            </button>
          )}
        </div>
      </header>

      <nav className="catalog-nav" aria-label="Shop navigation">
        <button
          className="all-categories-button"
          onClick={() => {
            setCatalogTab("categories");
            setCatalogOpen(true);
          }}
        >
          <ListFilter /> Shop by category <ChevronDown />
        </button>
        <div className="catalog-nav-scroll">
          <button
            className={!categoryId && !brandId && !search ? "active" : ""}
            onClick={clearFilters}
          >
            All products
          </button>
          {categories.slice(0, 8).map((category) => (
            <button
              className={
                String(category.id) === String(categoryId) ? "active" : ""
              }
              key={category.id}
              onClick={() => chooseCategory(category)}
            >
              {category.name}
            </button>
          ))}
          <button
            onClick={() => {
              setCatalogTab("brands");
              setCatalogOpen(true);
            }}
          >
            Top brands
          </button>
        </div>
      </nav>

      <section className="hero-banner storefront-hero">
        <div className="hero-copy" key={`copy-${heroIndex % heroSlides.length}`}>
          <span>{activeHero.kicker}</span>
          <h1>{activeHero.title}</h1>
          <p>{activeHero.copy}</p>
          <div className="hero-ctas">
            <a href="#products">
              {activeHero.action} <ArrowRight />
            </a>
            <button onClick={() => setLocationOpen(true)}>
              <MapPin /> {pincode || "Choose pincode"}
            </button>
          </div>
        </div>
        <div
          className="hero-products-v2"
          key={`products-${heroIndex % heroSlides.length}`}
          aria-label="Featured products"
        >
          {featuredProducts.length ? (
            featuredProducts.map((product, index) => (
              <button
                className={`hero-tile hero-tile-${index + 1}`}
                key={product.id}
                onClick={() => setQuickView(product)}
              >
                {product.discount_percent > 0 && (
                  <em>{Math.round(product.discount_percent)}% off</em>
                )}
                <ProductImage product={product} compact />
                <span>{product.name}</span>
                <b>{money(product.selling_price)}</b>
              </button>
            ))
          ) : (
            <div className="hero-store-promise">
              <Store />
              <b>
                {storeVerified
                  ? activeStore?.name
                  : "Your nearest Buyzaar Mart"}
              </b>
              <span>{loading ? "Loading live inventory..." : status}</span>
            </div>
          )}
        </div>
        <div className="hero-controls">
          <button
            aria-label="Previous offer"
            onClick={() =>
              setHeroIndex(
                (current) => current + heroSlides.length - 1,
              )
            }
          >
            <ChevronLeft />
          </button>
          {heroSlides.map((slide, index) => (
            <button
              key={slide.kicker}
              className={
                index === heroIndex % heroSlides.length ? "active" : ""
              }
              aria-label={`Show ${slide.kicker}`}
              onClick={() => setHeroIndex(index)}
            />
          ))}
          <button
            aria-label="Next offer"
            onClick={() => setHeroIndex((current) => current + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </section>

      <section className="retail-category-strip" aria-label="Popular categories">
        {categories.slice(0, 7).map((category, index) => (
          <button key={category.id} onClick={() => chooseCategory(category)}>
            <span className={`retail-category-icon category-tone-${index + 1}`}>
              <ShoppingBag />
            </span>
            <span>
              <b>{category.name}</b>
              <small>{category.product_count || 0} products</small>
            </span>
          </button>
        ))}
        <button
          className="retail-see-all"
          onClick={() => {
            setCatalogTab("categories");
            setCatalogOpen(true);
          }}
        >
          <span className="retail-category-icon">
            <ArrowRight />
          </span>
          <span>
            <b>See all</b>
            <small>Categories & brands</small>
          </span>
        </button>
      </section>

      {products.length > 0 && !search && !categoryId && !brandId && (
        <section className="market-promo-grid" aria-label="Store offers">
          <button
            className="market-promo market-promo-primary"
            onClick={() => setQuickView(products[0])}
          >
            <span>
              <small>WEEKLY MART DROP</small>
              <strong>Fresh picks at local-store prices</strong>
              <b>
                {products[0].discount_percent > 0
                  ? `Save ${Math.round(products[0].discount_percent)}% on ${products[0].name}`
                  : `Shop ${products[0].name} from your nearby store`}
              </b>
              <em>
                Shop offer <ArrowRight />
              </em>
            </span>
            <div>
              <ProductImage product={products[0]} compact />
            </div>
          </button>
          <button
            className="market-promo market-promo-secondary"
            onClick={() =>
              products[1] ? setQuickView(products[1]) : setCatalogOpen(true)
            }
          >
            <span>
              <small>FAST BASKET</small>
              <strong>Build today&apos;s essentials faster</strong>
              <b>
                {facets.product_count || products.length} live items matched to{" "}
                {pincode || "your pincode"}.
              </b>
              <em>
                Explore now <ArrowRight />
              </em>
            </span>
            <div>
              {products[1] ? (
                <ProductImage product={products[1]} compact />
              ) : (
                <ShoppingBag />
              )}
            </div>
          </button>
          <button
            className="market-promo market-promo-mini"
            onClick={() => {
              setCatalogTab("brands");
              setCatalogOpen(true);
            }}
          >
            <BadgePercent />
            <span>
              <small>BRANDS</small>
              <strong>{facets.brands.length || "All"} trusted labels</strong>
            </span>
          </button>
          <button
            className="market-promo market-promo-mini"
            onClick={() => setLocationOpen(true)}
          >
            <MapPin />
            <span>
              <small>DELIVERY</small>
              <strong>{pincode || "Choose"} service area</strong>
            </span>
          </button>
        </section>
      )}

      <section className="assurance-row">
        <div>
          <Truck />
          <span>
            <b>Local delivery</b>
            <small>From your selected store</small>
          </span>
        </div>
        <div>
          <BadgePercent />
          <span>
            <b>Everyday value</b>
            <small>Latest store-wise prices</small>
          </span>
        </div>
        <div>
          <PackageCheck />
          <span>
            <b>Live availability</b>
            <small>Only saleable stock is shown</small>
          </span>
        </div>
        <div>
          <ShieldCheck />
          <span>
            <b>Quality assured</b>
            <small>Trusted household brands</small>
          </span>
        </div>
      </section>

      {products.length > 0 && !search && !categoryId && !brandId && (
        <>
          <section className="retail-shelf">
            <div className="retail-section-head">
              <div>
                <span>POPULAR NEAR YOU</span>
                <h2>You might need</h2>
              </div>
              <a href="#products">
                See more <ArrowRight />
              </a>
            </div>
            <div className="retail-product-row">
              {products.slice(0, 8).map((product) => {
                const quantity = quantityFor(product.id);
                return (
                  <article className="retail-mini-product" key={product.id}>
                    <button
                      className="retail-mini-media"
                      onClick={() => setQuickView(product)}
                    >
                      <ProductImage product={product} compact />
                    </button>
                    <small>
                      {product.brand_name ||
                        product.category_name ||
                        "The Buyzaar Mart"}
                    </small>
                    <button
                      className="retail-mini-name"
                      onClick={() => setQuickView(product)}
                    >
                      {product.name}
                    </button>
                    <div className="retail-mini-bottom">
                      <span>
                        <b>{money(product.selling_price)}</b>
                        {product.mrp > product.selling_price && (
                          <del>{money(product.mrp)}</del>
                        )}
                      </span>
                      {quantity === 0 ? (
                        <button
                          aria-label={`Add ${product.name}`}
                          onClick={() => addProduct(product)}
                        >
                          <Plus />
                        </button>
                      ) : (
                        <QuantityControl
                          product={product}
                          quantity={quantity}
                          onUpdate={updateCart}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="retail-offers" aria-label="Featured offers">
            {products.slice(0, 4).map((product, index) => (
              <button
                className={`retail-offer offer-tone-${index + 1}`}
                key={product.id}
                onClick={() => setQuickView(product)}
              >
                <span>
                  <small>
                    {index === 0
                      ? "SAVE MORE"
                      : index === 1
                        ? "LOCAL DEAL"
                        : index === 2
                          ? "BEST VALUE"
                          : "STORE PICK"}
                  </small>
                  <strong>
                    {product.discount_percent > 0
                      ? `${Math.round(product.discount_percent)}% off`
                      : "Great price"}
                  </strong>
                  <b>{product.name}</b>
                  <em>
                    Shop now <ArrowRight />
                  </em>
                </span>
                <div>
                  <ProductImage product={product} compact />
                </div>
              </button>
            ))}
          </section>
        </>
      )}

      <section className="products-section storefront-products" id="products">
        <div className="products-toolbar">
          <div>
            <span>
              {storeVerified ? activeStore?.name : "BROWSE ALL PRODUCTS"}
            </span>
            <h2>
              {search
                ? `Results for "${search}"`
                : selectedCategory?.name ||
                  selectedBrand?.name ||
                  "Shop all products"}
            </h2>
            <p>
              {loading && !products.length
                ? "Loading live local inventory..."
                : `${products.length} products shown - ${status}`}
            </p>
          </div>
          <div className="toolbar-actions">
            <button
              className="filter-trigger"
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal /> Filters
              {(categoryId || brandId) && <em>1</em>}
            </button>
            <label className="sort-box">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="discount">Biggest discount</option>
              </select>
            </label>
          </div>
        </div>

        {(categoryId || brandId || search) && (
          <div className="active-filters">
            {search && (
              <button onClick={() => setSearch("")}>
                Search: {search} <X />
              </button>
            )}
            {selectedCategory && (
              <button onClick={() => setCategoryId("")}>
                {selectedCategory.name} <X />
              </button>
            )}
            {selectedBrand && (
              <button onClick={() => setBrandId("")}>
                {selectedBrand.name} <X />
              </button>
            )}
            <button className="clear-filter" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        )}

        {loading && !products.length ? (
          <div className="loading-grid">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} />
            ))}
          </div>
        ) : (
          <div className="product-grid">
            {sortedProducts.map((product) => {
              const quantity = quantityFor(product.id);
              const saved = wishlist.some(
                (item) => String(item.id) === String(product.id),
              );
              return (
                <article
                  className={`product-card ${
                    String(recentlyAddedId) === String(product.id)
                      ? "product-added"
                      : ""
                  }`}
                  key={product.id}
                >
                  <button
                    className={`wishlist ${saved ? "saved" : ""}`}
                    aria-label={
                      saved
                        ? `Remove ${product.name} from saved items`
                        : `Save ${product.name}`
                    }
                    onClick={() => toggleWishlist(product)}
                  >
                    <Heart />
                  </button>
                  {product.discount_percent > 0 && (
                    <span className="discount">
                      {Math.round(product.discount_percent)}% OFF
                    </span>
                  )}
                  <Link
                    className="product-media quick-open"
                    href={`/product/${product.id}`}
                  >
                    <ProductImage product={product} />
                  </Link>
                  <div className="product-info">
                    <small>
                      {product.brand_name ||
                        product.category_name ||
                        "THE BUYZAAR MART"}
                    </small>
                    <button
                      className="product-name-button"
                      onClick={() => setQuickView(product)}
                    >
                      {product.name}
                    </button>
                    <p>
                      {product.unit || "1 unit"}
                      <span>{Math.floor(product.stock)} in stock</span>
                    </p>
                    <div className="price-row">
                      <div>
                        <b>{money(product.selling_price)}</b>
                        {product.mrp > product.selling_price && (
                          <del>{money(product.mrp)}</del>
                        )}
                      </div>
                      {quantity === 0 ? (
                        <button
                          className="add-button"
                          onClick={() => addProduct(product)}
                        >
                          ADD
                        </button>
                      ) : (
                        <QuantityControl
                          product={product}
                          quantity={quantity}
                          onUpdate={updateCart}
                        />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {page < totalPages && !search && (
          <div className="load-more-container">
            <button
              className="load-more-btn"
              disabled={loading}
              onClick={() => setPage((current) => current + 1)}
            >
              {loading ? "Loading products..." : "Load more products"}
            </button>
          </div>
        )}
        {!loading && activeStore && products.length === 0 && (
          <div className="empty-state">
            <Search />
            <h3>No matching products</h3>
            <p>Try a different search, category or brand.</p>
            <button onClick={clearFilters}>View all products</button>
          </div>
        )}
      </section>

      <PageFooter />

      {catalogOpen && (
        <div
          className="modal-backdrop catalog-backdrop"
          onMouseDown={() => setCatalogOpen(false)}
        >
          <section
            className="catalog-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="catalog-modal-head">
              <div>
                <span>EXPLORE THE STORE</span>
                <h2>Find what you need</h2>
                <p>
                  {storeVerified
                    ? activeStore?.name
                    : "Location is checked only when you add to cart"}
                </p>
              </div>
              <button
                aria-label="Close catalog"
                onClick={() => setCatalogOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="catalog-tabs">
              <button
                className={catalogTab === "categories" ? "active" : ""}
                onClick={() => setCatalogTab("categories")}
              >
                <ShoppingBag /> Categories
              </button>
              <button
                className={catalogTab === "brands" ? "active" : ""}
                onClick={() => setCatalogTab("brands")}
              >
                <Tag /> Brands
              </button>
            </div>
            {catalogLoading ? (
              <div className="catalog-loading">Loading live catalog...</div>
            ) : (
              <div className="catalog-choice-grid">
                <button
                  className="catalog-choice featured-choice"
                  onClick={() =>
                    catalogTab === "categories"
                      ? chooseCategory(null)
                      : chooseBrand(null)
                  }
                >
                  <span>
                    <Store />
                  </span>
                  <b>
                    All {catalogTab === "categories" ? "products" : "brands"}
                  </b>
                  <small>{facets.product_count} available products</small>
                  <ArrowRight />
                </button>
                {(catalogTab === "categories"
                  ? categories
                  : facets.brands
                ).map((item) => (
                  <button
                    className="catalog-choice"
                    key={item.id}
                    onClick={() =>
                      catalogTab === "categories"
                        ? chooseCategory(item)
                        : chooseBrand(item)
                    }
                  >
                    <span>
                      {catalogTab === "categories" ? (
                        <ShoppingBag />
                      ) : (
                        <Tag />
                      )}
                    </span>
                    <b>{item.name}</b>
                    <small>{item.product_count || 0} products</small>
                    <ArrowRight />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {filterOpen && (
        <div
          className="modal-backdrop filter-backdrop"
          onMouseDown={() => setFilterOpen(false)}
        >
          <aside
            className="filter-drawer"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="filter-head">
              <div>
                <span>REFINE RESULTS</span>
                <h2>Filters</h2>
              </div>
              <button
                aria-label="Close filters"
                onClick={() => setFilterOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="filter-section">
              <h3>Category</h3>
              <label>
                <input
                  type="radio"
                  name="category"
                  checked={!categoryId}
                  onChange={() => setCategoryId("")}
                />
                <span>All categories</span>
              </label>
              {categories.map((category) => (
                <label key={category.id}>
                  <input
                    type="radio"
                    name="category"
                    checked={
                      String(category.id) === String(categoryId)
                    }
                    onChange={() => {
                      setCategoryId(String(category.id));
                      setBrandId("");
                      setSearch("");
                    }}
                  />
                  <span>{category.name}</span>
                  <small>{category.product_count}</small>
                </label>
              ))}
            </div>
            <div className="filter-section">
              <h3>Brand</h3>
              <label>
                <input
                  type="radio"
                  name="brand"
                  checked={!brandId}
                  onChange={() => setBrandId("")}
                />
                <span>All brands</span>
              </label>
              <div className="filter-scroll">
                {facets.brands.map((brand) => (
                  <label key={brand.id}>
                    <input
                      type="radio"
                      name="brand"
                      checked={String(brand.id) === String(brandId)}
                      onChange={() => {
                        setBrandId(String(brand.id));
                        setCategoryId("");
                        setSearch("");
                      }}
                    />
                    <span>{brand.name}</span>
                    <small>{brand.product_count}</small>
                  </label>
                ))}
              </div>
            </div>
            <div className="filter-footer">
              <button onClick={clearFilters}>Clear all</button>
              <button onClick={() => setFilterOpen(false)}>
                Show products
              </button>
            </div>
          </aside>
        </div>
      )}

      {quickView && (
        <div
          className="quick-backdrop modal-backdrop"
          onMouseDown={() => setQuickView(null)}
        >
          <section
            className="quick-modal grocery-quick"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="quick-close"
              aria-label="Close product preview"
              onClick={() => setQuickView(null)}
            >
              <X />
            </button>
            <div className="quick-image">
              <ProductImage product={quickView} />
            </div>
            <div className="quick-copy">
              <span>
                {quickView.brand_name ||
                  quickView.category_name ||
                  "THE BUYZAAR MART"}
              </span>
              <h2>{quickView.name}</h2>
              <p className="quick-unit">{quickView.unit || "1 unit"}</p>
              <div className="quick-price">
                <b>{money(quickView.selling_price)}</b>
                {quickView.mrp > quickView.selling_price && (
                  <>
                    <del>{money(quickView.mrp)}</del>
                    <em>{Math.round(quickView.discount_percent)}% OFF</em>
                  </>
                )}
              </div>
              <div className="stock-message">
                <PackageCheck />
                <span>
                  <b>
                    {storeVerified
                      ? `Available at ${activeStore?.name}`
                      : "Availability verified on add to cart"}
                  </b>
                  <small>
                    {Math.floor(quickView.stock)} units in local stock
                  </small>
                </span>
              </div>
              <p className="grocery-promise">
                <Truck /> Local pricing and delivery for {pincode}.
              </p>
              <button
                className="quick-add"
                onClick={() => {
                  addProduct(quickView);
                  setQuickView(null);
                }}
              >
                <ShoppingCart /> Add to cart
              </button>
              <Link
                className="quick-location"
                href={`/product/${quickView.id}`}
              >
                View product details <ArrowRight />
              </Link>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div
          className={`add-toast cart-success-toast ${
            toast.product ? "" : "message-only"
          }`}
          role="status"
        >
          <span className="toast-check">
            <Check />
          </span>
          {toast.product && (
            <span className="toast-product-image">
              <ProductImage product={toast.product} compact />
            </span>
          )}
          <span className="toast-copy">
            <small>ADDED TO YOUR CART</small>
            <b>{toast.message}</b>
            {toast.product && (
              <em>
                {toast.product.name} - {money(toast.product.selling_price)}
              </em>
            )}
          </span>
          {toast.product && (
            <button
              className="toast-cart-action"
              onClick={() => {
                setToast(null);
                setCartOpen(true);
              }}
            >
              View cart <ArrowRight />
            </button>
          )}
          <button
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X />
          </button>
        </div>
      )}

      <div
        className={`drawer-backdrop ${cartOpen ? "show" : ""}`}
        onClick={() => setCartOpen(false)}
      />
      <aside
        className={`cart-drawer ${cartOpen ? "open" : ""}`}
        aria-hidden={!cartOpen}
      >
        <div className="drawer-header">
          <div>
            <span>YOUR BASKET</span>
            <h2>
              {cartCount} {cartCount === 1 ? "item" : "items"}
            </h2>
          </div>
          <button
            className="close-button"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          >
            <X />
          </button>
        </div>
        {cart.length > 0 && (
          <div className="free-delivery-progress">
            <div>
              <span>
                {freeDeliveryRemaining > 0
                  ? `Add ${money(freeDeliveryRemaining)} for free delivery`
                  : "You unlocked free delivery"}
              </span>
              <b>
                {Math.min(
                  100,
                  Math.round((cartTotal / FREE_DELIVERY_MINIMUM) * 100),
                )}
                %
              </b>
            </div>
            <span>
              <i
                style={{
                  width: `${Math.min(
                    100,
                    (cartTotal / FREE_DELIVERY_MINIMUM) * 100,
                  )}%`,
                }}
              />
            </span>
          </div>
        )}
        <div className="delivery-note">
          <Truck />
          <span>
            <b>
              {storeVerified
                ? activeStore?.name
                : "Store selected after location check"}
            </b>
            <small>
              {storeVerified
                ? `${activeStore?.city || ""} ${pincode || ""}`
                : "Within 5 km of your current location"}
            </small>
          </span>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="empty-cart">
              <ShoppingCart />
              <h3>Your basket is empty</h3>
              <p>Add local favourites to get started.</p>
              <button onClick={() => setCartOpen(false)}>
                Browse products
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div className="cart-item" key={item.id}>
                <Link
                  className="cart-thumb"
                  href={`/product/${item.id}`}
                  onClick={() => setCartOpen(false)}
                >
                  <ProductImage product={item} compact />
                </Link>
                <div>
                  <h3>{item.name}</h3>
                  <small>{item.unit || "1 unit"}</small>
                  <div className="cart-line-price">
                    <b>{money(item.selling_price * item.qty)}</b>
                    {item.mrp > item.selling_price && (
                      <del>{money(item.mrp * item.qty)}</del>
                    )}
                  </div>
                  <QuantityControl
                    product={item}
                    quantity={item.qty}
                    onUpdate={updateCart}
                  />
                </div>
                <button
                  className="cart-remove"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeFromCart(item.id)}
                >
                  <X />
                </button>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 && (
          <div className="cart-summary">
            {cartSavings > 0 && (
              <p className="cart-saving">
                <span>Your savings</span>
                <b>{money(cartSavings)}</b>
              </p>
            )}
            <p>
              <span>Subtotal</span>
              <b>{money(cartTotal)}</b>
            </p>
            <p>
              <span>Delivery</span>
              <b className={deliveryFee === 0 ? "free" : ""}>
                {deliveryFee === 0 ? "FREE" : money(deliveryFee)}
              </b>
            </p>
            <div>
              <span>Estimated total</span>
              <strong>{money(cartTotal + deliveryFee)}</strong>
            </div>
            <Link
              className="checkout-link"
              href="/checkout"
              onClick={() => setCartOpen(false)}
            >
              Secure checkout <ChevronRight />
            </Link>
            <small>
              <ShieldCheck /> Taxes included where applicable
            </small>
          </div>
        )}
      </aside>
    </main>
  );
}
