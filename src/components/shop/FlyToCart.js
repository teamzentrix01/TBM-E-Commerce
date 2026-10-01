"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const FlyToCartContext = createContext(null);

function visibleCartTarget() {
  return [...document.querySelectorAll("[data-cart-target]")].find((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0
    );
  });
}

function sourceImage(product, origin) {
  const card = origin?.closest?.("[data-product-id]");
  const localImage = card?.querySelector?.(".bz-product-media img, .bz-gallery-main img");
  if (localImage) return localImage;
  const productId = String(product?.id ?? "");
  return [...document.querySelectorAll("[data-product-id]")]
    .find((node) => node.dataset.productId === productId)
    ?.querySelector(".bz-product-media img, .bz-gallery-main img");
}

function preloadFlightImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const timeout = window.setTimeout(() => finish(false), 2500);
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(loaded);
    };
    const decode = () => {
      if (!image.naturalWidth) {
        finish(false);
        return;
      }
      if (typeof image.decode === "function") {
        image.decode().then(() => finish(true), () => finish(false));
      } else {
        finish(true);
      }
    };
    image.onload = decode;
    image.onerror = () => finish(false);
    image.src = src;
    if (image.complete) decode();
  });
}

export function FlyToCartProvider({ children }) {
  const reduceMotion = useReducedMotion();
  const [flights, setFlights] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const prepareFlight = useCallback(
    (product, origin) => {
      if (reduceMotion || window.innerWidth > 900) return null;
      const image = sourceImage(product, origin);
      const target = visibleCartTarget();
      const src = image?.currentSrc || image?.src;
      if (!image || !target || !src) return null;
      const sourceRect = image.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (!sourceRect.width || !sourceRect.height) return null;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        src,
        imageReady: preloadFlightImage(src),
        alt: "",
        sourceRect: {
          left: sourceRect.left,
          top: sourceRect.top,
          width: sourceRect.width,
          height: sourceRect.height,
        },
        targetRect: {
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width,
          height: targetRect.height,
        },
        target,
      };
    },
    [reduceMotion],
  );

  const launchFlight = useCallback(async (flight) => {
    if (!flight) return;
    if (!(await flight.imageReady)) return;
    setFlights((current) => [...current.slice(-2), flight]);
  }, []);

  const pulseCartTarget = useCallback((target = visibleCartTarget()) => {
    if (reduceMotion || !target?.isConnected) return;
    target.classList.remove("is-cart-arrival");
    void target.offsetWidth;
    target.classList.add("is-cart-arrival");
    window.setTimeout(() => target?.classList.remove("is-cart-arrival"), 420);
  }, [reduceMotion]);

  const finishFlight = useCallback((flight) => {
    setFlights((current) => current.filter((item) => item.id !== flight.id));
    pulseCartTarget(flight.target);
  }, [pulseCartTarget]);

  const showCartToast = useCallback((product, onUndo) => {
    window.clearTimeout(toastTimer.current);
    setToast({
      id: `${Date.now()}-${product?.id || "item"}`,
      name: product?.name || "Item",
      onUndo,
    });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const value = useMemo(
    () => ({ prepareFlight, launchFlight, pulseCartTarget, showCartToast }),
    [prepareFlight, launchFlight, pulseCartTarget, showCartToast],
  );

  return (
    <FlyToCartContext.Provider value={value}>
      {children}
      <div className="bz-fly-layer" aria-hidden="true">
        <AnimatePresence>
          {flights.map((flight) => {
            const source = flight.sourceRect;
            const target = flight.targetRect;
            const deltaX = target.left + target.width / 2 - (source.left + source.width / 2);
            const deltaY = target.top + target.height / 2 - (source.top + source.height / 2);
            const endScale = Math.min(
              0.72,
              Math.max(0.46, 60 / Math.max(source.width, source.height)),
            );
            return (
              <motion.img
                key={flight.id}
                className="bz-flying-product"
                src={flight.src}
                alt=""
                initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
                animate={{
                  x: [0, deltaX * 0.55, deltaX],
                  y: [0, Math.min(deltaY * 0.35, -72), deltaY],
                  scale: [1, 1.04, endScale],
                  rotate: [0, -3, 2],
                  opacity: [1, 1, 1],
                }}
                transition={{ duration: 0.92, ease: [0.22, 0.72, 0.2, 1] }}
                style={{
                  left: source.left,
                  top: source.top,
                  width: source.width,
                  height: source.height,
                }}
                onAnimationComplete={() => finishFlight(flight)}
              />
            );
          })}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {toast ? (
          <motion.aside
            key={toast.id}
            className="bz-cart-toast"
            role="status"
            initial={reduceMotion ? false : { y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 12, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span aria-hidden="true">✓</span>
            <p><b>Added to cart</b><small>{toast.name}</small></p>
            <button
              type="button"
              onClick={async () => {
                const undo = toast.onUndo;
                setToast(null);
                window.clearTimeout(toastTimer.current);
                await undo?.();
              }}
            >
              Undo
            </button>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </FlyToCartContext.Provider>
  );
}

export function useFlyToCart() {
  const context = useContext(FlyToCartContext);
  if (!context) throw new Error("useFlyToCart must be used within FlyToCartProvider");
  return context;
}
