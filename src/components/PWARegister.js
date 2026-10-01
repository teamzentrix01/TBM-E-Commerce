"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    const rememberInstallPrompt = (event) => {
      event.preventDefault();
      window.__buyzaarInstallPrompt = event;
      window.dispatchEvent(new Event("buyzaar-install-ready"));
    };
    window.addEventListener("beforeinstallprompt", rememberInstallPrompt);
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) return () => window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
  }, []);
  return null;
}
