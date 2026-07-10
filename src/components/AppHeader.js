"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  MapPin,
  PackageCheck,
  Search,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { useStore } from "@/context/StoreContext";

export default function AppHeader({ search = "", onSearch }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeStore, cartCount, pincode, wishlist } = useStore();
  const [query, setQuery] = useState(search);

  useEffect(() => setQuery(search), [search]);

  function updateSearch(value) {
    setQuery(value);
    onSearch?.(value);
  }

  function submitSearch(event) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/?q=${encodeURIComponent(value)}` : "/");
  }

  return (
    <>
      <div className="service-strip">
        <span>THE BUYZAAR MART</span>
        <span>Store-wise prices</span>
        <span>Live local inventory</span>
      </div>
      <header className="site-header app-site-header">
        <div className="header-main">
          <button
            className="back-button"
            aria-label="Go back"
            onClick={() => router.back()}
          >
            <ArrowLeft />
            <span>Back</span>
          </button>
          <Link className="brand" href="/">
            <img
              className="brand-logo"
              src="/buyzaar-logo.png"
              alt="The Buyzaar Mart"
            />
          </Link>
          <Link className="app-location" href="/#top">
            <MapPin />
            <span>
              <small>Delivering to</small>
              <b>
                {activeStore
                  ? `${activeStore.city} ${pincode || activeStore.pincode}`
                  : "Select location"}
              </b>
            </span>
          </Link>
          <form className="search-box" onSubmit={submitSearch}>
            <Search />
            <input
              aria-label="Search products"
              value={query}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Search products, brands and categories"
            />
          </form>
          <nav className="header-actions">
            <Link
              className={pathname === "/orders" ? "active" : ""}
              aria-current={pathname === "/orders" ? "page" : undefined}
              href="/orders"
            >
              <PackageCheck />
              <span>Orders</span>
            </Link>
            <Link
              className={
                pathname === "/account" || pathname === "/login"
                  ? "active"
                  : ""
              }
              aria-current={
                pathname === "/account" || pathname === "/login"
                  ? "page"
                  : undefined
              }
              href="/account"
            >
              <UserRound />
              <span>Account</span>
            </Link>
            <Link
              className={pathname === "/wishlist" ? "active" : ""}
              aria-current={pathname === "/wishlist" ? "page" : undefined}
              href="/wishlist"
            >
              <Heart />
              <span>Saved</span>
              {wishlist.length > 0 && <em>{wishlist.length}</em>}
            </Link>
            <Link
              className={pathname === "/checkout" ? "active" : ""}
              aria-current={pathname === "/checkout" ? "page" : undefined}
              href="/checkout"
            >
              <ShoppingCart />
              <span>Cart</span>
              {cartCount > 0 && <em>{cartCount}</em>}
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}

export function PageFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-intro">
          <Link className="brand footer-brand" href="/">
            <img
              className="brand-logo"
              src="/buyzaar-logo.png"
              alt="The Buyzaar Mart"
            />
          </Link>
          <p>
            Everyday groceries, household essentials and trusted brands
            from your nearest Buyzaar Mart.
          </p>
          <div className="footer-promise">
            <span>Live local stock</span>
            <span>Store-wise prices</span>
          </div>
        </div>
        <nav className="footer-column" aria-label="Shop links">
          <b>Shop</b>
          <Link href="/">All products</Link>
          <Link href="/?q=Food">Food & groceries</Link>
          <Link href="/?q=Household">Household care</Link>
          <Link href="/wishlist">Saved items</Link>
        </nav>
        <nav className="footer-column" aria-label="Account links">
          <b>My account</b>
          <Link href="/account">Profile</Link>
          <Link href="/orders">My orders</Link>
          <Link href="/checkout">My cart</Link>
          <Link href="/account">Saved addresses</Link>
        </nav>
        <div className="footer-column footer-help">
          <b>We are here to help</b>
          <span>Shop from your selected local store.</span>
          <Link href="/account">Customer support</Link>
          <Link href="/">Change delivery location</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>Copyright 2026 The Buyzaar Mart. All rights reserved.</span>
        <span>Local choice. Honest prices. Everyday convenience.</span>
      </div>
    </footer>
  );
}
