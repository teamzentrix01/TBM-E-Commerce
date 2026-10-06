import test from "node:test";
import assert from "node:assert/strict";
import { cartTotals, discount, listingUrl, sortProducts, buildShopCategories } from "../src/lib/shop.mjs";

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

test("home tiles use the full subcategory list, not only products already loaded", () => {
  const tiles = buildShopCategories({
    subCategories: [
      { id: 9, name: "SNACKS", category_id: 1, product_count: 4 },
      { id: 3, name: "Dairy", category_id: 1, product_count: 40 },
      { id: 8, name: "TBM HO", category_id: 1, product_count: 12 },
      { id: 4, name: "Pet care", category_id: 2, product_count: 0 },
    ],
    products: [
      { id: 1, sub_category_id: 9, sub_category_name: "Snacks", category_id: 1 },
      { id: 2, sub_category_id: 11, sub_category_name: "Household", category_id: 2, image_url: "house.jpg" },
    ],
    categories: [{ id: 1, name: "Food", product_count: 80 }],
  });
  assert.deepEqual(
    tiles.map((tile) => tile.name),
    ["Dairy", "Snacks", "Household"],
  );
  assert.equal(tiles[0].kind, "subcategory");
  assert.equal(tiles[0].categoryId, 1);
  assert.equal(tiles[1].imageProduct, null);
  assert.equal(tiles[2].imageProduct.image_url, "house.jpg");
});

test("home tiles fall back to store categories and a product photo", () => {
  const tiles = buildShopCategories({
    categories: [
      { id: 2, name: "NON FOOD", product_count: 10 },
      { id: 1, name: "Food", product_count: 0 },
    ],
    products: [
      { id: 5, category_id: 2, category_name: "NON FOOD" },
      { id: 6, category_id: 2, category_name: "NON FOOD", image_url: "soap.jpg" },
    ],
  });
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].name, "Non Food");
  assert.equal(tiles[0].kind, "category");
  assert.equal(tiles[0].imageProduct.id, 6);
});
