"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore } from "@/context/StoreContext";
import { money } from "@/lib/shop.mjs";

export default function MobileCartBar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const { cartCount, cartTotal, ready } = useStore();
  const hidden =
    !ready ||
    !cartCount ||
    pathname === "/cart" ||
    pathname === "/checkout" ||
    pathname?.startsWith("/product/") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login");

  return (
    <AnimatePresence>
      {!hidden ? (
        <motion.div
          className="bz-floating-cart-wrap"
          initial={reduceMotion ? false : { y: 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 18, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
        >
          <Link className="bz-floating-cart-bar" href="/cart" aria-label={`View cart with ${cartCount} items`}>
            <span className="bz-floating-cart-icon">
              <ShoppingCart size={20} />
              <em>{cartCount > 99 ? "99+" : cartCount}</em>
            </span>
            <span>
              <small>{cartCount} {cartCount === 1 ? "item" : "items"}</small>
              <strong>{money(cartTotal)}</strong>
            </span>
            <b>View cart <ArrowRight size={17} /></b>
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
