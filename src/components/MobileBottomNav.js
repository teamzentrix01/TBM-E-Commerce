"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Grid2X2,
  Heart,
  Home,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { useStore } from "@/context/StoreContext";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (path) => path === "/" },
  {
    href: "/products",
    label: "Categories",
    icon: Grid2X2,
    match: (path) => path === "/products" || path.startsWith("/product/"),
  },
  {
    href: "/wishlist",
    label: "Saved",
    icon: Heart,
    match: (path) => path.startsWith("/wishlist"),
    showBadge: true,
  },
  {
    href: "/cart",
    label: "Cart",
    icon: ShoppingCart,
    match: (path) => path.startsWith("/cart"),
    cartTarget: true,
    showBadge: true,
  },
  {
    href: "/account",
    label: "Account",
    icon: UserRound,
    match: (path) =>
      path.startsWith("/account") ||
      path.startsWith("/orders") ||
      path.startsWith("/wishlist") ||
      path.startsWith("/login"),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { cartCount, wishlist } = useStore();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/checkout")) {
    return null;
  }
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.match(pathname || "/")),
  );
  return (
    <nav
      className="bz-bottom-nav"
      aria-label="Primary"
      style={{ "--bz-tab-index": activeIndex }}
    >
      <span className="bz-bottom-nav-glass" aria-hidden="true" />
      {TABS.map(({ href, label, icon: Icon, match, cartTarget, showBadge }, index) => {
        const active = index === activeIndex && match(pathname || "/");
        const count = href === "/cart" ? cartCount : wishlist.length;
        return (
          <Link
            key={href}
            href={href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span
              className="bz-bottom-nav-icon"
              data-cart-target={cartTarget ? "mobile" : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              {showBadge && count > 0 && <em>{count > 99 ? "99+" : count}</em>}
            </span>
            <small>{label}</small>
          </Link>
        );
      })}
    </nav>
  );
}
