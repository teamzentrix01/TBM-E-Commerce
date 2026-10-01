"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  Heart,
  LocateFixed,
  MapPin,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  UserRound,
} from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useCartSession } from "@/context/CartSessionContext";
import { listingUrl } from "@/lib/shop.mjs";
import { Modal } from "@/components/shop/ShopUI";
import { fetchProducts } from "@/lib/api";

export default function AppHeader({ search = "", onSearch }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeStore,
    cart,
    cartCount,
    customer,
    lookupByPincode,
    lookupNearbyStore,
    pincode,
    selectStore,
    storeVerified,
    wishlist,
  } = useStore();
  const { clearSession } = useCartSession();
  const [query, setQuery] = useState(search);
  const [locationOpen, setLocationOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => setQuery(search), [search]);
  useEffect(() => {
    if (!activeStore?.id || query.trim().length < 2 || !searchFocused) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchProducts({ storeId: activeStore.id, search: query, pageSize: 5, signal: controller.signal })
        .then((data) => setSuggestions(data.records || []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeStore?.id, query, searchFocused]);
  function applyStore(store, deliveryPincode, verified) {
    if (String(store.id) !== String(activeStore?.id)) clearSession();
    selectStore(store, deliveryPincode, verified);
    setCandidate(null);
    setLocationOpen(false);
    if (pathname === "/checkout") router.push("/cart");
  }

  async function checkPincode(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCandidate(null);
    try {
      const store = await lookupByPincode(draft);
      if (cart.length && String(store.id) !== String(activeStore?.id)) {
        setCandidate(store);
      } else {
        applyStore(store, draft, true);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function useCurrentLocation() {
    setGpsBusy(true);
    setError("");
    setCandidate(null);
    try {
      const store = await lookupNearbyStore({
        pincodeHint: draft || pincode,
      });
      if (cart.length && String(store.id) !== String(activeStore?.id)) {
        setCandidate(store);
      } else {
        applyStore(store, store.pincode || draft || pincode, true);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setGpsBusy(false);
    }
  }

  const openLocation = () => {
    setDraft(pincode || "");
    setError("");
    setCandidate(null);
    setLocationOpen(true);
  };

  const links = [
    {
      href: "/account",
      icon: UserRound,
      label: customer?.name?.split(" ")[0] || "Login",
    },
    {
      href: "/wishlist",
      icon: Heart,
      label: "Wishlist",
      count: wishlist.length,
    },
    { href: "/cart", icon: ShoppingCart, label: "My Cart", count: cartCount },
  ];

  return (
    <>
      <header className="bz-header bz-header-blinkit">
        <div className="bz-topbar">
          <span><Truck size={13} /> {storeVerified ? `Delivering to ${pincode}` : "Choose a delivery location"}</span>
          <span><MapPin size={13} /> Live prices and availability from your local store</span>
        </div>
        <div className="bz-header-main">
          <Link className="bz-logo" href="/" aria-label="The Buyzaar Mart home">
            <img src="/buyzaar-logo.svg" alt="The Buyzaar Mart" />
          </Link>
          <button className="bz-location" type="button" onClick={openLocation} aria-label="Change delivery location">
            <MapPin size={20} />
            <span>
              <small>Deliver to</small>
              <b>
                {activeStore?.name || pincode || "Choose location"}
                <ChevronDown size={14} />
              </b>
            </span>
          </button>
          <form
            className="bz-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(listingUrl({ q: query.trim() }));
            }}
          >
            <Search size={19} />
            <input
              aria-label="Search products"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                onSearch?.(event.target.value);
              }}
              placeholder="Search products, brands & everyday essentials"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
            />
            <button type="submit" aria-label="Submit search">
              <ArrowRight size={18} />
            </button>
            {searchFocused && query.trim().length >= 2 ? (
              <div className="bz-search-suggestions" role="listbox" aria-label="Product suggestions">
                {suggestions.length ? suggestions.map((product) => (
                  <Link key={product.id} href={`/product/${product.id}`} role="option" onMouseDown={(event) => event.preventDefault()}>
                    <span>{product.name}</span>
                    {product.brand ? <small>{product.brand}</small> : null}
                    <ArrowRight size={15} />
                  </Link>
                )) : <span className="bz-search-no-suggestion">Search all products for “{query.trim()}”</span>}
              </div>
            ) : null}
          </form>
          <nav className="bz-header-actions" aria-label="Your account">
            {links.map(({ href, icon: Icon, label, count }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                aria-label={label + (count ? ", " + count + " items" : "")}
              >
                <span data-cart-target={href === "/cart" ? "desktop" : undefined}>
                  <Icon size={21} />
                  {count > 0 && <em>{count}</em>}
                </span>
                <small>{label}</small>
              </Link>
            ))}
          </nav>
        </div>
        {!pathname?.startsWith("/account") || customer ? (
          <nav className="bz-nav bz-nav-desktop" aria-label="Shop navigation">
            <div>
              <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
                Home
              </Link>
              <Link
                href="/products"
                aria-current={pathname === "/products" ? "page" : undefined}
              >
                Categories
              </Link>
              <Link
                href="/hamper"
                aria-current={pathname === "/hamper" ? "page" : undefined}
              >
                Gift hampers
              </Link>
              <Link href="/products?sort=discount">Everyday savings</Link>
              <Link href="/orders">My orders</Link>
            </div>
          </nav>
        ) : null}
      </header>
      {locationOpen && (
        <Modal
          title="Your delivery location"
          onClose={() => setLocationOpen(false)}
        >
          <div className="bz-location-current">
            <MapPin size={18} />
            <span>
              <small>Currently selected</small>
              <b>{activeStore?.name || "No store selected"}</b>
              <em>{[activeStore?.city, pincode].filter(Boolean).join(" · ") || "Set a location to check availability"}</em>
            </span>
          </div>
          <p>
            Use your current location or enter a pincode to find the store that serves your area.
          </p>
          <button
            type="button"
            className="bz-button bz-full bz-location-gps"
            disabled={gpsBusy || busy}
            onClick={useCurrentLocation}
          >
            <LocateFixed size={18} />
            {gpsBusy ? "Detecting…" : "Use my current location"}
          </button>
          <div className="bz-location-or">or enter pincode</div>
          <form className="bz-location-form" onSubmit={checkPincode}>
            <label htmlFor="browse-pincode">Delivery pincode</label>
            <input
              id="browse-pincode"
              required
              pattern="[0-9]{6}"
              inputMode="numeric"
              maxLength={6}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.replace(/\D/g, ""));
                setCandidate(null);
              }}
              placeholder="6 digit pincode"
            />
            <button className="bz-button" disabled={busy || gpsBusy}>
              {busy ? "Checking…" : "Check pincode"}
              <ArrowRight size={16} />
            </button>
          </form>
          {error && (
            <p role="alert" className="bz-error">
              {error}
            </p>
          )}
          {candidate && (
            <div className="bz-notice">
              <p>
                This location is served by a different store. Changing location
                will clear items from your previous store and end your shared
                basket.
              </p>
              <button
                className="bz-button"
                onClick={() =>
                  applyStore(
                    candidate,
                    candidate.pincode || draft || pincode,
                    true,
                  )
                }
              >
                Change location and clear basket
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

export function PageFooter() {
  return (
    <footer className="bz-footer">
      <div className="bz-footer-grid">
        <div className="bz-footer-brand">
          <Link className="bz-logo" href="/">
            <img src="/buyzaar-logo.svg" alt="The Buyzaar Mart" />
          </Link>
          <span className="bz-footer-kicker">YOUR NEIGHBOURHOOD MART</span>
          <p>Everyday essentials and trusted brands from your selected local store.</p>
          <Link className="bz-footer-shop" href="/products">Start shopping <ArrowRight size={15} /></Link>
        </div>
        <nav aria-label="Explore">
          <b><Sparkles size={16} /> Explore the store</b>
          <Link href="/products">All products</Link>
          <Link href="/#categories">Shop by category</Link>
          <Link href="/hamper">Gift hampers</Link>
          <Link href="/products?sort=discount">Everyday savings</Link>
        </nav>
        <nav aria-label="Account links">
          <b><UserRound size={16} /> Here for you</b>
          <Link href="/account">My account & addresses</Link>
          <Link href="/orders">Orders & tracking</Link>
          <Link href="/wishlist">My wishlist</Link>
          <Link href="/cart">My cart</Link>
        </nav>
        <div className="bz-footer-local-card">
          <span className="bz-footer-local-icon"><Truck size={21} /></span>
          <div>
            <b>Fast local shopping</b>
            <p>Live store-wise prices and availability from your neighbourhood mart.</p>
          </div>
          <span className="bz-footer-note">
            <ShieldCheck size={15} /> Cash, UPI & secure online payments
          </span>
        </div>
      </div>
      <div className="bz-footer-bottom">
        <span>© 2026 The Buyzaar Mart</span>
        <span>Local choice. Honest prices. Everyday convenience.</span>
      </div>
    </footer>
  );
}
