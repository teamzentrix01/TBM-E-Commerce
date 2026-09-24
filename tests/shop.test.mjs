import test from "node:test";
import assert from "node:assert/strict";
import { cartTotals, discount, listingUrl, sortProducts } from "../src/lib/shop.mjs";

test("empty baskets never incur a delivery fee", () => {
  assert.deepEqual(cartTotals([]), { subtotal: 0, savings: 0, delivery: 0, total: 0 });
});

test("free delivery starts at exactly 499 rupees, including quantity changes", () => {
  const item = { selling_price: "249.50", mrp: "300", qty: 1 };
  assert.deepEqual(cartTotals([item]), { subtotal: 249.5, savings: 50.5, delivery: 39, total: 288.5 });
  assert.deepEqual(cartTotals([{ ...item, qty: 2 }]), { subtotal: 499, savings: 101, delivery: 0, total: 499 });
  assert.equal(cartTotals([{ selling_price: 498.99, qty: 1 }]).delivery, 39);
});

test("MRP savings are informational and are not deducted from selling prices twice", () => {
  const result = cartTotals([{ selling_price: 100, mrp: 150, qty: 3 }, { selling_price: 50, qty: 1 }]);
  assert.equal(result.savings, 150);
  assert.equal(result.total, 389);
  assert.equal(cartTotals([{ selling_price: 100, mrp: 80, qty: 1 }]).savings, 0);
});

test("sorting uses numeric prices without changing the source catalog order", () => {
  const products = [{ id: 1, selling_price: "100" }, { id: 2, selling_price: "9" }, { id: 3, selling_price: "50" }];
  assert.deepEqual(sortProducts(products, "price-low").map(item => item.id), [2, 3, 1]);
  assert.deepEqual(sortProducts(products, "price-high").map(item => item.id), [1, 3, 2]);
  assert.deepEqual(products.map(item => item.id), [1, 2, 3]);
});

test("savings badges and sorting use actual MRP differences, not stale discount metadata", () => {
  const products = [{ id: 1, selling_price: 90, mrp: 100, discount_percent: 90 }, { id: 2, selling_price: 50, mrp: 100, discount_percent: 0 }];
  assert.equal(discount(products[0]), 10);
  assert.deepEqual(sortProducts(products, "discount").map(item => item.id), [2, 1]);
  assert.equal(discount({ selling_price: 100 }), 0);
});

test("listing links round-trip search punctuation and combined filters", () => {
  const input = { q: "Milk & tea + 1L", category: "12", brand: "7", sort: "price-low" };
  const url = new URL(listingUrl(input), "https://example.test");
  assert.equal(url.pathname, "/products");
  for (const [key, value] of Object.entries(input)) assert.equal(url.searchParams.get(key), value);
  assert.equal(listingUrl({ q: "featured", sort: "featured" }), "/products?q=featured");
  assert.equal(listingUrl({ q: "", brand: "", sort: "featured" }), "/products");
});
