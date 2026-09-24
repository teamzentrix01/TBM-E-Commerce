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
import {
  assertStoreWithinRadius,
  getCurrentCoordinates,
} from "@/lib/location.mjs";

const StoreContext = createContext(null);
const FULFILLMENT_TTL_MS = 2 * 60 * 60 * 1000;

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
  const [customer, setCustomer] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [locationGate, setLocationGate] = useState(null);
  const [locationBootstrapped, setLocationBootstrapped] = useState(false);

  useEffect(() => {
    setCart(readStorage("tbm-cart", []));
    setWishlist(readStorage("tbm-wishlist", []));
    setAddresses(readStorage("tbm-addresses", []));
    setOrders(readStorage("tbm-orders", []));
    const fulfillment = readStorage("tbm-fulfillment-context", null);
    const fulfillmentValid =
      fulfillment?.store &&
      Number(fulfillment.expiresAt || 0) > Date.now();
    setActiveStore(
      fulfillmentValid
        ? fulfillment.store
        : readStorage("tbm-active-store", null),
    );
    setStoreVerified(Boolean(fulfillmentValid));
    setPincode(
      (fulfillmentValid && fulfillment.pincode) ||
        localStorage.getItem("tbm-pincode") ||
        "",
    );
    setReady(true);
  }, []);

  const refreshCustomer = useCallback(async () => {
    try {
      const data = await getCurrentCustomer();
      setCustomer(data.user || null);
      return data.user || null;
    } catch {
      setCustomer(null);
      return null;
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    refreshCustomer();
  }, [refreshCustomer]);

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
    if (storeVerified && activeStore) {
      localStorage.setItem(
        "tbm-fulfillment-context",
        JSON.stringify({
          store: activeStore,
          pincode,
          verifiedAt: Date.now(),
          expiresAt: Date.now() + FULFILLMENT_TTL_MS,
        }),
      );
    } else {
      localStorage.removeItem("tbm-fulfillment-context");
    }
  }, [activeStore, pincode, ready, storeVerified]);
  useEffect(() => {
    if (!storeVerified) return;
    const timer = window.setTimeout(
      () => setStoreVerified(false),
      FULFILLMENT_TTL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [storeVerified]);
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

  /** Resolve nearest store from GPS (within 5 km) without selecting it. */
  const lookupNearbyStore = useCallback(
    async ({ pincodeHint = "" } = {}) => {
      const coordinates = await getCurrentCoordinates();
      const hint =
        String(pincodeHint || pincode || activeStore?.pincode || "201304").replace(
          /\D/g,
          "",
        ) || "201304";
      const resolved = await resolveStoreByPincode(hint, coordinates, {
        allowPincodeFallback: true,
      });
      assertStoreWithinRadius(resolved.store);
      return resolved.store;
    },
    [activeStore?.pincode, pincode],
  );

  /** Resolve nearest store from GPS (within 5 km) and optionally mark verified. */
  const detectNearbyStore = useCallback(
    async ({ pincodeHint = "", markVerified = true } = {}) => {
      const store = await lookupNearbyStore({ pincodeHint });
      const nextPincode =
        store?.pincode ||
        String(pincodeHint || pincode || "").replace(/\D/g, "") ||
        "201304";
      selectStore(store, nextPincode, markVerified);
      return store;
    },
    [lookupNearbyStore, pincode, selectStore],
  );

  /** Resolve store from a 6-digit pincode without selecting it. */
  const lookupByPincode = useCallback(async (deliveryPincode) => {
    const code = String(deliveryPincode || "").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) throw new Error("Enter a valid 6 digit pincode.");
    const resolved = await resolveStoreByPincode(code);
    if (!resolved.store) throw new Error("This pincode is not serviceable.");
    return resolved.store;
  }, []);

  /** Resolve store from a 6-digit pincode and select it. */
  const resolveByPincode = useCallback(
    async (deliveryPincode, { markVerified = true } = {}) => {
      const store = await lookupByPincode(deliveryPincode);
      const code = String(deliveryPincode || "").replace(/\D/g, "").slice(0, 6);
      selectStore(store, code, markVerified);
      return store;
    },
    [lookupByPincode, selectStore],
  );

  // First visit: try GPS once, then allow catalog fallback.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function bootstrap() {
      if (storeVerified || activeStore?.id || pincode) {
        if (!cancelled) setLocationBootstrapped(true);
        return;
      }
      let shouldDetect = true;
      try {
        if (sessionStorage.getItem("tbm-location-autodetect")) {
          shouldDetect = false;
        } else {
          sessionStorage.setItem("tbm-location-autodetect", "1");
        }
      } catch {
        shouldDetect = false;
      }
      if (shouldDetect) {
        try {
          await detectNearbyStore({ markVerified: true });
        } catch {
          /* permission denied / out of range — catalog falls back */
        }
      }
      if (!cancelled) setLocationBootstrapped(true);
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
    // Only run after storage hydrate; detectNearbyStore is stable enough for one boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
        draftPincode: pincode || activeStore?.pincode || "",
      });
      try {
        const coordinates = await getCurrentCoordinates();
        setLocationGate((current) => ({
          ...current,
          status: "Checking stores within 5 km...",
        }));
        const resolved = await resolveStoreByPincode(
          pincode || activeStore?.pincode || "201304",
          coordinates,
          { allowPincodeFallback: true },
        );
        assertStoreWithinRadius(resolved.store);
        const store = resolved.store;
        const productsToCheck = [
          ...cart,
          ...(cart.some((item) => sameProduct(item.id, product.id))
            ? []
            : [product]),
        ];
        const refreshed = await Promise.all(
          productsToCheck.map(async (item) => {
            try {
              const data = await fetchProduct(item.id, store.id);
              return { previous: item, product: data.product || data };
            } catch {
              return { previous: item, product: null };
            }
          }),
        );
        const requested = refreshed.find(({ previous }) =>
          sameProduct(previous.id, product.id),
        );
        const storeProduct = requested?.product;
        if (!storeProduct || Number(storeProduct.stock || 0) < 1) {
          throw new Error(
            `${product.name} is not available at your nearest store.`,
          );
        }
        const unavailable = [];
        const nextCart = refreshed.flatMap(({ previous, product: latest }) => {
          const stock = Math.floor(Number(latest?.stock || 0));
          if (!latest || stock < 1) {
            unavailable.push(previous.name);
            return [];
          }
          const requestedItem = sameProduct(previous.id, product.id);
          const currentQty = cart.find((item) =>
            sameProduct(item.id, previous.id),
          )?.qty || 0;
          return [{
            ...previous,
            ...latest,
            store_id: store.id,
            qty: Math.min(
              currentQty + (requestedItem ? 1 : 0),
              stock,
            ),
          }];
        });
        selectStore(store, store.pincode || pincode, true);
        setCart(nextCart);
        setLocationGate(
          unavailable.length
            ? {
                product,
                status: "",
                error: "",
                message: `${product.name} was added. ${unavailable.length} unavailable ${
                  unavailable.length === 1 ? "item was" : "items were"
                } removed after checking your nearby store.`,
                completed: true,
              }
            : null,
        );
      } catch (error) {
        setLocationGate((current) => ({
          ...current,
          status: "",
          error: error.message || "Unable to verify your delivery location.",
        }));
      }
    },
    [activeStore, cart, pincode, selectStore],
  );

  const verifyPincodeAndAdd = useCallback(async () => {
    const product = locationGate?.product;
    const deliveryPincode = String(locationGate?.draftPincode || "")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!product || deliveryPincode.length !== 6) return;
    setLocationGate((current) => ({
      ...current,
      status: "Checking delivery availability...",
      error: "",
    }));
    try {
      const resolved = await resolveStoreByPincode(deliveryPincode);
      const store = resolved.store;
      if (!store) throw new Error("This pincode is not serviceable.");
      const productsToCheck = [
        ...cart,
        ...(cart.some((item) => sameProduct(item.id, product.id))
          ? []
          : [product]),
      ];
      const refreshed = await Promise.all(
        productsToCheck.map(async (item) => {
          try {
            const data = await fetchProduct(item.id, store.id);
            return { previous: item, product: data.product || data };
          } catch {
            return { previous: item, product: null };
          }
        }),
      );
      const requested = refreshed.find(({ previous }) =>
        sameProduct(previous.id, product.id),
      );
      const storeProduct = requested?.product;
      if (!storeProduct || Number(storeProduct.stock || 0) < 1) {
        throw new Error(
          `${product.name} is not available at your nearest store.`,
        );
      }
      const unavailable = [];
      const nextCart = refreshed.flatMap(({ previous, product: latest }) => {
        const stock = Math.floor(Number(latest?.stock || 0));
        if (!latest || stock < 1) {
          unavailable.push(previous.name);
          return [];
        }
        const currentQty = cart.find((item) =>
          sameProduct(item.id, previous.id),
        )?.qty || 0;
        return [{
          ...previous,
          ...latest,
          store_id: store.id,
          qty: Math.min(
            currentQty + (sameProduct(previous.id, product.id) ? 1 : 0),
            stock,
          ),
        }];
      });
      selectStore(store, deliveryPincode, true);
      setCart(nextCart);
      setLocationGate(
        unavailable.length
          ? {
              product,
              status: "",
              error: "",
              message: `${product.name} was added. ${unavailable.length} unavailable ${
                unavailable.length === 1 ? "item was" : "items were"
              } removed after checking this delivery area.`,
              completed: true,
            }
          : null,
      );
    } catch (error) {
      setLocationGate((current) => ({
        ...current,
        status: "",
        error: error.message || "This pincode is not serviceable.",
      }));
    }
  }, [cart, locationGate, selectStore]);

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
      authReady,
      cart,
      cartCount,
      cartMrpTotal,
      cartSavings: Math.max(cartMrpTotal - cartTotal, 0),
      cartTotal,
      customer,
      detectNearbyStore,
      locationBootstrapped,
      lookupByPincode,
      lookupNearbyStore,
      orders,
      pincode,
      ready,
      refreshCustomer,
      removeFromCart,
      resolveByPincode,
      selectStore,
      setStoreVerified,
      setAddresses,
      setCart,
      setCustomer,
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
    authReady,
    cart,
    customer,
    detectNearbyStore,
    locationBootstrapped,
    lookupByPincode,
    lookupNearbyStore,
    orders,
    pincode,
    ready,
    removeFromCart,
    refreshCustomer,
    resolveByPincode,
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
            {!locationGate.completed && <div className="flow-gate-manual">
              <span>or enter your delivery pincode</span>
              <div>
                <input
                  aria-label="Delivery pincode"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 digit pincode"
                  value={locationGate.draftPincode || ""}
                  onChange={(event) =>
                    setLocationGate((current) => ({
                      ...current,
                      draftPincode: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
                <button
                  disabled={
                    String(locationGate.draftPincode || "").length !== 6
                  }
                  onClick={verifyPincodeAndAdd}
                >
                  Check
                </button>
              </div>
              <small>
                Exact 5 km serviceability is checked again with your delivery
                address at checkout.
              </small>
            </div>}
            {locationGate.completed && (
              <>
                <div className="flow-gate-status">{locationGate.message}</div>
                <button
                  className="flow-gate-retry"
                  onClick={() => setLocationGate(null)}
                >
                  Continue shopping
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
