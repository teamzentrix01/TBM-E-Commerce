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
  ShoppingCart,
  Truck,
  UserRound,
} from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useCartSession } from "@/context/CartSessionContext";
import { listingUrl } from "@/lib/shop.mjs";
import { Modal } from "@/components/shop/ShopUI";

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
  useEffect(() => setQuery(search), [search]);

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
        <div className="bz-header-main">
          <Link className="bz-logo" href="/" aria-label="The Buyzaar Mart home">
            <img src="/buyzaar-logo.svg" alt="The Buyzaar Mart" />
          </Link>
          <button className="bz-location" type="button" onClick={openLocation}>
            <MapPin size={20} />
            <span>
              <small>
                {storeVerified
                  ? "Delivering in your area"
                  : "Set delivery location"}
              </small>
              <b>
                {pincode || "Detect location"}
                {activeStore?.city ? `, ${activeStore.city}` : ""}
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
              placeholder='Search "atta", "milk", "snacks"…'
            />
            <button type="submit" aria-label="Submit search">
              <ArrowRight size={18} />
            </button>
          </form>
          <nav className="bz-header-actions" aria-label="Your account">
            {links.map(({ href, icon: Icon, label, count }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                aria-label={label + (count ? ", " + count + " items" : "")}
              >
                <span>
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
          <p>
            Use your current location to find a Buyzaar Mart within 5 km, or
            enter a pincode to browse local prices.
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
          <p>
            Everyday essentials. Trusted brands.
            <br />
            All from your neighbourhood mart.
          </p>
          <span className="bz-green">
            <Truck size={16} /> A little closer to home.
          </span>
        </div>
        <nav aria-label="Explore">
          <b>Explore the store</b>
          <Link href="/products">All products</Link>
          <Link href="/#categories">Shop by category</Link>
          <Link href="/hamper">Gift hampers</Link>
          <Link href="/products?sort=discount">Everyday savings</Link>
        </nav>
        <nav aria-label="Account links">
          <b>Here for you</b>
          <Link href="/account">My account & addresses</Link>
          <Link href="/orders">Orders & tracking</Link>
          <Link href="/wishlist">My wishlist</Link>
          <Link href="/cart">My cart</Link>
        </nav>
        <div>
          <b>Local shopping, made simple</b>
          <p>Store-wise prices and availability from your neighbourhood mart.</p>
          <span className="bz-footer-note">
            Cash, UPI & secure online payments
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
