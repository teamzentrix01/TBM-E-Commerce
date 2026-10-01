"use client";

import { useEffect, useState } from "react";
import { ArrowUp, WifiOff } from "lucide-react";

export default function AppExperience() {
  const [online, setOnline] = useState(true);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const syncNetwork = () => setOnline(navigator.onLine);
    const syncScroll = () => setShowTop(window.scrollY > 700);
    const hapticTap = (event) => {
      if (!navigator.vibrate || !event.target.closest(".bz-add, .bz-quantity button, .bz-bottom-nav a")) return;
      navigator.vibrate(8);
    };
    syncNetwork();
    syncScroll();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    window.addEventListener("scroll", syncScroll, { passive: true });
    document.addEventListener("click", hapticTap);
    return () => {
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
      window.removeEventListener("scroll", syncScroll);
      document.removeEventListener("click", hapticTap);
    };
  }, []);

  return (
    <>
      {!online ? <div className="bz-offline-pill" role="status"><WifiOff size={15} /> You are offline</div> : null}
      {showTop ? (
        <button className="bz-back-to-top" type="button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <ArrowUp size={18} />
        </button>
      ) : null}
    </>
  );
}
