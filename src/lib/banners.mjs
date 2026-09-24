/** Fallback home banners when Sync has none active yet. */

export const HERO_BANNER = {
  eyebrow: "YOUR NEIGHBOURHOOD MART",
  title: "Stock up on daily essentials",
  subtitle:
    "Farm-fresh groceries, household favourites and everyday value from your local Buyzaar store.",
  cta: "Shop now",
  href: "/products",
  image_url: null,
  tone: "green",
};

export const PROMO_CARDS = [
  {
    id: "essentials",
    tone: "green",
    title: "Everyday essentials",
    subtitle: "Groceries, staples and home care at store prices.",
    cta: "Order now",
    href: "/products",
    image_url: null,
  },
  {
    id: "savings",
    tone: "cream",
    title: "Biggest savings",
    subtitle: "Deals on your local store favourites.",
    cta: "Explore deals",
    href: "/products?sort=discount",
    image_url: null,
  },
  {
    id: "hampers",
    tone: "red",
    title: "Gift hampers",
    subtitle: "Ready packs or customise your own gift box.",
    cta: "Build a hamper",
    href: "/hamper",
    image_url: null,
  },
];

export function resolveHomeBanners(payload) {
  const hero = payload?.hero
    ? {
        eyebrow: payload.hero.eyebrow || HERO_BANNER.eyebrow,
        title: payload.hero.title || HERO_BANNER.title,
        subtitle: payload.hero.subtitle || HERO_BANNER.subtitle,
        cta: payload.hero.cta || HERO_BANNER.cta,
        href: payload.hero.href || HERO_BANNER.href,
        image_url: payload.hero.image_url || null,
        tone: payload.hero.tone || "green",
      }
    : HERO_BANNER;

  const liveCards = Array.isArray(payload?.promo_cards)
    ? payload.promo_cards
    : [];
  const promoCards =
    liveCards.length > 0
      ? liveCards.map((card, index) => ({
          id: String(card.id || `card-${index}`),
          tone: card.tone || "green",
          title: card.title || "",
          subtitle: card.subtitle || "",
          cta: card.cta || "Shop now",
          href: card.href || "/products",
          image_url: card.image_url || null,
        }))
      : PROMO_CARDS;

  return {
    hero,
    promoCards,
    strip: payload?.strip || null,
  };
}
