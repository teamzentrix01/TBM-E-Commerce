"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import {
  Check,
  Clock3,
  CreditCard,
  History,
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
  getCurrentCustomer,
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
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [profile, setProfile] = useState({ name: "", email: "", image_url: "" });
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const { addresses, setAddresses } = useStore();
  const [addressManagerOpen, setAddressManagerOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  
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
    document.getElementById("profile-edit-form")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setTimeout(() => {
      document.getElementById("profile-name-input")?.focus();
    }, 250);
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
    getCurrentCustomer()
      .then(({ user }) => {
        setPhone(user.phone || "");
        setProfile({
          name: user.name || "",
          email: user.email || "",
          image_url: user.image_url || "",
        });
        setLoggedIn(true);
      })
      .catch(() => setLoggedIn(false))
      .finally(() => setLoading(false));
  }, []);

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
        window.google.accounts.id.renderButton(btnEl, {
          theme: "outline",
          size: "large",
          width: "360",
          text: "signin_with",
          shape: "rectangular",
        });
      }
    }
  }, [googleInitialized, loggedIn]);

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
      setLoggedIn(true);
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
        setLoggedIn(true);
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
    setLoggedIn(false);
    setOtp("");
    setOtpSent(false);
    setAddresses([]);
    localStorage.removeItem("tbm-addresses");
  }

  if (loading) {
    return (
      <>
        <AppHeader />
        <main className="route-empty">
          <UserRound />
          <h1>Loading your account...</h1>
        </main>
        <PageFooter />
      </>
    );
  }

  if (!loggedIn) {
    return (
      <>
        <AppHeader />
        <main className="login-shell">
          <section className="login-panel">
            <span>THE BUYZAAR MART</span>
            <h1>Login or sign up</h1>
            <p>Enter your mobile number to receive a secure OTP.</p>
            <form onSubmit={handleLogin} className="login-form">
              <div className="phone-row">
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
                  placeholder="Mobile number"
                />
              </div>
              {otpSent && (
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
              )}
              {error && <p className="form-error">{error}</p>}
              <button
                disabled={
                  submitting ||
                  phone.length !== 10 ||
                  (otpSent && otp.length !== 6)
                }
              >
                {submitting
                  ? "Please wait..."
                  : otpSent
                    ? "Verify OTP"
                    : "Login/Sign up"}
              </button>
              {otpSent && (
                <button
                  type="button"
                  className="secondary-action"
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
            <small>
              By signing up you agree to our <Link href="/">terms and conditions</Link>.
            </small>
            <div className="login-or">
              <span>or</span>
            </div>
            <div className="google-login-container">
              <div id="google-signin-btn"></div>
            </div>
            <Script
              src="https://accounts.google.com/gsi/client"
              onLoad={initGoogleSignIn}
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
      <main className="route-page narrow-page">
        <div className="route-title">
          <span>YOUR PROFILE</span>
          <h1>My account</h1>
          <p>Manage personal details and delivery preferences.</p>
        </div>
        <section className="profile-dashboard">
          <div className="profile-hero-card">
            <div className="profile-photo-wrap">
              <div className="profile-avatar">
                {profile.image_url ? (
                  <img src={profile.image_url} alt={displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <button type="button" aria-label="Edit profile" onClick={focusProfileForm}>
                <Pencil />
              </button>
            </div>
            <h2>{displayName}</h2>
            <p>{displayEmail}</p>
            <div className="profile-identity-row">
              <span><Phone /> {displayPhone}</span>
              <span><ShieldCheck /> Logged in</span>
            </div>
            <button className="profile-logout" onClick={logout}>Logout</button>
          </div>

          <div className="profile-action-list">
            <button type="button" onClick={focusProfileForm}>
              <span><UserRound /></span>
              <b>Edit profile</b>
              <Pencil />
            </button>
            <button type="button" onClick={() => setAddressManagerOpen(true)}>
              <span><MapPin /></span>
              <b>Saved addresses</b>
              <Pencil />
            </button>
            <Link href="/orders">
              <span><History /></span>
              <b>Order history</b>
              <Pencil />
            </Link>
            <button type="button" onClick={() => setSupportOpen(true)}>
              <span><Phone /></span>
              <b>Help center</b>
              <Pencil />
            </button>
          </div>

          <div className="profile-details-card">
            <h2>Personal information</h2>
            <div>
              <span>Full name</span>
              <b>{displayName}</b>
            </div>
            <div>
              <span>Email address</span>
              <b>{displayEmail}</b>
            </div>
            <div>
              <span>Mobile number</span>
              <b>{displayPhone}</b>
            </div>
            <div>
              <span>Saved addresses</span>
              <b>{addresses.length}</b>
            </div>
          </div>
        </section>
        <form id="profile-edit-form" className="profile-form profile-edit-card" onSubmit={saveProfile}>
          <div className="profile-edit-head">
            <span><UserRound /></span>
            <div>
              <h2>Edit profile</h2>
              <p>Changes update your checkout details automatically.</p>
            </div>
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
            <Phone /> Mobile number
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
          {error && <p className="form-error">{error}</p>}
          <button className="primary-action" disabled={submitting}>
            {submitting ? "Saving..." : "Save changes"}
          </button>
          {saved && (
            <p className="success-message">
              <Check /> Profile saved
            </p>
          )}
        </form>
        <section className="account-links">
          <button onClick={() => setAddressManagerOpen(true)}>
            <MapPin />
            <span>
              <b>Saved addresses</b>
              <small>Add or update during checkout</small>
            </span>
          </button>
          <button onClick={() => setSupportOpen(true)}>
            <Phone />
            <span>
              <b>Customer support</b>
              <small>Contact support for order assistance</small>
            </span>
          </button>
          <Link href="/checkout">
            <CreditCard />
            <span>
              <b>Payment & checkout</b>
              <small>Manage payment during checkout</small>
            </span>
          </Link>
        </section>
      </main>
      <PageFooter />

      {addressManagerOpen && (
        <div className="modal-backdrop" onMouseDown={() => setAddressManagerOpen(false)}>
          <div className="account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="account-modal-header">
              <h2>Saved Addresses</h2>
              <button className="account-modal-close" onClick={() => setAddressManagerOpen(false)}>
                <X />
              </button>
            </div>
            
            {!showAddressForm ? (
              <>
                <div className="address-manager-list">
                  {addresses.length === 0 ? (
                    <p style={{ textAlign: "center", color: "#64748b", fontSize: "13px", padding: "20px 0" }}>
                      No saved addresses yet.
                    </p>
                  ) : (
                    addresses.map((item, index) => (
                      <div className="address-manager-card" key={index}>
                        <b>{item.name}</b>
                        <span>{item.line}, {item.city} - {item.pincode}</span>
                        <span>Phone: {item.phone}</span>
                        <div className="address-manager-card-actions">
                          <button onClick={() => handleDeleteAddress(index)}>Delete</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button className="address-manager-add-btn" onClick={() => setShowAddressForm(true)}>
                  <Plus size={16} /> Add New Address
                </button>
              </>
            ) : (
              <form onSubmit={handleAddAddress} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="address-form-fields">
                  <label className="full-width">
                    Receiver's Full Name
                    <input
                      required
                      value={addressForm.name}
                      onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                      placeholder="e.g. John Doe"
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      required
                      type="tel"
                      maxLength={10}
                      value={addressForm.phone}
                      onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value.replace(/\D/g, "") })}
                      placeholder="10-digit mobile"
                    />
                  </label>
                  <label>
                    Pincode
                    <input
                      required
                      maxLength={6}
                      value={addressForm.pincode}
                      onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value.replace(/\D/g, "") })}
                      placeholder="6-digit pincode"
                    />
                  </label>
                  <label className="full-width">
                    Flat, House no., Building, Company, Apartment, Street
                    <input
                      required
                      value={addressForm.line}
                      onChange={(e) => setAddressForm({ ...addressForm, line: e.target.value })}
                      placeholder="e.g. Sector 62, Landmark area"
                    />
                  </label>
                  <label className="full-width">
                    Town/City
                    <input
                      required
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      placeholder="e.g. Noida"
                    />
                  </label>
                </div>
                {addressFormError && <p className="form-error" style={{ fontSize: "11px", margin: 0 }}>{addressFormError}</p>}
                <div className="address-form-actions">
                  <button type="button" className="cancel-btn" onClick={() => { setShowAddressForm(false); setAddressFormError(""); }}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">
                    Save Address
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {supportOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSupportOpen(false)}>
          <div className="account-modal support-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="account-modal-header">
              <h2>Customer Support</h2>
              <button className="account-modal-close" onClick={() => setSupportOpen(false)}>
                <X />
              </button>
            </div>
            <p style={{ fontSize: "13px", color: "#475569", margin: 0 }}>
              Get help with your orders, refunds, payments or store availability.
            </p>
            <div className="account-support-options support-contact-list">
              <a
                href="mailto:info@thebuyzaarmart.com"
                className="account-support-btn"
              >
                <span className="support-icon"><Mail /></span>
                <span>
                  <b>Email Us:</b>
                  <strong>info@thebuyzaarmart.com</strong>
                  <small>We'll respond within 24 hours</small>
                </span>
              </a>
              <a
                href="tel:+919217991727"
                className="account-support-btn"
              >
                <span className="support-icon"><Phone /></span>
                <span>
                  <b>Call Us:</b>
                  <strong>9217991727</strong>
                </span>
              </a>
              <div className="account-support-btn">
                <span className="support-icon"><MapPin /></span>
                <span>
                  <b>Visit Our Office</b>
                  <strong>D-43, Third floor</strong>
                  <strong>Sector-6, Noida-201301</strong>
                </span>
              </div>
              <div className="account-support-btn">
                <span className="support-icon"><Clock3 /></span>
                <span>
                  <b>Business Hours</b>
                  <strong>Monday - Saturday: 9:00 AM - 7:00 PM</strong>
                  <small>Closed on Sundays</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
