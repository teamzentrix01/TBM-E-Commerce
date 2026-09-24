"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Gift,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { ProductImage } from "@/components/shop/ShopUI";
import useCatalogStore from "@/components/shop/useCatalogStore";
import { useCartSession } from "@/context/CartSessionContext";
import { fetchProducts, fetchStorefrontHampers } from "@/lib/api";
import {
  hamperTotal,
  saveHamperGiftMeta,
} from "@/lib/hampers.mjs";
import { money } from "@/lib/shop.mjs";

const TABS = [
  { id: "ready", label: "Ready packs" },
  { id: "budget", label: "Budget" },
  { id: "customise", label: "Build your own" },
];

const MESSAGE_MAX = 120;

function HamperBuilder() {
  const params = useSearchParams();
  const router = useRouter();
  const { store, error: storeError } = useCatalogStore();
  const { changeItem, sessionReady } = useCartSession();

  const initialTab = TABS.some((tab) => tab.id === params.get("tab"))
    ? params.get("tab")
    : "ready";

  const [tab, setTab] = useState(initialTab);
  const [packs, setPacks] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [styles, setStyles] = useState([]);
  const [occasions, setOccasions] = useState([]);
  const [packId, setPackId] = useState(params.get("pack") || "");
  const [budgetId, setBudgetId] = useState("");
  const [occasionFilter, setOccasionFilter] = useState("");
  const [styleId, setStyleId] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [flyKey, setFlyKey] = useState(0);

  useEffect(() => {
    const next = params.get("tab");
    if (TABS.some((tab) => tab.id === next)) setTab(next);
    if (params.get("pack")) setPackId(params.get("pack"));
  }, [params]);

  useEffect(() => {
    if (!store?.id) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoadingMeta(true);
    setError("");
    fetchStorefrontHampers(store.id, { signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        const nextPacks = data.packs || [];
        const nextBudgets = data.budgets || [];
        const nextStyles = data.styles || [];
        setPacks(nextPacks);
        setBudgets(nextBudgets);
        setStyles(nextStyles);
        setOccasions(data.occasions || []);
        setPackId((current) => {
          if (current && nextPacks.some((p) => String(p.id) === String(current))) {
            return current;
          }
          return nextPacks[0] ? String(nextPacks[0].id) : "";
        });
        setBudgetId((current) => {
          if (
            current &&
            nextBudgets.some((p) => String(p.id) === String(current))
          ) {
            return current;
          }
          return nextBudgets[0] ? String(nextBudgets[0].id) : "";
        });
        setStyleId((current) => {
          if (
            current &&
            nextStyles.some((s) => String(s.id) === String(current))
          ) {
            return current;
          }
          return nextStyles[0] ? String(nextStyles[0].id) : "";
        });
      })
      .catch((failure) => {
        if (!cancelled && failure.name !== "AbortError") {
          setError(failure.message || "Could not load hampers");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [store?.id]);

  const visiblePacks = useMemo(() => {
    if (!occasionFilter) return packs;
    return packs.filter(
      (pack) =>
        String(pack.occasion_tag || "").toLowerCase() ===
        occasionFilter.toLowerCase(),
    );
  }, [packs, occasionFilter]);

  const pack =
    visiblePacks.find((item) => String(item.id) === String(packId)) ||
    visiblePacks[0] ||
    null;
  const budget =
    budgets.find((item) => String(item.id) === String(budgetId)) ||
    budgets[0] ||
    null;
  const style =
    styles.find((item) => String(item.id) === String(styleId)) ||
    styles[0] ||
    null;

  const limit =
    tab === "budget"
      ? Number(budget?.budget_max || 0) || null
      : tab === "ready"
        ? pack?.budget_max != null
          ? Number(pack.budget_max)
          : null
        : null;

  const styleFeeProduct = style?.fee_product || null;
  const styleFeeDisplay = styleFeeProduct
    ? Number(styleFeeProduct.selling_price || 0)
    : Number(style?.fee_amount || 0);
  const productsTotal = hamperTotal(selected);
  const total = productsTotal + styleFeeDisplay;
  const remaining =
    limit == null ? null : Math.max(0, limit - productsTotal);
  const budgetPct =
    limit && limit > 0
      ? Math.min(100, Math.round((productsTotal / limit) * 100))
      : 0;

  useEffect(() => {
    if (tab !== "ready" || !pack) {
      if (tab === "ready") setSelected([]);
      return;
    }
    const seeded = (pack.products || []).map((item) => ({
      ...item,
      store_id: store?.id,
      qty: Math.max(1, Number(item.default_qty || 1)),
    }));
    let sum = 0;
    const within = [];
    for (const item of seeded) {
      const price = Number(item.selling_price || 0) * item.qty;
      if (pack.budget_max != null && sum + price > Number(pack.budget_max)) {
        continue;
      }
      within.push(item);
      sum += price;
    }
    setSelected(within);
    setCatalog(pack.products || []);
  }, [tab, pack?.id, pack?.products, pack?.budget_max, store?.id]);

  useEffect(() => {
    if (!store?.id || tab === "ready") return;
    let cancelled = false;
    const controller = new AbortController();
    setLoadingCatalog(true);
    fetchProducts({
      storeId: store.id,
      pageSize: 36,
      search: search.trim(),
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled) return;
        setCatalog(
          (data.records || [])
            .filter((item) => Number(item.stock || 0) > 0)
            .map((product) => ({ ...product, store_id: store.id })),
        );
      })
      .catch((failure) => {
        if (!cancelled && failure.name !== "AbortError") {
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [store?.id, tab, search]);

  const visibleCatalog = useMemo(() => {
    if (tab === "budget" && budget?.budget_max != null) {
      return catalog.filter(
        (item) => Number(item.selling_price || 0) <= Number(budget.budget_max),
      );
    }
    return catalog;
  }, [catalog, tab, budget?.budget_max]);

  function setActiveTab(next) {
    setTab(next);
    setNotice("");
    const query = new URLSearchParams();
    query.set("tab", next);
    if (next === "ready" && packId) query.set("pack", packId);
    router.replace(`/hamper?${query.toString()}`, { scroll: false });
  }

  function qtyOf(productId) {
    return (
      selected.find((item) => String(item.id) === String(productId))?.qty || 0
    );
  }

  function changeSelected(product, delta) {
    setNotice("");
    setSelected((current) => {
      const existing = current.find(
        (item) => String(item.id) === String(product.id),
      );
      const nextQty = (existing?.qty || 0) + delta;
      if (nextQty <= 0) {
        return current.filter(
          (item) => String(item.id) !== String(product.id),
        );
      }
      const price = Number(product.selling_price || 0);
      const without = current.filter(
        (item) => String(item.id) !== String(product.id),
      );
      const nextTotal = hamperTotal(without) + price * nextQty;
      if (limit != null && nextTotal > limit) {
        setNotice(`Stay within ${money(limit)} for this hamper option.`);
        return current;
      }
      if (Number(product.stock || 0) < nextQty) {
        setNotice("Not enough stock for that quantity.");
        return current;
      }
      if (delta > 0) setFlyKey((value) => value + 1);
      return [...without, { ...product, qty: nextQty }];
    });
  }

  async function addHamperToCart() {
    if (!selected.length || !sessionReady) return;
    setBusy(true);
    setNotice("");
    try {
      for (const item of selected) {
        await changeItem(item, item.qty);
      }
      if (styleFeeProduct) {
        await changeItem(
          { ...styleFeeProduct, store_id: store?.id },
          1,
        );
      }
      saveHamperGiftMeta({
        message: giftMessage.trim(),
        styleName: style?.name || "",
      });
      router.push("/cart");
    } catch (failure) {
      setNotice(failure.message || "Could not add hamper to cart.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-hamper-page">
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">
              <Gift size={15} /> GIFT HAMPERS
            </span>
            <h1>Build a thoughtful hamper</h1>
            <p className="bz-muted">
              Curated packs from Sync, or build your own from your local store —
              with live basket preview, style and a gift note.
            </p>
          </div>
        </div>

        <div className="bz-hamper-tabs" role="tablist" aria-label="Hamper options">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "is-active" : undefined}
              onClick={() => setActiveTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(error || storeError) && (
          <div className="bz-notice" role="alert">
            <p>{error || storeError}</p>
          </div>
        )}

        {loadingMeta ? (
          <p className="bz-muted">Loading gift hampers…</p>
        ) : (
          <>
            {tab === "ready" && (
              <div className="bz-hamper-ready-bar">
                {occasions.length > 0 && (
                  <div className="bz-hamper-occasion-chips">
                    <button
                      type="button"
                      className={!occasionFilter ? "is-selected" : undefined}
                      onClick={() => setOccasionFilter("")}
                    >
                      All
                    </button>
                    {occasions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={
                          occasionFilter === tag ? "is-selected" : undefined
                        }
                        onClick={() => setOccasionFilter(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="bz-hamper-options">
                  {visiblePacks.length === 0 ? (
                    <p className="bz-muted">
                      No ready packs yet. Attach products in Sync → E-commerce
                      Hampers.
                    </p>
                  ) : (
                    visiblePacks.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={
                          String(pack?.id) === String(item.id)
                            ? "is-selected"
                            : undefined
                        }
                        onClick={() => {
                          setPackId(String(item.id));
                          router.replace(
                            `/hamper?tab=ready&pack=${item.id}`,
                            { scroll: false },
                          );
                        }}
                      >
                        <b>{item.title}</b>
                        <small>{item.subtitle}</small>
                        <span>
                          {item.budget_max != null
                            ? `Up to ${money(item.budget_max)}`
                            : `${(item.products || []).length} items`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === "budget" && (
              <div className="bz-hamper-options bz-hamper-budgets">
                {budgets.length === 0 ? (
                  <p className="bz-muted">
                    No budget tiers in Sync yet. Create budget packs in Sync.
                  </p>
                ) : (
                  budgets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        String(budget?.id) === String(item.id)
                          ? "is-selected"
                          : undefined
                      }
                      onClick={() => {
                        setBudgetId(String(item.id));
                        setSelected([]);
                      }}
                    >
                      <b>
                        {item.budget_max != null
                          ? money(item.budget_max)
                          : item.title}
                      </b>
                      <small>{item.subtitle || "Build within this budget"}</small>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="bz-hamper-studio">
              <section className="bz-hamper-catalog">
                <div className="bz-hamper-catalog-head">
                  <div>
                    <h2>
                      {tab === "ready"
                        ? "Suggested for this pack"
                        : tab === "budget"
                          ? "Pick within budget"
                          : "Browse available products"}
                    </h2>
                    <p className="bz-muted">
                      Only in-stock items from your selected store.
                    </p>
                  </div>
                  {tab !== "ready" && (
                    <label className="bz-hamper-search">
                      <Search size={16} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search products…"
                      />
                    </label>
                  )}
                </div>

                {loadingCatalog && tab !== "ready" ? (
                  <p className="bz-muted">Loading products…</p>
                ) : visibleCatalog.length ? (
                  <div className="bz-hamper-product-grid">
                    {visibleCatalog.map((product) => {
                      const qty = qtyOf(product.id);
                      return (
                        <article key={product.id} className="bz-hamper-product">
                          <Link
                            href={`/product/${product.id}`}
                            className="bz-hamper-product-media"
                          >
                            <ProductImage
                              src={product.image_url}
                              alt={product.name}
                            />
                          </Link>
                          <div>
                            <Link href={`/product/${product.id}`}>
                              <b>{product.name}</b>
                            </Link>
                            <small>
                              {product.unit || "PCS"} · Stock {product.stock}
                            </small>
                            <strong>{money(product.selling_price)}</strong>
                            <div className="bz-qty">
                              <button
                                type="button"
                                aria-label="Decrease"
                                onClick={() => changeSelected(product, -1)}
                                disabled={!qty}
                              >
                                <Minus size={14} />
                              </button>
                              <span>{qty}</span>
                              <button
                                type="button"
                                aria-label="Increase"
                                onClick={() => changeSelected(product, 1)}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="bz-muted">
                    {tab === "ready"
                      ? "No matching products for this pack yet. Attach products in Sync."
                      : "No matching products for this option yet."}
                  </p>
                )}

                {styles.length > 0 && (
                  <div className="bz-hamper-styles">
                    <h3>
                      <Sparkles size={16} /> Basket style
                    </h3>
                    <div className="bz-hamper-style-grid">
                      {styles.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            String(style?.id) === String(item.id)
                              ? "is-selected"
                              : undefined
                          }
                          onClick={() => setStyleId(String(item.id))}
                        >
                          <div className="bz-hamper-style-media">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_url} alt="" />
                            ) : (
                              <span className="bz-hamper-style-fallback">
                                {item.name.slice(0, 1)}
                              </span>
                            )}
                          </div>
                          <b>{item.name}</b>
                          <small>{item.subtitle}</small>
                          <span>
                            {item.fee_product
                              ? `+ ${money(item.fee_product.selling_price)}`
                              : item.fee_amount > 0
                                ? `+ ${money(item.fee_amount)} display`
                                : "Included"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bz-hamper-message">
                  <h3>Gift message</h3>
                  <textarea
                    maxLength={MESSAGE_MAX}
                    rows={3}
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    placeholder="Write a short note for the gift card…"
                  />
                  <small>
                    {giftMessage.length}/{MESSAGE_MAX}
                  </small>
                </div>
              </section>

              <aside className="bz-hamper-preview" key={style?.id || "preview"}>
                <div
                  className={`bz-hamper-basket-stage ${flyKey ? "is-pop" : ""}`}
                  key={flyKey}
                >
                  <div
                    className="bz-hamper-basket-shell"
                    style={
                      style?.image_url
                        ? {
                            backgroundImage: `linear-gradient(180deg, rgba(255,248,247,0.2), rgba(255,248,247,0.92)), url(${style.image_url})`,
                          }
                        : undefined
                    }
                  >
                    <div className="bz-hamper-basket-rim" />
                    <div className="bz-hamper-basket-items">
                      {selected.length === 0 ? (
                        <p>Add products to preview your gift box.</p>
                      ) : (
                        selected.slice(0, 8).map((item, index) => (
                          <div
                            key={`${item.id}-${index}`}
                            className="bz-hamper-basket-thumb"
                            style={{
                              zIndex: index + 1,
                              transform: `translate(${(index % 4) * 10 - 12}px, ${Math.floor(index / 4) * -8}px) rotate(${(index % 3) * 4 - 4}deg)`,
                            }}
                          >
                            <ProductImage
                              src={item.image_url}
                              alt={item.name}
                            />
                          </div>
                        ))
                      )}
                    </div>
                    <div className="bz-hamper-basket-base" />
                  </div>
                  {giftMessage.trim() ? (
                    <div className="bz-hamper-card-preview">
                      <span>Gift card</span>
                      <p>{giftMessage.trim()}</p>
                    </div>
                  ) : null}
                </div>

                <h2>Your hamper</h2>
                {selected.length > 0 ? (
                  <div className="bz-hamper-preview-list">
                    {selected.map((item) => (
                      <div key={item.id}>
                        <ProductImage src={item.image_url} alt={item.name} />
                        <div>
                          <b>{item.name}</b>
                          <small>
                            {item.qty} × {money(item.selling_price)}
                          </small>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() => changeSelected(item, -item.qty)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="bz-muted">Add products to preview your gift box.</p>
                )}

                {limit != null && (
                  <div className="bz-hamper-budget-meter">
                    <div className="bz-hamper-budget-track">
                      <div
                        className="bz-hamper-budget-fill"
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                    <p>
                      Budget {money(limit)} · {money(remaining)} remaining
                    </p>
                  </div>
                )}

                <div className="bz-hamper-total-row">
                  <span>Hamper total</span>
                  <strong>{money(total)}</strong>
                </div>
                {styleFeeDisplay > 0 && (
                  <p className="bz-hamper-fee-note">
                    Includes {style?.name}{" "}
                    {styleFeeProduct ? "(added to cart)" : "(display fee)"}{" "}
                    {money(styleFeeDisplay)}
                  </p>
                )}
                {notice && <p className="bz-hamper-notice">{notice}</p>}
                <button
                  type="button"
                  className="bz-button"
                  disabled={!selected.length || busy || !sessionReady}
                  onClick={addHamperToCart}
                >
                  {busy ? "Adding…" : "Add hamper to cart"}
                  <ArrowRight size={16} />
                </button>
                <Link className="bz-text-link" href="/cart">
                  View cart
                </Link>
              </aside>
            </div>
          </>
        )}
      </main>
      <PageFooter />
    </>
  );
}

export default function HamperPage() {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader />
          <main className="bz-shell bz-hamper-page">
            <p>Loading gift hampers…</p>
          </main>
          <PageFooter />
        </>
      }
    >
      <HamperBuilder />
    </Suspense>
  );
}
