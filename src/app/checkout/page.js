"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  MapPin,
  ShieldCheck,
  Smartphone,
  Truck,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import {
  EmptyState,
  OrderSummary,
  ProductImage,
} from "@/components/shop/ShopUI";
import { useStore } from "@/context/StoreContext";
import { useCartSession } from "@/context/CartSessionContext";
import { completeCheckout } from "@/lib/checkoutFlow.mjs";
import { resolveStoreByPincode } from "@/lib/api";
import {
  cancelCustomerOrder,
  fetchCustomerAddresses,
  saveCustomerAddress,
  submitOrder,
  verifyRazorpayPayment,
} from "@/lib/ecommerceApi";
import { cartTotals, DELIVERY_SLOTS, money } from "@/lib/shop.mjs";
import { accountLoginHref, rememberLoginReturn } from "@/lib/authNav.mjs";

function currentCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("Location is not supported by this browser."));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          locationAccuracyM: coords.accuracy,
        }),
      () =>
        reject(
          new Error(
            "Allow location access to check delivery within 5 km of your store.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-buyzaar-checkout]");
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.dataset.buyzaarCheckout = "true";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const timeout = setTimeout(() => {
      script.remove();
      reject(
        new Error("Payment checkout took too long to load. Please try again."),
      );
    }, 20000);
    script.onload = () => {
      clearTimeout(timeout);
      if (window.Razorpay) resolve();
      else {
        script.remove();
        reject(new Error("Unable to load payment checkout."));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error("Unable to load payment checkout. Please try again."));
    };
    document.body.appendChild(script);
  });
}

function openRazorpayCheckout({ payment, order, customer }) {
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      name: payment.name,
      description: payment.description,
      order_id: payment.orderId,
      prefill: { name: customer.name, contact: customer.phone },
      notes: { orderNumber: order.order_number },
      theme: { color: "#B00000" },
      handler: resolve,
      modal: {
        ondismiss: () =>
          reject(
            new Error("Payment was cancelled. Your basket is still here."),
          ),
      },
    });
    checkout.open();
  });
}

