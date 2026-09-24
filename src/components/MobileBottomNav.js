"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gift,
  Grid2X2,
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
    href: "/hamper",
    label: "Hampers",
    icon: Gift,
    match: (path) => path.startsWith("/hamper"),
  },
  {
    href: "/cart",
    label: "Cart",
    icon: ShoppingCart,
    match: (path) => path.startsWith("/cart"),
    badge: true,
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
  const { cartCount } = useStore();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/checkout")) {
    return null;
  }
  return (
    <nav className="bz-bottom-nav" aria-label="Primary">
      {TABS.map(({ href, label, icon: Icon, match, badge }) => {
        const active = match(pathname || "/");
        return (
          <Link
            key={href}
            href={href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span className="bz-bottom-nav-icon">
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              {badge && cartCount > 0 && <em>{cartCount > 99 ? "99+" : cartCount}</em>}
            </span>
            <small>{label}</small>
          </Link>
        );
      })}
    </nav>
  );
}
