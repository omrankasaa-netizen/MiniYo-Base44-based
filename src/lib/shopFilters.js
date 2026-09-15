// Pure helpers for tag-based shop filtering (home promo cards + category rail).
// Extracted from ShopPage so the matching rules are unit-testable.
//
// Product tags are a free-form comma-separated string (e.g. "miniyo, baby,
// summer"). Landing links pass ?tag=… values that must match forgivingly:
// singular/plural ("romper" ⇄ "rompers") and multi-word ("hospital sets").

export function normalizeTag(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // plural tolerance: consistent transform on BOTH sides, so
    // "rompers"→"romper", "accessories"→"accessory" (matches "accessory").
    .replace(/ies\b/g, 'y')
    .replace(/s\b/g, '');
}

export function productTagTokens(product) {
  return String(product?.tags || '')
    .split(',')
    .map(normalizeTag)
    .filter(Boolean);
}

// A product matches when ANY requested tag equals a product token, or the
// product token contains the full requested phrase ("hair accessory" ⊇
// "accessory"). Containment is one-directional on purpose: the reverse
// ("hospital set" ⊇ "set") would pull every generic "set" product into the
// Hospital Sets view — observed with the live catalog.
export function productMatchesTags(product, requestedTags) {
  const reqs = (Array.isArray(requestedTags) ? requestedTags : [requestedTags])
    .map(normalizeTag)
    .filter(Boolean);
  if (reqs.length === 0) return true;
  const tokens = productTagTokens(product);
  return reqs.some((req) =>
    tokens.some((tok) => tok === req || tok.includes(req))
  );
}

const NEW_SEASON_TAGS = ['winter', 'autumn', 'fall', 'new season'];

// "New Season Collection" rule (per merchandising spec):
//   items tagged winter/autumn (the new season drop), OR newly-badged items
//   that carry NO discount. `isOnSale` is injected so this stays pure/testable.
export function isNewSeasonItem(product, isOnSale) {
  const onSale = typeof isOnSale === 'function' ? Boolean(isOnSale(product)) : false;
  const tokens = productTagTokens(product);
  const seasonTagged = NEW_SEASON_TAGS.some((t) =>
    tokens.some((tok) => tok === t || tok.includes(t))
  );
  if (seasonTagged) return true;
  return Boolean(product?.is_new) && !onSale;
}

// Bilingual labels for the known merchandising tags (used for filter chips and
// page titles). Fallback is the raw tag string.
export const TAG_LABELS = {
  summer: { en: 'Summer Sale', ar: 'تخفيضات الصيف' },
  accessories: { en: 'Accessories', ar: 'أكسسوارات' },
  'hospital sets': { en: 'Hospital Sets', ar: 'أطقم الاستقبال' },
  rompers: { en: 'Rompers', ar: 'رومبرات' },
  romper: { en: 'Rompers', ar: 'رومبرات' },
  bodysuits: { en: 'Bodysuits', ar: 'بوديسوت' },
  'comfort sets': { en: 'Comfort Sets', ar: 'أطقم مريحة' },
  'comfort set': { en: 'Comfort Sets', ar: 'أطقم مريحة' },
};

export function tagLabel(tag, lang) {
  const entry = TAG_LABELS[normalizeTag(tag)] || TAG_LABELS[String(tag || '').toLowerCase().trim()];
  if (!entry) return tag;
  return lang === 'ar' ? entry.ar : entry.en;
}
