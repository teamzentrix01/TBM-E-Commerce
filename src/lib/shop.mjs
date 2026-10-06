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

function parentCategoryId(record) {
  return record?.category_id || record?.parent_id || record?.categoryId || null;
}

function listedProductCount(record) {
  if (record?.product_count == null || record.product_count === "") return null;
  const count = Number(record.product_count);
  return Number.isFinite(count) ? count : null;
}

function coverProduct(products, { subCategoryId, categoryId }) {
  return (
    products.find((product) => {
      if (!product?.image_url) return false;
      if (subCategoryId != null) {
        return String(product.sub_category_id) === String(subCategoryId);
      }
      return String(product.category_id) === String(categoryId);
    }) || null
  );
}

/**
 * Home tiles follow the full public subcategory list from the catalogue.
 * Products already on the page only supply a cover image and any subcategory
 * the facet list has not caught up with yet.
 */
export function buildShopCategories({
  categories = [],
  subCategories = [],
  products = [],
  limit = 32,
} = {}) {
  const byId = new Map();
  let order = 0;

  for (const sub of filterPublicFacets(subCategories)) {
    const count = listedProductCount(sub);
    if (count === 0) continue;
    const key = String(sub.id);
    if (byId.has(key)) continue;
    byId.set(key, {
      id: sub.id,
      name: titleCaseLabel(sub.name),
      categoryId: parentCategoryId(sub),
      kind: "subcategory",
      productCount: count || 0,
      order: order++,
      imageProduct: coverProduct(products, { subCategoryId: sub.id }),
    });
  }

  for (const product of products) {
    const id = product.sub_category_id;
    const name = product.sub_category_name;
    if (!id || !isPublicLabel(name)) continue;
    const key = String(id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, {
        id,
        name: titleCaseLabel(name),
        categoryId: product.category_id || null,
        kind: "subcategory",
        productCount: 0,
        order: order++,
        imageProduct: product.image_url ? product : null,
      });
      continue;
    }
    if (!existing.categoryId && product.category_id) {
      existing.categoryId = product.category_id;
    }
    if (!existing.imageProduct && product.image_url) {
      existing.imageProduct = product;
    }
  }

  if (byId.size) {
    return [...byId.values()]
      .sort(
        (a, b) => b.productCount - a.productCount || a.order - b.order,
      )
      .slice(0, limit);
  }

  const fromCats = filterPublicFacets(categories).filter(
    (category) => listedProductCount(category) !== 0,
  );
  if (!fromCats.length) return [];

  return fromCats.slice(0, limit).map((category) => ({
    id: category.id,
    name: titleCaseLabel(category.name),
    categoryId: category.id,
    kind: "category",
    productCount: listedProductCount(category) || 0,
    imageProduct: coverProduct(products, { categoryId: category.id }),
  }));
}
