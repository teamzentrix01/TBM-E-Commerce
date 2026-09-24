"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MapPin, Minus, Plus, ShoppingBag, Users } from "lucide-react";
import { fetchProducts } from "@/lib/api";
import {
  fetchSharedCart,
  joinSharedCart,
  updateSharedCartItem,
} from "@/lib/sharedCartApi";
import { productBrandLabel } from "@/lib/shop.mjs";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export default function JoinSharedCartPage() {
  const { token } = useParams();
  const [cart, setCart] = useState(null);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState("");
  const [memberToken, setMemberToken] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(`tbm-shared-member:${token}`) || "";
    setMemberToken(saved);
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchSharedCart(token);
        if (!cancelled) setCart(data.cart);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  useEffect(() => {
    if (!cart?.storeId || !memberToken) return;
    const controller = new AbortController();
    fetchProducts({
      storeId: cart.storeId,
      pageSize: 60,
      signal: controller.signal,
    })
      .then((data) => setProducts(data.records || []))
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      });
    return () => controller.abort();
  }, [cart?.storeId, memberToken]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? products.filter((product) =>
          `${product.name} ${product.brand_name || ""}`.toLowerCase().includes(query),
        )
      : products;
  }, [products, search]);

  async function join(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await joinSharedCart(token, name);
      localStorage.setItem(`tbm-shared-member:${token}`, data.memberToken);
      setMemberToken(data.memberToken);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function changeItem(productId, delta) {
    setBusyId(productId);
    setError("");
    try {
      const data = await updateSharedCartItem(
        token,
        memberToken,
        productId,
        delta,
      );
      setCart(data.cart);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <main className="shared-cart-state"><ShoppingBag /><h1>Opening shared cart...</h1></main>;
  }
  if (!cart) {
    return <main className="shared-cart-state"><ShoppingBag /><h1>Invite unavailable</h1><p>{error}</p><Link href="/">Visit Buyzaar Mart</Link></main>;
  }
  if (!memberToken) {
    return (
      <main className="shared-cart-join-shell">
        <section>
          <Users />
          <span>YOU&apos;RE INVITED</span>
          <h1>Join {cart.ownerName}&apos;s cart</h1>
          <p>
            Add items for delivery to <b>{cart.areaLabel}</b>. Your own
            location is not required and the owner will checkout.
          </p>
          <form onSubmit={join}>
            <input
              autoFocus
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
            <button disabled={name.trim().length < 2}>Join shared cart</button>
          </form>
          {error && <div className="form-error">{error}</div>}
        </section>
      </main>
    );
  }

  const quantityFor = (id) =>
    cart.items.find((item) => String(item.id) === String(id))?.qty || 0;
  const total = cart.items.reduce(
    (sum, item) => sum + item.selling_price * item.qty,
    0,
  );

  return (
    <main className="shared-cart-page">
      <header>
        <Link href="/"><img src="/buyzaar-logo.png" alt="The Buyzaar Mart" /></Link>
        <div><Users /><span><small>SHARED CART</small><b>{cart.ownerName}&apos;s basket</b></span></div>
        <div><MapPin /><span><small>DELIVERY AREA</small><b>{cart.areaLabel}</b></span></div>
      </header>
      <section className="shared-cart-summary">
        <div><h1>Add items to the group cart</h1><p>Prices and stock come from the owner&apos;s assigned store.</p></div>
        <aside><b>{cart.items.length} products · {money(total)}</b><small>Checkout by {cart.ownerName}</small></aside>
      </section>
      {error && <div className="shared-cart-error">{error}</div>}
      <input
        className="shared-cart-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search products in this store"
      />
      <section className="shared-products-grid">
        {visibleProducts.map((product) => {
          const qty = quantityFor(product.id);
          const cartItem = cart.items.find((item) => String(item.id) === String(product.id));
          return (
            <article key={product.id}>
              <div>{product.image_url ? <img src={product.image_url} alt={product.name} /> : <ShoppingBag />}</div>
              <small>{productBrandLabel(product) || "Buyzaar Mart"}</small>
              <h2>{product.name}</h2>
              <span>{product.unit || "1 unit"}</span>
              {cartItem?.added_by_name && <em>Added by {cartItem.added_by_name}</em>}
              <footer>
                <b>{money(product.selling_price)}</b>
                {qty ? (
                  <div>
                    <button disabled={busyId === product.id} onClick={() => changeItem(product.id, -1)}><Minus /></button>
                    <b>{qty}</b>
                    <button disabled={busyId === product.id || qty >= product.stock} onClick={() => changeItem(product.id, 1)}><Plus /></button>
                  </div>
                ) : (
                  <button disabled={busyId === product.id || !product.stock} onClick={() => changeItem(product.id, 1)}><Plus /> Add</button>
                )}
              </footer>
            </article>
          );
        })}
      </section>
    </main>
  );
}
