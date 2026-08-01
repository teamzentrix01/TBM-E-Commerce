"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  Minus,
  Plus,
  Share2,
  ShoppingBag,
  Smartphone,
  Truck,
  X,
} from "lucide-react";
import AppHeader, { PageFooter } from "@/components/AppHeader";
import { useStore } from "@/context/StoreContext";
import { fetchProducts, resolveStoreByPincode } from "@/lib/api";
import {
  cancelCustomerOrder,
  submitOrder,
  verifyRazorpayPayment,
  fetchCustomerAddresses,
  saveCustomerAddress,
} from "@/lib/ecommerceApi";
import {
  createSharedCart,
  fetchSharedCart,
  updateSharedCartItem,
} from "@/lib/sharedCartApi";

const DELIVERY_FEE = 39;
const FREE_DELIVERY_MINIMUM = 499;
const slots = [
  "Today, 5 PM - 7 PM",
  "Today, 7 PM - 9 PM",
  "Tomorrow, 9 AM - 11 AM",
];
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser payment is unavailable"));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[src='https://checkout.razorpay.com/v1/checkout.js']");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load payment checkout"));
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
      prefill: {
        name: customer.name,
        contact: customer.phone,
      },
      notes: {
        orderNumber: order.order_number,
      },
      theme: { color: "#b90000" },
      handler: resolve,
      modal: {
        ondismiss: () => reject(new Error("Payment was cancelled")),
      },
    });
    checkout.open();
  });
}

function ProductImage({ product }) {
  if (product.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={product.name} src={product.image_url} />;
  }
  return <ShoppingBag />;
}

