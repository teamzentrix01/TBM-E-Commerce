"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  Check,
  Clock3,
  CreditCard,
  History,
  ArrowRight,
  LogOut,
  Mail,
  MapPin,
  Phone,
  UserRound,
  X,
  Plus,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { useStore } from "@/context/StoreContext";
import {
  loginWithGoogle,
  logoutCustomer,
  sendLoginOtp,
  updateCustomerProfile,
  verifyLoginOtp,
  fetchCustomerAddresses,
  saveCustomerAddress,
  deleteCustomerAddress,
} from "@/lib/ecommerceApi";

export default function Account() {
  const router = useRouter();
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [profile, setProfile] = useState({ name: "", email: "", image_url: "" });
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const {
    addresses,
    authReady,
    customer,
    setAddresses,
    setCustomer,
  } = useStore();
  const loading = !authReady;
  const loggedIn = Boolean(customer);
  const [addressManagerOpen, setAddressManagerOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  
  // State for new address form
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({
    name: "",
    phone: "",
    line: "",
    city: "",
    pincode: "",
  });
  const [addressFormError, setAddressFormError] = useState("");

  const displayName = profile.name || "Customer";
  const displayEmail = profile.email || "Email not added";
  const displayPhone = phone || "Mobile number not added";

  function focusProfileForm() {
    setProfileEditOpen(true);
    setTimeout(() => {
      document.getElementById("profile-edit-form")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      document.getElementById("profile-name-input")?.focus();
    }, 100);
  }

  async function handleDeleteAddress(indexToDelete) {
    const addrToDelete = addresses[indexToDelete];
    if (addrToDelete && addrToDelete.id) {
      try {
        await deleteCustomerAddress(addrToDelete.id);
        setAddresses((current) => current.filter((_, index) => index !== indexToDelete));
      } catch (e) {
        console.error("Failed to delete address:", e);
      }
    } else {
      setAddresses((current) => current.filter((_, index) => index !== indexToDelete));
    }
  }

  async function handleAddAddress(event) {
    event.preventDefault();
    if (
      !addressForm.name.trim() ||
      addressForm.phone.replace(/\D/g, "").length !== 10 ||
      !addressForm.line.trim() ||
      !addressForm.city.trim() ||
      addressForm.pincode.replace(/\D/g, "").length !== 6
    ) {
      setAddressFormError("Please fill all fields correctly. Phone must be 10 digits and Pincode 6 digits.");
      return;
    }
    try {
      const savedAddr = await saveCustomerAddress({
        name: addressForm.name.trim(),
        phone: addressForm.phone.replace(/\D/g, ""),
        line: addressForm.line.trim(),
        city: addressForm.city.trim(),
        pincode: addressForm.pincode.replace(/\D/g, ""),
      });
      setAddresses((current) => [...current, savedAddr]);
      setAddressForm({ name: "", phone: "", line: "", city: "", pincode: "" });
      setShowAddressForm(false);
      setAddressFormError("");
    } catch (e) {
      setAddressFormError(e.message || "Failed to save address");
    }
  }

  useEffect(() => {
    if (customer) {
        setPhone(customer.phone || "");
        setProfile({
          name: customer.name || "",
          email: customer.email || "",
          image_url: customer.image_url || "",
        });
    }
  }, [customer]);

  useEffect(() => {
    if (loggedIn) {
      localStorage.removeItem("tbm-addresses");
      fetchCustomerAddresses()
        .then((data) => {
          setAddresses(data || []);
        })
        .catch(() => {});
    }
  }, [loggedIn]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.google) {
      initGoogleSignIn();
    }
  }, []);

  function initGoogleSignIn() {
    if (typeof window === "undefined" || !window.google) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "220455486884-25pldq1933q4kcl72q0e8j3mrtu9216u.apps.googleusercontent.com";
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleLogin,
      });
      setGoogleInitialized(true);
    } catch (e) {
      console.error("Google accounts initialize error:", e);
    }
  }

  useEffect(() => {
    if (googleInitialized && !loggedIn) {
      const btnEl = document.getElementById("google-signin-btn");
      if (btnEl) {
        btnEl.replaceChildren();
        window.google.accounts.id.renderButton(btnEl, {
          theme: "outline",
          size: "large",
          width: "360",
          text: "signin_with",
          shape: "rectangular",
        });
        window.requestAnimationFrame(() => {
          setGoogleButtonReady(Boolean(btnEl.querySelector("iframe")));
        });
      }
    }
  }, [googleInitialized, loggedIn]);

  function continueAfterLogin() {
    const params = new URLSearchParams(window.location.search);
    const returnTo =
      params.get("returnTo") ||
      localStorage.getItem("tbm-login-return");
    localStorage.removeItem("tbm-login-return");
    if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
      window.location.replace(returnTo);
    }
  }

  async function handleGoogleLogin(response) {
    setSubmitting(true);
    setError("");
    try {
      const result = await loginWithGoogle(response.credential);
      setProfile({
        name: result.user.name || "",
        email: result.user.email || "",
        image_url: result.user.image_url || "",
      });
      setPhone(result.user.phone || "");
      setCustomer(result.user);
      continueAfterLogin();
    } catch (requestError) {
      setError(requestError.message || "Google login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (!otpSent) {
        const result = await sendLoginOtp(phone);
        setOtpSent(true);
        if (result.developmentOtp) setOtp(result.developmentOtp);
      } else {
        const result = await verifyLoginOtp(phone, otp);
        setProfile({
          name: result.user.name || "",
          email: result.user.email || "",
          image_url: result.user.image_url || "",
        });
        setCustomer(result.user);
        continueAfterLogin();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await updateCustomerProfile({
        ...profile,
        phone: phone.replace(/\D/g, ""),
      });
      setProfile({
        name: result.user.name || "",
        email: result.user.email || "",
        image_url: result.user.image_url || "",
      });
      setPhone(result.user.phone || "");
      setCustomer(result.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await logoutCustomer().catch(() => {});
    setCustomer(null);
    setOtp("");
    setOtpSent(false);
    setAddresses([]);
    localStorage.removeItem("tbm-addresses");
    router.replace("/");
  }

  if (loading) {
    return (
      <>
        <AppHeader />
        <main className="bz-shell bz-empty">
          <UserRound size={42} />
          <h2>Loading your account…</h2>
        </main>
        <PageFooter />
      </>
    );
  }

  if (!loggedIn) {
    return (
      <>
        <AppHeader />
        <main className="bz-shell bz-login-page">
          <section className="bz-login-card">
            <span className="bz-eyebrow">THE BUYZAAR MART</span>
            <h1>Login or sign up</h1>
            <p className="bz-muted">
              Enter your mobile number to receive a secure OTP.
            </p>
            <form onSubmit={handleLogin} className="bz-login-form">
              <label>
                Mobile number
                <div className="bz-phone-row">
                  <b>+91</b>
                  <input
                    autoFocus
                    inputMode="numeric"
                    maxLength={10}
                    disabled={otpSent}
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="10 digit mobile"
                  />
                </div>
              </label>
              {otpSent && (
                <label>
                  OTP
                  <input
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Enter 6 digit OTP"
                  />
                </label>
              )}
              {error && (
                <p className="bz-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="bz-button bz-full"
                disabled={
                  submitting ||
                  phone.length !== 10 ||
                  (otpSent && otp.length !== 6)
                }
              >
                {submitting
                  ? "Please wait…"
                  : otpSent
                    ? "Verify OTP"
                    : "Continue"}
              </button>
              {otpSent && (
                <button
                  type="button"
                  className="bz-text-button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setError("");
                  }}
                >
                  Change mobile number
                </button>
              )}
            </form>
            <small className="bz-login-legal">
              By continuing you agree to our{" "}
              <Link href="/">terms and conditions</Link>.
            </small>
            <div className="bz-login-or">or</div>
            <div className="bz-google-login">
              <div id="google-signin-btn"></div>
              {!googleButtonReady && (
                <button
                  className="bz-button bz-button-light bz-full"
                  type="button"
                  onClick={() => {
                    initGoogleSignIn();
                    window.google?.accounts.id.prompt();
                  }}
                >
                  Continue with Google
                </button>
              )}
            </div>
            <Script
              src="https://accounts.google.com/gsi/client"
              onLoad={initGoogleSignIn}
              onReady={initGoogleSignIn}
              strategy="afterInteractive"
            />
          </section>
        </main>
        <PageFooter />
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-account-page">
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">YOUR PROFILE</span>
            <h1>My account</h1>
            <p className="bz-muted">
              Profile, orders and deliveries in one place.
            </p>
          </div>
        </div>

        <section className="bz-profile-hero">
          <div className="bz-profile-avatar">
            {profile.image_url ? (
              <img
                src={profile.image_url}
                alt={displayName}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="bz-profile-copy">
            <small>WELCOME BACK</small>
            <h2>{displayName}</h2>
            <p>{displayEmail}</p>
            <div className="bz-profile-meta">
              <span>
                <Phone size={14} /> {displayPhone}
              </span>
              <span className="bz-green">
                <ShieldCheck size={14} /> Verified
              </span>
            </div>
          </div>
          <div className="bz-profile-actions">
            <button
              type="button"
              className="bz-button bz-button-light"
              onClick={focusProfileForm}
            >
              <Pencil size={16} /> Edit profile
            </button>
            <button
              type="button"
              className="bz-button bz-button-light"
              onClick={logout}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </section>

        <section className="bz-account-shortcuts" aria-label="Account shortcuts">
          <Link href="/orders">
            <span>
              <History size={20} />
            </span>
            <div>
              <b>My orders</b>
              <small>Track and review purchases</small>
            </div>
            <ArrowRight size={18} />
          </Link>
          <button type="button" onClick={() => setAddressManagerOpen(true)}>
            <span>
              <MapPin size={20} />
            </span>
            <div>
              <b>Saved addresses</b>
              <small>{addresses.length} saved for delivery</small>
            </div>
            <ArrowRight size={18} />
          </button>
          <Link href="/cart">
            <span>
              <CreditCard size={20} />
            </span>
            <div>
              <b>Cart & checkout</b>
              <small>Review payment and delivery</small>
            </div>
            <ArrowRight size={18} />
          </Link>
          <button type="button" onClick={() => setSupportOpen(true)}>
            <span>
              <Phone size={20} />
            </span>
            <div>
              <b>Help & support</b>
              <small>We are here to help</small>
            </div>
            <ArrowRight size={18} />
          </button>
        </section>

        <section className="bz-account-details">
          <header>
            <div>
              <span className="bz-eyebrow">PERSONAL INFORMATION</span>
              <h2>Your details</h2>
            </div>
            <button
              type="button"
              className="bz-text-button"
              onClick={focusProfileForm}
            >
              <Pencil size={15} /> Edit
            </button>
          </header>
          <div className="bz-account-detail-grid">
            <div>
              <span>
                <UserRound size={18} />
              </span>
              <small>Full name</small>
              <b>{displayName}</b>
            </div>
            <div>
              <span>
                <Mail size={18} />
              </span>
              <small>Email address</small>
              <b>{displayEmail}</b>
            </div>
            <div>
              <span>
                <Phone size={18} />
              </span>
              <small>Mobile number</small>
              <b>{displayPhone}</b>
            </div>
            <div>
              <span>
                <MapPin size={18} />
              </span>
              <small>Saved addresses</small>
              <b>{addresses.length}</b>
            </div>
          </div>
        </section>

        {profileEditOpen && (
          <form
            id="profile-edit-form"
            className="bz-profile-form"
            onSubmit={saveProfile}
          >
            <div className="bz-section-heading">
              <div>
                <span className="bz-eyebrow">EDIT PROFILE</span>
                <h2>Update your details</h2>
              </div>
              <button
                type="button"
                className="bz-icon-button"
                aria-label="Close edit profile"
                onClick={() => setProfileEditOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              Full name
              <input
                id="profile-name-input"
                required
                value={profile.name}
                onChange={(event) =>
                  setProfile({ ...profile, name: event.target.value })
                }
              />
            </label>
            <label>
              Mobile number
              <input
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value.replace(/\D/g, ""))
                }
                placeholder="Add mobile number"
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={profile.email}
                onChange={(event) =>
                  setProfile({ ...profile, email: event.target.value })
                }
                placeholder="you@example.com"
              />
            </label>
            {error && (
              <p className="bz-error" role="alert">
                {error}
              </p>
            )}
            <div className="bz-form-actions">
              <button
                type="button"
                className="bz-button bz-button-light"
                onClick={() => setProfileEditOpen(false)}
              >
                Cancel
              </button>
              <button className="bz-button" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </button>
            </div>
            {saved && (
              <p className="bz-green">
                <Check size={16} /> Profile saved
              </p>
            )}
          </form>
        )}
      </main>
      <PageFooter />

      {addressManagerOpen && (
        <div
          className="bz-modal-backdrop"
          onMouseDown={() => setAddressManagerOpen(false)}
        >
          <div
            className="bz-account-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="bz-section-heading">
              <h2>Saved addresses</h2>
              <button
                className="bz-icon-button"
                aria-label="Close"
                onClick={() => setAddressManagerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {!showAddressForm ? (
              <>
                <div className="bz-address-manager-list">
                  {addresses.length === 0 ? (
                    <p className="bz-muted">No saved addresses yet.</p>
                  ) : (
                    addresses.map((item, index) => (
                      <div className="bz-address-manager-card" key={index}>
                        <b>{item.name}</b>
                        <span>
                          {item.line}, {item.city} - {item.pincode}
                        </span>
                        <span>Phone: {item.phone}</span>
                        <button
                          type="button"
                          className="bz-text-button"
                          onClick={() => handleDeleteAddress(index)}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  className="bz-button bz-full"
                  type="button"
                  onClick={() => setShowAddressForm(true)}
                >
                  <Plus size={16} /> Add new address
                </button>
              </>
            ) : (
              <form
                className="bz-address-form"
                onSubmit={handleAddAddress}
              >
                <label className="bz-form-wide">
                  Receiver&apos;s full name
                  <input
                    required
                    value={addressForm.name}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, name: e.target.value })
                    }
                    placeholder="Full name"
                  />
                </label>
                <label>
                  Phone number
                  <input
                    required
                    type="tel"
                    maxLength={10}
                    value={addressForm.phone}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        phone: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="10-digit mobile"
                  />
                </label>
                <label>
                  Pincode
                  <input
                    required
                    maxLength={6}
                    value={addressForm.pincode}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        pincode: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="6-digit pincode"
                  />
                </label>
                <label className="bz-form-wide">
                  House, street, landmark
                  <input
                    required
                    value={addressForm.line}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, line: e.target.value })
                    }
                    placeholder="Complete address"
                  />
                </label>
                <label className="bz-form-wide">
                  City
                  <input
                    required
                    value={addressForm.city}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, city: e.target.value })
                    }
                    placeholder="City"
                  />
                </label>
                {addressFormError && (
                  <p className="bz-error">{addressFormError}</p>
                )}
                <div className="bz-form-actions">
                  <button
                    type="button"
                    className="bz-button bz-button-light"
                    onClick={() => {
                      setShowAddressForm(false);
                      setAddressFormError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="bz-button">
                    Save address
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {supportOpen && (
        <div
          className="bz-modal-backdrop"
          onMouseDown={() => setSupportOpen(false)}
        >
          <div
            className="bz-account-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="bz-section-heading">
              <h2>Customer support</h2>
              <button
                className="bz-icon-button"
                aria-label="Close"
                onClick={() => setSupportOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="bz-muted">
              Get help with orders, refunds, payments or store availability.
            </p>
            <div className="bz-support-list">
              <a href="mailto:info@thebuyzaarmart.com">
                <Mail size={18} />
                <span>
                  <b>Email</b>
                  <small>info@thebuyzaarmart.com</small>
                </span>
              </a>
              <a href="tel:+919217991727">
                <Phone size={18} />
                <span>
                  <b>Call</b>
                  <small>9217991727</small>
                </span>
              </a>
              <div>
                <MapPin size={18} />
                <span>
                  <b>Office</b>
                  <small>D-43, Third floor, Sector-6, Noida-201301</small>
                </span>
              </div>
              <div>
                <Clock3 size={18} />
                <span>
                  <b>Hours</b>
                  <small>Mon–Sat 9:00 AM – 7:00 PM</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