const blankAddress = {
  name: "",
  phone: "",
  line: "",
  city: "",
  pincode: "",
  latitude: null,
  longitude: null,
  locationAccuracyM: null,
};
const steps = ["Address", "Delivery", "Review", "Payment"];
export default function Checkout() {
  const router = useRouter();
  const {
    activeStore,
    addresses,
    authReady,
    cart,
    customer,
    pincode,
    ready,
    setAddresses,
    setCart,
  } = useStore();
  const { clearSession } = useCartSession();
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [address, setAddress] = useState(blankAddress);
  const [showNew, setShowNew] = useState(false);
  const [slot, setSlot] = useState(DELIVERY_SLOTS[0]);
  const [payment, setPayment] = useState("cod");
  const [addressBusy, setAddressBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [addressNotice, setAddressNotice] = useState("");
  const submitLock = useRef(false);
  const requestIdentity = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    if (!authReady) return;
    if (!customer) {
      rememberLoginReturn("/checkout");
      router.replace(accountLoginHref("/checkout"));
      return;
    }
    setAddress((current) => ({
      ...current,
      name: current.name || customer.name || "",
      phone: current.phone || customer.phone || "",
      pincode: current.pincode || pincode || "",
    }));
  }, [authReady, customer, pincode, router]);
  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    fetchCustomerAddresses()
      .then((data) => {
        if (!cancelled) setAddresses(data || []);
      })
      .catch(() => {
        if (!cancelled)
          setAddressNotice(
            "Saved addresses could not be refreshed. You can use an address below or add one.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [customer, setAddresses]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    setChosen(null);
    setStep(1);
  }, [activeStore?.id]);
  const totals = cartTotals(cart);

  function goTo(next) {
    if (submitting || addressBusy) return;
    setError("");
    setStep(next);
  }
  async function checkAddress(candidate) {
    const data = await resolveStoreByPincode(candidate.pincode, candidate, {
      allowPincodeFallback: true,
    });
    if (!activeStore || String(data.store.id) !== String(activeStore.id))
      throw new Error(
        "This address is outside your basket's store area. Choose an address near your selected store, or change location and rebuild your basket.",
      );
  }
  async function captureLocation() {
    setAddressBusy(true);
    setError("");
    setLocationStatus("Getting your delivery location…");
    try {
      const coordinates = await currentCoordinates();
      setAddress((value) => ({ ...value, ...coordinates }));
      setLocationStatus(
        "Delivery location captured. Please ensure this is your delivery address.",
      );
    } catch (failure) {
      setError(failure.message);
      setLocationStatus("");
    } finally {
      setAddressBusy(false);
    }
  }
  async function useSavedAddress() {
    const saved = addresses[selected];
    if (!saved || addressBusy) return;
    setAddressBusy(true);
    setError("");
    try {
      const located =
        saved.latitude != null && saved.longitude != null
          ? saved
          : { ...saved, ...(await currentCoordinates()) };
      await checkAddress(located);
      setChosen(located);
      setAddresses((current) =>
        current.map((item, index) => (index === selected ? located : item)),
      );
      setStep(2);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setAddressBusy(false);
    }
  }
  async function saveAddress(event) {
    event.preventDefault();
    if (addressBusy) return;
    if (
      !address.name.trim() ||
      !/^\d{10}$/.test(address.phone) ||
      !address.line.trim() ||
      !address.city.trim() ||
      !/^\d{6}$/.test(address.pincode) ||
      address.latitude == null ||
      address.longitude == null
    ) {
      setError("Complete your address and capture its delivery location.");
      return;
    }
    setAddressBusy(true);
    setError("");
    try {
      await checkAddress(address);
      const saved = await saveCustomerAddress(address);
      setAddresses((current) => [...current, saved]);
      setSelected(addresses.length);
      setChosen(saved);
      setShowNew(false);
      setStep(2);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setAddressBusy(false);
    }
  }

  async function placeOrder() {
    if (submitLock.current || !cart.length || !chosen || step !== 4) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        storeId: activeStore?.id,
        items: cart.map((item) => ({ productId: item.id, qty: item.qty })),
        address: chosen,
        deliverySlot: slot,
        paymentMethod:
          payment === "online"
            ? "razorpay"
            : payment === "upi"
              ? "upi_on_delivery"
              : "cod",
      };
      const signature = JSON.stringify(payload);
      if (requestIdentity.current?.signature !== signature)
        requestIdentity.current = { signature, key: crypto.randomUUID() };
      const confirmedOrder = await completeCheckout(payload, requestIdentity.current.key, {
        loadGateway: loadRazorpayCheckout,
        submitOrder,
        openGateway: openRazorpayCheckout,
        verifyPayment: verifyRazorpayPayment,
        cancelOrder: cancelCustomerOrder,
      });
      setCompleted(true);
      clearSession();
      setCart([]);
      router.replace("/orders/" + confirmedOrder.id + "/confirmation");
    } catch (failure) {
      if (failure.canStartNewAttempt) requestIdentity.current = null;
      setError(
        failure.status === 401
          ? "Your session expired. Sign in again before placing your order."
          : failure.message,
      );
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  const paymentOptions = [
    {
      value: "cod",
      title: "Cash on delivery",
      detail: "Pay when your order arrives",
      icon: Banknote,
    },
    {
      value: "upi",
      title: "UPI on delivery",
      detail: "Scan and pay at your doorstep",
      icon: Smartphone,
    },
    {
      value: "online",
      title: "Pay securely online",
      detail: "UPI, cards and net banking via Razorpay",
      icon: CreditCard,
    },
  ];
  if (!ready || !authReady || !customer || completed)
    return (
      <>
        <AppHeader />
        <main className="bz-shell bz-empty">
          <p role="status">
            {completed
              ? "Opening your order confirmation…"
              : "Preparing your secure checkout…"}
          </p>
        </main>
        <PageFooter />
      </>
    );
  if (!cart.length)
    return (
      <>
        <AppHeader />
        <main className="bz-shell">
          <EmptyState
            title="Your basket is empty"
            description="Add a few favourites before checking out."
          />
        </main>
        <PageFooter />
      </>
    );
  return (
    <>
      <AppHeader />
      <main className="bz-shell bz-checkout-page">
        <Link
          className="bz-back-link"
          href="/cart"
          onClick={(event) => {
            if (submitting) event.preventDefault();
          }}
          aria-disabled={submitting}
        >
          <ArrowLeft size={16} /> Back to cart
        </Link>
        <div className="bz-page-heading">
          <div>
            <span className="bz-eyebrow">JUST A FEW MORE STEPS</span>
            <h1>Checkout</h1>
          </div>
          <span className="bz-secure">
            <ShieldCheck size={16} /> Secure checkout
          </span>
        </div>
        <ol className="bz-stepper">
          {steps.map((label, index) => (
            <li key={label} className={step >= index + 1 ? "is-active" : ""}>
              <button
                disabled={index + 1 > step || submitting || addressBusy}
                onClick={() => goTo(index + 1)}
                aria-current={step === index + 1 ? "step" : undefined}
              >
                <span>
                  {step > index + 1 ? <Check size={15} /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <div className="bz-checkout-layout">
          <section
            className="bz-checkout-card"
            aria-busy={submitting || addressBusy}
          >
            <h2 tabIndex={-1} ref={headingRef}>
              {step === 1
                ? "Where should we deliver?"
                : step === 2
                  ? "Choose your delivery slot"
                  : step === 3
                    ? "Everything look right?"
                    : "Choose how to pay"}
            </h2>
            {step === 1 && (
              <>
                <p className="bz-muted">
                  Select a saved address or add a new one.
                </p>
                {addressNotice && <p className="bz-notice">{addressNotice}</p>}
                {addresses.length > 0 && !showNew && (
                  <>
                    <div className="bz-address-list">
                      {addresses.map((item, index) => (
                        <label
                          key={item.id || index}
                          className={selected === index ? "is-selected" : ""}
                        >
                          <input
                            type="radio"
                            name="delivery-address"
                            checked={selected === index}
                            disabled={addressBusy}
                            onChange={() => {
                              setSelected(index);
                              setChosen(null);
                            }}
                          />
                          <span>
                            <b>{item.name}</b>
                            <span>
                              {item.line}, {item.city} – {item.pincode}
                            </span>
                            <small>{item.phone}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="bz-form-actions">
                      <button
                        className="bz-button"
                        disabled={addressBusy}
                        onClick={useSavedAddress}
                      >
                        {addressBusy
                          ? "Checking delivery…"
                          : "Deliver to this address"}
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="bz-text-button"
                        disabled={addressBusy}
                        onClick={() => setShowNew(true)}
                      >
                        + Add a new address
                      </button>
                    </div>
                  </>
                )}
                {(showNew || !addresses.length) && (
                  <form className="bz-address-form" onSubmit={saveAddress}>
                    {[
                      {
                        key: "name",
                        label: "Receiver name",
                        placeholder: "Full name",
                        autoComplete: "name",
                      },
                      {
                        key: "phone",
                        label: "Mobile number",
                        placeholder: "10 digit mobile number",
                        numeric: 10,
                        autoComplete: "tel-national",
                      },
                      {
                        key: "line",
                        label: "House, floor and street",
                        placeholder: "Complete delivery address",
                        wide: true,
                        autoComplete: "street-address",
                      },
                      {
                        key: "city",
                        label: "City",
                        placeholder: "City",
                        autoComplete: "address-level2",
                      },
                      {
                        key: "pincode",
                        label: "Pincode",
                        placeholder: "6 digit pincode",
                        numeric: 6,
                        autoComplete: "postal-code",
                      },
                    ].map((field) => (
                      <label
                        key={field.key}
                        className={field.wide ? "bz-form-wide" : ""}
                      >
                        {field.label}
                        <input
                          required
                          autoComplete={field.autoComplete}
                          disabled={addressBusy}
                          inputMode={field.numeric ? "numeric" : "text"}
                          maxLength={field.numeric || undefined}
                          pattern={
                            field.numeric
                              ? "[0-9]{" + field.numeric + "}"
                              : undefined
                          }
                          value={address[field.key]}
                          placeholder={field.placeholder}
                          onChange={(event) => {
                            const value = field.numeric
                              ? event.target.value.replace(/\D/g, "")
                              : event.target.value;
                            setAddress((current) => ({
                              ...current,
                              [field.key]: value,
                              ...(["line", "city", "pincode"].includes(
                                field.key,
                              )
                                ? { latitude: null, longitude: null }
                                : {}),
                            }));
                            if (["line", "city", "pincode"].includes(field.key))
                              setLocationStatus("");
                          }}
                        />
                      </label>
                    ))}
                    <div className="bz-form-wide">
                      <button
                        type="button"
                        className="bz-button bz-button-light"
                        disabled={addressBusy}
                        onClick={captureLocation}
                      >
                        <MapPin size={17} />
                        {address.latitude == null
                          ? "Use current delivery location"
                          : "Update delivery location"}
                      </button>
                      <p className="bz-muted" role="status">
                        {locationStatus ||
                          "Use your location at the delivery address to check our 5 km service area."}
                      </p>
                    </div>
                    <div className="bz-form-wide bz-form-actions">
                      <button className="bz-button" disabled={addressBusy}>
                        {addressBusy
                          ? "Checking delivery…"
                          : "Save and continue"}
                        <ArrowRight size={16} />
                      </button>
                      {addresses.length > 0 && (
                        <button
                          className="bz-text-button"
                          type="button"
                          disabled={addressBusy}
                          onClick={() => setShowNew(false)}
                        >
                          Use a saved address
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <p className="bz-muted">
                  Your store will confirm your requested slot after accepting
                  the order.
                </p>
                <div className="bz-choice-list">
                  {DELIVERY_SLOTS.map((item) => (
                    <label
                      className={slot === item ? "is-selected" : ""}
                      key={item}
                    >
                      <input
                        type="radio"
                        name="delivery-slot"
                        checked={slot === item}
                        onChange={() => setSlot(item)}
                      />
                      <Truck size={23} />
                      <span>
                        <b>{item.split(", ")[0]}</b>
                        <small>{item.split(", ")[1]}</small>
                      </span>
                      <strong>
                        {totals.delivery ? money(totals.delivery) : "FREE"}
                      </strong>
                    </label>
                  ))}
                </div>
                <div className="bz-form-actions">
                  <button className="bz-button" onClick={() => goTo(3)}>
                    Review order <ArrowRight size={16} />
                  </button>
                  <button className="bz-text-button" onClick={() => goTo(1)}>
                    Back to address
                  </button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="bz-review-address">
                  <MapPin size={20} />
                  <div>
                    <b>{chosen?.name}</b>
                    <p>
                      {chosen?.line}, {chosen?.city} – {chosen?.pincode}
                    </p>
                    <small>{chosen?.phone}</small>
                  </div>
                  <button className="bz-text-button" onClick={() => goTo(1)}>
                    Change
                  </button>
                </div>
                <div className="bz-review-slot">
                  <Truck size={18} />
                  <span>{slot}</span>
                  <button className="bz-text-button" onClick={() => goTo(2)}>
                    Change
                  </button>
                </div>
                <div className="bz-review-items">
                  {cart.map((item) => (
                    <div key={item.id}>
                      <span>
                        <ProductImage product={item} />
                      </span>
                      <div>
                        <b>{item.name}</b>
                        <small>
                          {item.unit || "1 unit"} · Qty {item.qty}
                        </small>
                      </div>
                      <strong>
                        {money(Number(item.selling_price) * item.qty)}
                      </strong>
                    </div>
                  ))}
                </div>
                <Link className="bz-text-link" href="/cart">
                  Edit your basket
                </Link>
                <div className="bz-form-actions">
                  <button className="bz-button" onClick={() => goTo(4)}>
                    Continue to payment <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <p className="bz-muted">
                  Choose the payment option that works for you.
                </p>
                <div className="bz-choice-list">
                  {paymentOptions.map(
                    ({ value, title, detail, icon: Icon }) => (
                      <label
                        className={payment === value ? "is-selected" : ""}
                        key={value}
                      >
                        <input
                          type="radio"
                          name="payment-method"
                          checked={payment === value}
                          disabled={submitting}
                          onChange={() => setPayment(value)}
                        />
                        <Icon size={24} />
                        <span>
                          <b>{title}</b>
                          <small>{detail}</small>
                        </span>
                        {payment === value && <Check size={18} />}
                      </label>
                    ),
                  )}
                </div>
                <p className="bz-payment-note">
                  <ShieldCheck size={18} />
                  {payment === "online"
                    ? "Your payment details are handled securely by Razorpay."
                    : "Your order will be sent to your local store for acceptance."}
                </p>
                <div className="bz-form-actions bz-place-order">
                  <button
                    className="bz-button"
                    disabled={submitting || !chosen}
                    onClick={placeOrder}
                  >
                    {submitting
                      ? "Processing your order…"
                      : (payment === "online" ? "Pay " : "Place order · ") +
                        money(totals.total)}
                    <ArrowRight size={16} />
                  </button>
                  <button
                    className="bz-text-button"
                    disabled={submitting}
                    onClick={() => goTo(3)}
                  >
                    Back to review
                  </button>
                </div>
              </>
            )}
            {error && (
              <div className="bz-notice bz-error" role="alert">
                <p>{error}</p>
                {step === 4 && <Link href="/orders">View my orders</Link>}
              </div>
            )}
          </section>
          <OrderSummary items={cart} showItems />
        </div>
      </main>
      <PageFooter />
    </>
  );
}
