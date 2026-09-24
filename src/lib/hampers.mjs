/** Gift hamper helpers — pack data comes from Sync public API. */

export const HAMPER_MESSAGE_KEY = "bz_hamper_gift_message";
export const HAMPER_STYLE_KEY = "bz_hamper_style_name";

export function hamperTotal(items) {
  return items.reduce(
    (sum, item) => sum + Number(item.selling_price || 0) * (item.qty || 1),
    0,
  );
}

export function saveHamperGiftMeta({ message = "", styleName = "" } = {}) {
  if (typeof window === "undefined") return;
  try {
    if (message) sessionStorage.setItem(HAMPER_MESSAGE_KEY, message);
    else sessionStorage.removeItem(HAMPER_MESSAGE_KEY);
    if (styleName) sessionStorage.setItem(HAMPER_STYLE_KEY, styleName);
    else sessionStorage.removeItem(HAMPER_STYLE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function readHamperGiftMeta() {
  if (typeof window === "undefined") {
    return { message: "", styleName: "" };
  }
  try {
    return {
      message: sessionStorage.getItem(HAMPER_MESSAGE_KEY) || "",
      styleName: sessionStorage.getItem(HAMPER_STYLE_KEY) || "",
    };
  } catch {
    return { message: "", styleName: "" };
  }
}

export function clearHamperGiftMeta() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(HAMPER_MESSAGE_KEY);
    sessionStorage.removeItem(HAMPER_STYLE_KEY);
  } catch {
    // ignore
  }
}