export default function Checkout() {
  const {
    activeStore,
    addresses,
    authReady,
    cart,
    cartCount,
    cartSavings,
    cartTotal,
    customer,
    pincode,
    setAddresses,
    setCart,
    updateCart,
  } = useStore();
  const [step, setStep] = useState(1);
  const [selectedAddress, setSelectedAddress] = useState(0);
  const [slot, setSlot] = useState(slots[0]);
  const [payment, setPayment] = useState("cod");
  const [complete, setComplete] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [addressChecking, setAddressChecking] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [sharedSession, setSharedSession] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [address, setAddress] = useState({
    name: "",
    phone: "",
    line: "",
    city: "",
    pincode: pincode || "",
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
  });

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("tbm-shared-cart-owner") || "null",
      );
      if (saved) setSharedSession(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!sharedSession?.inviteToken || step !== 1) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const data = await fetchSharedCart(sharedSession.inviteToken);
        if (!cancelled) {
          setCart(
            data.cart.items.map((item) => ({
              ...item,
              store_id: data.cart.storeId,
            })),
          );
        }
      } catch (requestError) {
        if ([404, 410].includes(requestError.status)) {
          localStorage.removeItem("tbm-shared-cart-owner");
          if (!cancelled) setSharedSession(null);
        }
      }
    };
    sync();
    const timer = window.setInterval(sync, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [setCart, sharedSession?.inviteToken, step]);

  async function applyCartUpdate(product, amount) {
    if (sharedSession?.inviteToken && sharedSession?.memberToken) {
      try {
        const data = await updateSharedCartItem(
          sharedSession.inviteToken,
          sharedSession.memberToken,
          product.id,
          amount,
        );
        setCart(
          data.cart.items.map((item) => ({
            ...item,
            store_id: data.cart.storeId,
          })),
        );
      } catch (requestError) {
        setError(requestError.message);
      }
      return;
    }
    updateCart(product, amount);
  }

  async function inviteFriends() {
    if (sharedSession?.inviteToken) {
      setShareError("");
      setShareOpen(true);
      return;
    }
    setShareBusy(true);
    setShareError("");
    try {
      const data = await createSharedCart({
        storeId: activeStore.id,
        areaLabel: `${activeStore.city || ""} ${pincode || ""}`.trim(),
        pincode: pincode || activeStore.pincode,
        items: cart.map((item) => ({ id: item.id, qty: item.qty })),
      });
      const session = {
        inviteToken: data.inviteToken,
        memberToken: data.memberToken,
        expiresAt: data.cart.expiresAt,
      };
      localStorage.setItem("tbm-shared-cart-owner", JSON.stringify(session));
      setSharedSession(session);
      setShareOpen(true);
    } catch (requestError) {
      setShareError(requestError.message);
      setShareOpen(true);
    } finally {
      setShareBusy(false);
    }
  }

  function getCurrentCoordinates() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported by this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            locationAccuracyM: coords.accuracy,
          }),
        () => reject(new Error("Allow location access to check 5 km delivery service.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    });
  }

  async function captureAddressLocation() {
    setAddressChecking(true);
    setError("");
    setLocationStatus("Getting your delivery location...");
    try {
      const coordinates = await getCurrentCoordinates();
      setAddress((current) => ({ ...current, ...coordinates }));
      setLocationStatus("Delivery location captured");
    } catch (locationError) {
      setLocationStatus("");
      setError(locationError.message);
    } finally {
      setAddressChecking(false);
    }
  }

  async function verifyServiceability(candidate) {
    const data = await resolveStoreByPincode(candidate.pincode, candidate, {
      allowPincodeFallback: true,
    });
    if (activeStore && String(data.store.id) !== String(activeStore.id)) {
      throw new Error(
        `Your cart belongs to ${activeStore.name}. Use a location within its delivery area, or change your store and rebuild the cart.`,
      );
    }
    return data;
  }

  async function continueWithSavedAddress() {
    const selected = addresses[selectedAddress];
    if (!selected) return;
    setAddressChecking(true);
    setError("");
    try {
      const hasCoordinates =
        selected.latitude != null && selected.longitude != null;
      const locatedAddress = hasCoordinates
        ? selected
        : { ...selected, ...(await getCurrentCoordinates()) };
      await verifyServiceability(locatedAddress);
      if (!hasCoordinates) {
        setAddresses((current) =>
          current.map((item, index) =>
            index === selectedAddress ? locatedAddress : item,
          ),
        );
      }
      setStep(3);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAddressChecking(false);
    }
  }

  const deliveryFee =
    cartTotal >= FREE_DELIVERY_MINIMUM || cartTotal === 0
      ? 0
      : DELIVERY_FEE;
  const payableTotal = cartTotal + deliveryFee;

  useEffect(() => {
    if (pincode) {
      setAddress((current) => ({
        ...current,
        pincode: current.pincode || pincode,
      }));
    }
  }, [pincode]);

  useEffect(() => {
    if (!authReady) return;
    if (!customer) {
      localStorage.setItem("tbm-login-return", "/checkout");
      window.location.replace("/account?returnTo=%2Fcheckout");
      return;
    }
    setAddress((current) => ({
      ...current,
      name: current.name || customer.name || "",
      phone: current.phone || customer.phone || "",
    }));
  }, [authReady, customer]);

  useEffect(() => {
    if (!customer) return;
    fetchCustomerAddresses()
      .then((data) => {
        setAddresses(data || []);
      })
      .catch(() => {
        // Keeps local storage fallback
      });
  }, [customer, setAddresses]);

  useEffect(() => {
    if (!activeStore?.id) return;
    const controller = new AbortController();
    fetchProducts({
      storeId: activeStore.id,
      pageSize: 12,
      signal: controller.signal,
    })
      .then((data) =>
        setRecommendations(
          (data.records || []).map((product) => ({
            ...product,
            store_id: activeStore.id,
          })),
        ),
      )
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          console.error("Failed to load recommendations", requestError);
        }
      });
    return () => controller.abort();
  }, [activeStore?.id]);

  async function saveAddress(event) {
    event.preventDefault();
    if (
      !address.name.trim() ||
      address.phone.length !== 10 ||
      !address.line.trim() ||
      !address.city.trim() ||
      address.pincode.length !== 6 ||
      address.latitude == null ||
      address.longitude == null
    ) {
      setError("Complete the address and use your current delivery location.");
      return;
    }

    setAddressChecking(true);
    setError("");
    try {
      await verifyServiceability(address);
      let savedAddr = address;
      try {
        savedAddr = await saveCustomerAddress(address);
      } catch (authError) {
        // User not logged in, we will keep it local
      }
      setAddresses((current) => [...current, savedAddr]);
      setSelectedAddress(addresses.length);
      setStep(3);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAddressChecking(false);
    }
  }

  async function placeOrder() {
    if (!cart.length || orderSubmitting) return;
    const chosen = addresses[selectedAddress] || address;
    setOrderSubmitting(true);
    setError("");
    try {
      const data = await submitOrder(
        {
          storeId: activeStore?.id,
          items: cart.map((item) => ({
            productId: item.id,
            qty: item.qty,
          })),
          address: chosen,
          deliverySlot: slot,
          paymentMethod:
            payment === "online"
              ? "razorpay"
              : payment === "upi"
                ? "upi_on_delivery"
                : "cod",
        },
        crypto.randomUUID(),
      );
      let confirmedOrder = data.order;
      if (payment === "online") {
        if (!data.payment) {
          throw new Error("Online payment is not available right now.");
        }
        try {
          await loadRazorpayCheckout();
          const gatewayResponse = await openRazorpayCheckout({
            payment: data.payment,
            order: data.order,
            customer: chosen,
          });
          const verified = await verifyRazorpayPayment(
            data.order.id,
            gatewayResponse,
          );
          confirmedOrder = verified.order;
        } catch (paymentError) {
          await cancelCustomerOrder(data.order.id).catch(() => {});
          throw paymentError;
        }
      }
      setPlacedOrder(confirmedOrder);
      setCart([]);
      setComplete(true);
    } catch (requestError) {
      if (requestError.status === 401) {
        setError("Please login with OTP before placing your order.");
      } else {
        setError(requestError.message);
      }
    } finally {
      setOrderSubmitting(false);
    }
  }

  if (complete) {
    return (
      <>
        <AppHeader />
        <main className="confirmation">
          <div className="confirmation-icon">
            <Check />
          </div>
          <span>ORDER CONFIRMED</span>
          <h1>Thank you for shopping with us.</h1>
          <p>
            Order <b>{placedOrder?.order_number}</b> has been sent to{" "}
            {placedOrder?.store_name || "your store"} for acceptance. Requested slot:{" "}
            <b>{slot}</b>.
          </p>
          <div>
            <Link href="/orders">View my orders</Link>
            <Link href="/">Continue shopping</Link>
          </div>
        </main>
        <PageFooter />
      </>
    );
  }

  if (!cart.length) {
    return (
      <>
        <AppHeader />
        <div className="route-empty checkout-empty">
          <ShoppingBag />
          <h1>Your cart is empty</h1>
          <p>Add products before starting checkout.</p>
          <Link href="/">Browse products</Link>
        </div>
        <PageFooter />
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="checkout-page grocery-checkout">
        <div className="checkout-title">
          <span>SECURE CHECKOUT</span>
          <h1>Your basket</h1>
          <p>{cartCount} {cartCount === 1 ? "item" : "items"} ready for checkout</p>
        </div>
        <div className="checkout-top">
          <div className="checkout-top-actions">
            <Link href="/">
              <ChevronLeft /> Continue shopping
            </Link>
            {step === 1 && (
              <button disabled={shareBusy} onClick={inviteFriends}>
                <Share2 />
                {sharedSession ? "Share cart" : "Invite friends"}
              </button>
            )}
          </div>
          <div>
            {["Cart", "Address", "Delivery & payment"].map(
              (label, index) => (
                <span
                  key={label}
                  className={step >= index + 1 ? "active" : ""}
                >
                  <b>{step > index + 1 ? <Check /> : index + 1}</b>
                  {label}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="checkout-layout">
          <section className="checkout-content">
            {step === 1 && (
              <>
                <div className="checkout-card cart-table-card">
                  <div className="cart-address-row">
                    <MapPin />
                    <span>
                      {activeStore
                        ? `${activeStore.name}, ${activeStore.city}`
                        : "Select your delivery store"}
                    </span>
                    <button onClick={() => setStep(2)}>
                      Add address
                    </button>
                  </div>
                  <label className="delivery-select">
                    <b>Delivery instructions</b>
                    <select defaultValue="">
                      <option value="">Select delivery preference</option>
                      <option>Leave at doorstep</option>
                      <option>Call before delivery</option>
                      <option>Deliver after 6 PM</option>
                    </select>
                  </label>
                  <div className="cart-table-head">
                    <span>Cart Items</span>
                    <span>Unit Price</span>
                    <span>Quantity</span>
                    <span>Sub Total</span>
                  </div>
                  <div className="checkout-items">
                    {cart.map((item) => (
                      <article key={item.id}>
                        <div className="checkout-thumb">
                          <ProductImage product={item} />
                        </div>
                        <div>
                          <h3>{item.name}</h3>
                          <small>{item.unit || "1 unit"}</small>
                        </div>
                        <div className="unit-price">
                          {item.mrp > item.selling_price && (
                            <del>{money(item.mrp)}</del>
                          )}
                          <strong>{money(item.selling_price)}</strong>
                          {item.mrp > item.selling_price && (
                            <small>
                              You save{" "}
                              {money(
                                (item.mrp - item.selling_price) *
                                  item.qty,
                              )}
                            </small>
                          )}
                        </div>
                        <div className="qty-control">
                          <button onClick={() => applyCartUpdate(item, -1)}>
                            <Minus />
                          </button>
                          <b>{item.qty}</b>
                          <button
                            disabled={
                              item.qty >= Math.floor(Number(item.stock))
                            }
                            onClick={() => applyCartUpdate(item, 1)}
                          >
                            <Plus />
                          </button>
                        </div>
                        <strong>
                          {money(item.selling_price * item.qty)}
                        </strong>
                      </article>
                    ))}
                  </div>
                  <button
                    className="next-button"
                    onClick={() => setStep(2)}
                  >
                    Select address <ChevronRight />
                  </button>
                </div>

              </>
            )}

            {step === 2 && (
              <div className="checkout-card">
                <div className="checkout-card-title">
                  <span>02</span>
                  <div>
                    <h1>Delivery address</h1>
                    <p>Where should we deliver your order?</p>
                  </div>
                </div>
                {addresses.length > 0 && (
                  <div className="saved-addresses">
                    {addresses.map((item, index) => (
                      <button
                        key={`${item.phone}-${index}`}
                        className={
                          selectedAddress === index ? "selected" : ""
                        }
                        onClick={() => setSelectedAddress(index)}
                      >
                        <MapPin />
                        <span>
                          <b>{item.name}</b>
                          <small>
                            {item.line}, {item.city} - {item.pincode}
                          </small>
                          <small>{item.phone}</small>
                        </span>
                        {selectedAddress === index && <Check />}
                      </button>
                    ))}
                    <button
                      className="next-button"
                      onClick={continueWithSavedAddress}
                      disabled={addressChecking}
                    >
                      {addressChecking ? "Checking 5 km service..." : "Deliver here"}{" "}
                      <ChevronRight />
                    </button>
                    <div className="or-line">
                      <span>or add another address</span>
                    </div>
                  </div>
                )}
                <form className="address-form" onSubmit={saveAddress}>
                  <label>
                    Receiver name
                    <input
                      value={address.name}
                      onChange={(event) =>
                        setAddress({
                          ...address,
                          name: event.target.value,
                        })
                      }
                      placeholder="Full name"
                    />
                  </label>
                  <label>
                    Mobile number
                    <input
                      inputMode="numeric"
                      maxLength={10}
                      value={address.phone}
                      onChange={(event) =>
                        setAddress({
                          ...address,
                          phone: event.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="10 digit number"
                    />
                  </label>
                  <label className="full-field">
                    House, floor and street
                    <input
                      value={address.line}
                      onChange={(event) =>
                        setAddress({
                          ...address,
                          line: event.target.value,
                        })
                      }
                      placeholder="Complete address"
                    />
                  </label>
                  <label>
                    City
                    <input
                      value={address.city}
                      onChange={(event) =>
                        setAddress({
                          ...address,
                          city: event.target.value,
                        })
                      }
                      placeholder="City"
                    />
                  </label>
                  <label>
                    Pincode
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={address.pincode}
                      onChange={(event) =>
                        setAddress({
                          ...address,
                          pincode: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </label>
                  <div className="full-field">
                    <button
                      type="button"
                      className="next-button"
                      onClick={captureAddressLocation}
                      disabled={addressChecking}
                    >
                      <MapPin />
                      {address.latitude != null
                        ? "Update delivery location"
                        : "Use current delivery location"}
                    </button>
                    {locationStatus && <small>{locationStatus}</small>}
                    {address.latitude != null && (
                      <small>Location will be checked within a 5 km store radius.</small>
                    )}
                  </div>
                  {error && <p className="form-error">{error}</p>}
                  <button
                    className="next-button"
                    disabled={addressChecking}
                  >
                    {addressChecking
                      ? "Checking serviceability..."
                      : "Save and continue"}{" "}
                    <ChevronRight />
                  </button>
                </form>
              </div>
            )}

            {step === 3 && (
              <div className="checkout-card">
                <div className="checkout-card-title">
                  <span>03</span>
                  <div>
                    <h1>Delivery & payment</h1>
                    <p>
                      Choose a convenient slot and payment method.
                    </p>
                  </div>
                </div>
                <h2 className="option-title">
                  <Clock3 /> Delivery slot
                </h2>
                <div className="option-grid">
                  {slots.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={slot === item ? "selected" : ""}
                      onClick={() => setSlot(item)}
                    >
                      <Truck />
                      <span>
                        <b>{item.split(", ")[0]}</b>
                        <small>{item.split(", ")[1]}</small>
                      </span>
                      {slot === item && <Check />}
                    </button>
                  ))}
                </div>
                <h2 className="option-title">
                  <CreditCard /> Payment method
                </h2>
                <div className="payment-options">
                  <button
                    type="button"
                    className={payment === "cod" ? "selected" : ""}
                    onClick={() => setPayment("cod")}
                  >
                    <span>
                      <b>Cash on delivery</b>
                      <small>Pay when your order arrives</small>
                    </span>
                    {payment === "cod" && <Check />}
                  </button>
                  <button
                    type="button"
                    className={payment === "upi" ? "selected" : ""}
                    onClick={() => setPayment("upi")}
                  >
                    <span>
                      <b>UPI on delivery</b>
                      <small>Scan and pay at your doorstep</small>
                    </span>
                    {payment === "upi" && <Check />}
                  </button>
                  <button
                    type="button"
                    className={payment === "online" ? "selected" : ""}
                    onClick={() => setPayment("online")}
                  >
                    <Smartphone />
                    <span>
                      <b>Pay online</b>
                      <small>UPI, cards and net banking</small>
                    </span>
                    {payment === "online" && <Check />}
                  </button>
                </div>
                <button
                  type="button"
                  className="place-order"
                  disabled={orderSubmitting}
                  onClick={placeOrder}
                >
                  {orderSubmitting
                    ? "Placing order..."
                    : `Place order - ${money(payableTotal)}`}{" "}
                  <ChevronRight />
                </button>
                {error && <p className="form-error">{error}</p>}
              </div>
            )}
          </section>

          <aside className="order-summary bill-details">
            <h2>Bill Details</h2>
            <p>
              <span>Cart value</span>
              <b>{money(cartTotal)}</b>
            </p>
            <p>
              <span>Delivery charge</span>
              <b className={deliveryFee === 0 ? "free" : ""}>
                {deliveryFee === 0 ? "FREE" : money(deliveryFee)}
              </b>
            </p>
            <div>
              <span>Total amount payable</span>
              <strong>{money(payableTotal)}</strong>
            </div>
            <p className="savings-row">
              <span>Total savings</span>
              <b>{money(cartSavings)}</b>
            </p>
            {step === 1 && (
              <button
                className="bill-cta"
                onClick={() => setStep(2)}
              >
                Select address
              </button>
            )}
            <small>
              <Check /> Taxes included in product prices
            </small>
          </aside>

          {step === 1 && recommendations.filter(
            (product) => !cart.some((item) => String(item.id) === String(product.id)),
          ).length > 0 && (
            <div className="checkout-card recommended-card">
              <div className="recommended-card-heading">
                <div>
                  <span>QUICK ADD</span>
                  <h2>You may also need</h2>
                </div>
                <small>Popular from your selected store</small>
              </div>
              <div className="recommended-list">
                {recommendations
                  .filter(
                    (product) =>
                      !cart.some((item) => String(item.id) === String(product.id)),
                  )
                  .slice(0, 8)
                  .map((product) => (
                    <article className="recommended-item" key={product.id}>
                      {product.discount_percent > 0 && (
                        <span className="recommended-item-discount">
                          {Math.round(product.discount_percent)}% OFF
                        </span>
                      )}
                      <div className="recommended-item-media">
                        <ProductImage product={product} />
                      </div>
                      <div className="recommended-item-info">
                        <span className="recommended-item-brand">
                          {product.brand_name || product.category_name || "THE BUYZAAR MART"}
                        </span>
                        <span className="recommended-item-name">{product.name}</span>
                        <span className="recommended-item-unit">{product.unit || "1 unit"}</span>
                        <div className="recommended-item-price-row">
                          <div className="recommended-item-price-details">
                            <b>{money(product.selling_price)}</b>
                            {product.mrp > product.selling_price && (
                              <del>{money(product.mrp)}</del>
                            )}
                          </div>
                          <button
                            className="add-button"
                            onClick={() => applyCartUpdate(product, 1)}
                          >
                            <Plus /> Add
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          )}
        </div>
      </main>
      {shareOpen && (
        <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}>
          <section
            className="share-cart-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              aria-label="Close invite"
              onClick={() => setShareOpen(false)}
            >
              <X />
            </button>
            <Share2 />
            <span>GROUP CART</span>
            <h2>Invite friends to this basket</h2>
            <p>
              Friends can add items using your delivery store. Checkout and
              payment remain under your account.
            </p>
            {shareError ? (
              <div className="form-error">{shareError}</div>
            ) : sharedSession?.inviteToken ? (
              <>
                <a
                  className="whatsapp-share-button"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Join my Buyzaar Mart cart and add what you need: ${window.location.origin}/cart/join/${sharedSession.inviteToken}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Share on WhatsApp
                </a>
                <button
                  className="copy-share-button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/cart/join/${sharedSession.inviteToken}`,
                    )
                  }
                >
                  Copy invite link
                </button>
                <small>Invite expires in 6 hours.</small>
              </>
            ) : (
              <button className="whatsapp-share-button" onClick={inviteFriends}>
                {shareBusy ? "Creating invite..." : "Create invite link"}
              </button>
            )}
          </section>
        </div>
      )}
      <PageFooter />
    </>
  );
}
