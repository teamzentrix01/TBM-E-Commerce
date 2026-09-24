export const DELIVERY_FEE = 39;
export const FREE_DELIVERY_MINIMUM = 499;
export const DELIVERY_SLOTS = [
  "Today, 5 PM - 7 PM",
  "Today, 7 PM - 9 PM",
  "Tomorrow, 9 AM - 11 AM",
];

/** Hide internal / junk catalogue labels like "TBM HO". */
const JUNK_LABEL =
  /^(tbm(\s|$)|tbm[\s_-]*ho|buyzaar(\s|$)|test|dummy|unknown|n\/?a|null|undefined|none|misc|general|default|ho)$/i;

export function isPublicLabel(value) {
  const label = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!label || label.length < 2) return false;
  if (JUNK_LABEL.test(label)) return false;
  if (/^tbm\b/i.test(label)) return false;
  if (/^\[\s*internal/i.test(label)) return false;
  return true;
}

export function productBrandLabel(product, fallback = "") {
  if (isPublicLabel(product?.brand_name))
    return String(product.brand_name).trim();
  return fallback;
}

export function formatPackSize(unit) {
  const value = String(unit || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!value) return "";
  if (/^(pcs?|pc|piece|pieces|n\/?a|na|null|undefined|1\s*unit)$/i.test(value))
    return "";
  return value;
}

export function filterPublicFacets(records = []) {
  return records.filter((item) => isPublicLabel(item?.name || item?.title));
}

export function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function cartTotals(items) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.selling_price || 0) * item.qty,
    0,
  );
  const mrp = items.reduce(
    (sum, item) =>
      sum +
      Math.max(Number(item.mrp || 0), Number(item.selling_price || 0)) *
        item.qty,
    0,
  );
  const delivery =
    subtotal === 0 || subtotal >= FREE_DELIVERY_MINIMUM ? 0 : DELIVERY_FEE;
  return {
    subtotal,
    savings: Math.max(0, mrp - subtotal),
    delivery,
    total: subtotal + delivery,
  };
}

export function discount(product) {
  const mrp = Number(product.mrp || 0);
  return mrp > Number(product.selling_price)
    ? Math.round(((mrp - Number(product.selling_price)) / mrp) * 100)
    : 0;
}

export function sortProducts(products, sort) {
  const result = [...products];
  if (sort === "price-low")
    result.sort((a, b) => Number(a.selling_price) - Number(b.selling_price));
  if (sort === "price-high")
    result.sort((a, b) => Number(b.selling_price) - Number(a.selling_price));
  if (sort === "discount") result.sort((a, b) => discount(b) - discount(a));
  return result;
}

export function listingUrl(params = {}) {
  const query = new URLSearchParams();
  for (const key of ["q", "category", "subcategory", "brand", "sort"]) {
    if (params[key] && (key !== "sort" || params[key] !== "featured"))
      query.set(key, String(params[key]));
  }
  return `/products${query.size ? `?${query}` : ""}`;
}

export function titleCaseLabel(value) {
  const label = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!label) return "";
  if (label !== label.toUpperCase()) return label;
  return label
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Prefer product sub-categories for Blinkit-style home tiles. */
export function buildShopCategories({ categories = [], products = [], limit = 20 } = {}) {
  const fromSubs = [];
  const seen = new Set();
  for (const product of products) {
    const id = product.sub_category_id;
    const name = product.sub_category_name;
    if (!id || !isPublicLabel(name)) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    fromSubs.push({
      id,
      name: titleCaseLabel(name),
      categoryId: product.category_id,
      kind: "subcategory",
      imageProduct: product.image_url ? product : null,
    });
  }
  if (fromSubs.length) return fromSubs.slice(0, limit);

  const fromCats = filterPublicFacets(categories).map((category) => ({
    id: category.id,
    name: titleCaseLabel(category.name),
    categoryId: category.id,
    kind: "category",
    imageProduct: null,
  }));
  if (fromCats.length) return fromCats.slice(0, limit);

  return [];
}
