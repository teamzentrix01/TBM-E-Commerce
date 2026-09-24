"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/context/StoreContext";
import { fetchProducts, fetchStores, resolveStoreByPincode } from "@/lib/api";

async function pickStoreWithProducts(preferredStore = null) {
  const storesPayload = await fetchStores();
  const stores = storesPayload?.records || [];
  if (!stores.length) return preferredStore;

  const candidates = preferredStore?.id
    ? [
        preferredStore,
        ...stores.filter((store) => String(store.id) !== String(preferredStore.id)),
      ]
    : stores;

  for (const store of candidates) {
    try {
      const data = await fetchProducts({
        storeId: store.id,
        pageSize: 1,
      });
      if ((data?.records || []).length > 0) {
        return store;
      }
    } catch {
      // try next store
    }
  }

  return preferredStore || stores[0] || null;
}

export default function useCatalogStore() {
  const {
    activeStore,
    locationBootstrapped,
    pincode,
    ready,
    selectStore,
  } = useStore();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    if (!ready || !locationBootstrapped) return;
    let cancelled = false;
    setError("");
    setCatalogReady(false);

    const code =
      String(pincode || activeStore?.pincode || "201304")
        .replace(/\D/g, "")
        .slice(0, 6) || "201304";

    (async () => {
      let candidate = activeStore;

      if (!candidate?.id) {
        try {
          const data = await resolveStoreByPincode(code);
          candidate = data?.store || null;
        } catch {
          candidate = null;
        }
      }

      const storeWithStock = await pickStoreWithProducts(candidate);
      if (cancelled) return;

      if (!storeWithStock?.id) {
        setError("No local store with products is available.");
        setCatalogReady(true);
        return;
      }

      if (String(activeStore?.id) !== String(storeWithStock.id)) {
        selectStore(
          storeWithStock,
          storeWithStock.pincode || code,
          false,
        );
      }
      setCatalogReady(true);
    })().catch((failure) => {
      if (!cancelled) {
        setError(failure.message || "Unable to load store");
        setCatalogReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    locationBootstrapped,
    activeStore,
    pincode,
    selectStore,
    attempt,
  ]);

  return {
    store: activeStore,
    ready: ready && locationBootstrapped && catalogReady && Boolean(activeStore?.id),
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
