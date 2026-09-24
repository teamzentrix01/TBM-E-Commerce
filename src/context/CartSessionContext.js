"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { accountLoginHref, rememberLoginReturn } from "@/lib/authNav.mjs";
import {
  createSharedCart,
  fetchSharedCart,
  updateSharedCartItem,
} from "@/lib/sharedCartApi";

const CartSessionContext = createContext(null);
const STORAGE_KEY = "tbm-shared-cart-owner";

export function CartSessionProvider({ children }) {
  const {
    activeStore,
    cart,
    customer,
    pincode,
    ready,
    setCart,
    storeVerified,
    updateCart,
  } = useStore();
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const sessionEpoch = useRef(0);
  const mutationCount = useRef(0);
  const clearSession = useCallback(() => {
    sessionEpoch.current += 1;
    generation.current += 1;
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setError("");
  }, []);
  useEffect(() => {
    try {
      setSession(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {}
    setSessionReady(true);
  }, []);

  // Freeze the owner's basket during checkout, as in the original flow.
  const paused = !(
    pathname === "/" ||
    pathname === "/products" ||
    pathname === "/cart" ||
    pathname === "/wishlist" ||
    pathname === "/hamper" ||
    pathname.startsWith("/product/")
  );
  useEffect(() => {
    if (!ready || !session?.inviteToken || paused) return;
    let cancelled = false;
    let timer;
    async function sync() {
      const version = generation.current;
      try {
        if (mutationCount.current) return;
        const data = await fetchSharedCart(session.inviteToken);
        if (
          !cancelled &&
          version === generation.current &&
          !mutationCount.current
        ) {
          if (
            activeStore?.id &&
            String(data.cart.storeId) !== String(activeStore.id)
          ) {
            clearSession();
            return;
          }
          setCart(
            data.cart.items.map((item) => ({
              ...item,
              store_id: data.cart.storeId,
            })),
          );
          setError("");
        }
      } catch (failure) {
        if (!cancelled) {
          if ([404, 410].includes(failure.status)) clearSession();
          else setError("Shared basket could not sync. We will retry shortly.");
        }
      } finally {
        if (!cancelled) timer = setTimeout(sync, 4000);
      }
    }
    sync();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    ready,
    session?.inviteToken,
    paused,
    setCart,
    clearSession,
    activeStore?.id,
  ]);

  // Serializing owner edits prevents an older response from replacing a newer basket.
  const queue = useRef(Promise.resolve());
  const changeItem = useCallback(
    (product, amount) => {
      if (!sessionReady) return Promise.resolve(false);
      if (!session?.inviteToken || !session?.memberToken)
        return Promise.resolve(updateCart(product, amount));
      const epoch = sessionEpoch.current;
      const edit = async () => {
        if (epoch !== sessionEpoch.current) return false;
        generation.current += 1;
        mutationCount.current += 1;
        try {
          const data = await updateSharedCartItem(
            session.inviteToken,
            session.memberToken,
            product.id,
            amount,
          );
          if (epoch !== sessionEpoch.current) return false;
          setCart(
            data.cart.items.map((item) => ({
              ...item,
              store_id: data.cart.storeId,
            })),
          );
          setError("");
          return true;
        } catch (failure) {
          if ([404, 410].includes(failure.status)) clearSession();
          setError(failure.message);
          throw failure;
        } finally {
          mutationCount.current -= 1;
        }
      };
      const result = queue.current.then(edit, edit);
      queue.current = result.catch(() => {});
      return result;
    },
    [session, sessionReady, updateCart, setCart, clearSession],
  );

  async function invite() {
    if (session?.inviteToken) return session;
    if (!customer) {
      rememberLoginReturn("/cart");
      window.location.assign(accountLoginHref("/cart"));
      return null;
    }
    if (!storeVerified || !activeStore?.id)
      throw new Error("Add a product and verify your delivery area first.");
    const data = await createSharedCart({
      storeId: activeStore.id,
      areaLabel: `${activeStore.city || ""} ${pincode || ""}`.trim(),
      pincode: pincode || activeStore.pincode,
      items: cart.map((item) => ({ id: item.id, qty: item.qty })),
    });
    const next = {
      inviteToken: data.inviteToken,
      memberToken: data.memberToken,
      expiresAt: data.cart.expiresAt,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    return next;
  }

  return (
    <CartSessionContext.Provider
      value={{ session, sessionReady, error, changeItem, invite, clearSession }}
    >
      {children}
    </CartSessionContext.Provider>
  );
}

export function useCartSession() {
  return useContext(CartSessionContext);
}
