"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const StoreContext = createContext(null);

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function sameProduct(left, right) {
  return String(left) === String(right);
}

export function StoreProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeStore, setActiveStore] = useState(null);
  const [pincode, setPincode] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCart(readStorage("tbm-cart", []));
    setWishlist(readStorage("tbm-wishlist", []));
    setAddresses(readStorage("tbm-addresses", []));
    setOrders(readStorage("tbm-orders", []));
    setActiveStore(readStorage("tbm-active-store", null));
    setPincode(localStorage.getItem("tbm-pincode") || "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("tbm-cart", JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("tbm-wishlist", JSON.stringify(wishlist));
  }, [wishlist, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("tbm-addresses", JSON.stringify(addresses));
  }, [addresses, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("tbm-orders", JSON.stringify(orders));
  }, [orders, ready]);
  useEffect(() => {
    if (!ready) return;
    if (activeStore) {
      localStorage.setItem("tbm-active-store", JSON.stringify(activeStore));
      localStorage.setItem("tbm-store-id", String(activeStore.id));
    } else {
      localStorage.removeItem("tbm-active-store");
      localStorage.removeItem("tbm-store-id");
    }
  }, [activeStore, ready]);
  useEffect(() => {
    if (ready && pincode) localStorage.setItem("tbm-pincode", pincode);
  }, [pincode, ready]);

  const selectStore = useCallback((store, deliveryPincode = "") => {
    setActiveStore(store);
    if (deliveryPincode) setPincode(deliveryPincode);
    setCart((current) =>
      current.filter(
        (item) =>
          !item.store_id || sameProduct(item.store_id, store?.id),
      ),
    );
  }, []);

  const updateCart = useCallback(
    (product, amount) => {
      if (!product || !amount) return;
      const productId = product.id;
      const storeId = product.store_id || activeStore?.id || null;
      const maxStock = Math.max(0, Math.floor(Number(product.stock || 0)));

      setCart((current) => {
        const storeCart = current.filter(
          (item) =>
            !storeId ||
            !item.store_id ||
            sameProduct(item.store_id, storeId),
        );
        const found = storeCart.find((item) =>
          sameProduct(item.id, productId),
        );

        if (!found && amount > 0 && maxStock > 0) {
          return [
            ...storeCart,
            {
              ...product,
              store_id: storeId,
              qty: Math.min(Math.max(1, amount), maxStock),
            },
          ];
        }
        if (!found) return storeCart;

        return storeCart
          .map((item) => {
            if (!sameProduct(item.id, productId)) return item;
            const itemStock = Math.max(
              0,
              Math.floor(Number(product.stock ?? item.stock ?? 0)),
            );
            return {
              ...item,
              ...product,
              store_id: storeId,
              qty: Math.min(Math.max(item.qty + amount, 0), itemStock),
            };
          })
          .filter((item) => item.qty > 0);
      });
    },
    [activeStore?.id],
  );

  const removeFromCart = useCallback((productId) => {
    setCart((current) =>
      current.filter((item) => !sameProduct(item.id, productId)),
    );
  }, []);

  const toggleWishlist = useCallback((product) => {
    setWishlist((current) =>
      current.some((item) => sameProduct(item.id, product.id))
        ? current.filter((item) => !sameProduct(item.id, product.id))
        : [...current, product],
    );
  }, []);

  const value = useMemo(() => {
    const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const cartTotal = cart.reduce(
      (sum, item) => sum + Number(item.selling_price || 0) * item.qty,
      0,
    );
    const cartMrpTotal = cart.reduce(
      (sum, item) =>
        sum +
        Number(item.mrp || item.selling_price || 0) * item.qty,
      0,
    );

    return {
      activeStore,
      addresses,
      cart,
      cartCount,
      cartMrpTotal,
      cartSavings: Math.max(cartMrpTotal - cartTotal, 0),
      cartTotal,
      orders,
      pincode,
      ready,
      removeFromCart,
      selectStore,
      setAddresses,
      setCart,
      setOrders,
      setPincode,
      toggleWishlist,
      updateCart,
      wishlist,
    };
  }, [
    activeStore,
    addresses,
    cart,
    orders,
    pincode,
    ready,
    removeFromCart,
    selectStore,
    toggleWishlist,
    updateCart,
    wishlist,
  ]);

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error("useStore must be used within StoreProvider");
  }
  return value;
}
