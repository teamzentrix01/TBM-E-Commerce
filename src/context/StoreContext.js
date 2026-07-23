"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchProduct, resolveStoreByPincode } from "@/lib/api";
import { getCurrentCustomer } from "@/lib/ecommerceApi";

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
  const [storeVerified, setStoreVerified] = useState(false);
  const [pincode, setPincode] = useState("");
  const [ready, setReady] = useState(false);
  const [locationGate, setLocationGate] = useState(null);

  useEffect(() => {
    setCart(readStorage("tbm-cart", []));
    setWishlist(readStorage("tbm-wishlist", []));
    setAddresses(readStorage("tbm-addresses", []));
    setOrders(readStorage("tbm-orders", []));
    setActiveStore(readStorage("tbm-active-store", null));
    setStoreVerified(sessionStorage.getItem("tbm-store-verified") === "true");
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
    if (!ready) return;
    if (storeVerified) sessionStorage.setItem("tbm-store-verified", "true");
    else sessionStorage.removeItem("tbm-store-verified");
  }, [ready, storeVerified]);
  useEffect(() => {
    if (ready && pincode) localStorage.setItem("tbm-pincode", pincode);
  }, [pincode, ready]);

  const selectStore = useCallback((store, deliveryPincode = "", verified = false) => {
    setActiveStore(store);
    setStoreVerified(verified);
    if (deliveryPincode) setPincode(deliveryPincode);
    setCart((current) =>
      current.filter(
        (item) =>
          !item.store_id || sameProduct(item.store_id, store?.id),
      ),
    );
  }, []);

  const commitCartUpdate = useCallback(
    (product, amount, selectedStore = activeStore) => {
      if (!product || !amount) return false;
      const productId = product.id;
      const storeId = product.store_id || selectedStore?.id || null;
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
      return true;
    },
    [activeStore?.id],
  );

  const verifyLocationAndAdd = useCallback(
    async (product) => {
      setLocationGate({
        product,
        status: "Getting your current location...",
        error: "",
      });
      try {
        if (!navigator.geolocation) {
          throw new Error("Location is not supported by this browser.");
        }
        const coordinates = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            ({ coords }) =>
              resolve({
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
              }),
            () =>
              reject(
                new Error(
                  "Please allow current location access to find a store within 5 km.",
                ),
              ),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        });
        setLocationGate((current) => ({
          ...current,
          status: "Checking stores within 5 km...",
        }));
        const resolved = await resolveStoreByPincode(
          pincode || activeStore?.pincode || "201304",
          coordinates,
        );
        const distance = Number(resolved.store?.delivery_distance_km);
        const radius = Math.min(
          Number(resolved.store?.delivery_radius_km || 5),
          5,
        );
        if (!resolved.store || !Number.isFinite(distance) || distance > radius) {
          throw new Error(
            "Sorry, no Buyzaar Mart store is available within 5 km of your current location.",
          );
        }
        const store = resolved.store;
        const productData = await fetchProduct(product.id, store.id);
        const storeProduct = productData.product || productData;
        if (!storeProduct || Number(storeProduct.stock || 0) < 1) {
          throw new Error(
            `${product.name} is not available at your nearest store.`,
          );
        }
        selectStore(store, store.pincode || pincode, true);
        commitCartUpdate(
          { ...storeProduct, store_id: store.id },
          1,
          store,
        );
        setLocationGate(null);
        try {
          await getCurrentCustomer();
        } catch {
          localStorage.setItem("tbm-login-return", "/checkout");
          window.location.assign("/account?returnTo=%2Fcheckout");
        }
      } catch (error) {
        setLocationGate((current) => ({
          ...current,
          status: "",
          error: error.message || "Unable to verify your delivery location.",
        }));
      }
    },
    [activeStore, commitCartUpdate, pincode, selectStore],
  );

  const updateCart = useCallback(
    (product, amount) => {
      if (!product || !amount) return false;
      if (amount > 0 && !storeVerified) {
        verifyLocationAndAdd(product);
        return false;
      }
      return commitCartUpdate(product, amount);
    },
    [commitCartUpdate, storeVerified, verifyLocationAndAdd],
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
      setStoreVerified,
      setAddresses,
      setCart,
      setOrders,
      setPincode,
      toggleWishlist,
      updateCart,
      storeVerified,
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
    storeVerified,
    toggleWishlist,
    updateCart,
    wishlist,
  ]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      {locationGate && (
        <div className="flow-gate-backdrop" role="presentation">
          <section
            aria-labelledby="location-gate-title"
            aria-modal="true"
            className="flow-gate"
            role="dialog"
          >
            <button
              aria-label="Close"
              className="flow-gate-close"
              onClick={() => setLocationGate(null)}
            >
              ×
            </button>
            <span className="flow-gate-icon">⌖</span>
            <small>DELIVERY CHECK</small>
            <h2 id="location-gate-title">Verifying your current location</h2>
            <p>
              We only use your location to select a Buyzaar Mart within 5 km.
              Stores are never exposed or manually selected.
            </p>
            {locationGate.status && (
              <div className="flow-gate-status">{locationGate.status}</div>
            )}
            {locationGate.error && (
              <>
                <div className="flow-gate-error">{locationGate.error}</div>
                <button
                  className="flow-gate-retry"
                  onClick={() => verifyLocationAndAdd(locationGate.product)}
                >
                  Try current location again
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error("useStore must be used within StoreProvider");
  }
  return value;
}
