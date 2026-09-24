/** Build account login URL that returns the user here after sign-in. */
export function accountLoginHref(returnTo = "/") {
  const path = String(returnTo || "/").startsWith("/")
    ? String(returnTo || "/")
    : "/";
  return `/account?returnTo=${encodeURIComponent(path)}`;
}

export function rememberLoginReturn(returnTo = "/") {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("tbm-login-return", returnTo);
  } catch {
    /* ignore */
  }
}
