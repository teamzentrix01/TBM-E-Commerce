"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/context/StoreContext";
import { fetchProducts, fetchStores, resolveStoreByPincode } from "@/lib/api";

const VERIFIED_STORE_KEY = "bz-verified-store";
const VERIFIED_STORE_TTL_MS = 10 * 60 * 1000;

function readVerifiedStoreId() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(VERIFIED_STORE_KEY) || "null");
    if (raw && Date.now() - raw.at < VERIFIED_STORE_TTL_MS) return String(raw.id);
  } catch {
    // ignore
  }
  return null;
}

function writeVerifiedStoreId(id) {
  try {
    sessionStorage.setItem(VERIFIED_STORE_KEY, JSON.stringify({ id: String(id), at: Date.now() }));
  } catch {
    // ignore
  }
}

async function storeHasProducts(storeId) {
  try {
    const data = await fetchProducts({ storeId, pageSize: 1 });
    return (data?.records || []).length > 0;
  } catch {
    return false;
  }
}

async function pickStoreWithProducts(preferredStore = null) {
  if (preferredStore?.id && readVerifiedStoreId() === String(preferredStore.id)) {
    return preferredStore;
  }

  // Probe the preferred store and load the store list in parallel instead of one after another.
  const [preferredOk, storesPayload] = await Promise.all([
    preferredStore?.id ? storeHasProducts(preferredStore.id) : Promise.resolve(false),
    fetchStores().catch(() => null),
  ]);
  if (preferredOk) {
    writeVerifiedStoreId(preferredStore.id);
    return preferredStore;
  }

  const stores = (storesPayload?.records || []).filter(
    (store) => String(store.id) !== String(preferredStore?.id),
  );
  if (!stores.length) return preferredStore;

  const results = await Promise.all(stores.map((store) => storeHasProducts(store.id)));
  const found = stores.find((_, index) => results[index]);
  if (found) {
    writeVerifiedStoreId(found.id);
    return found;
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
