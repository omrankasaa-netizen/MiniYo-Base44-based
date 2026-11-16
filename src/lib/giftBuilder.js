// "Build a gift box" — pure recommendation logic (no React, no network) so it
// can be unit-tested with `node --test`.
//
// Shoppers pick the baby's age (and optionally girl/boy). We then suggest
// in-stock pieces in that size, grouped into three steps:
//   outfit → cozy (blanket / swaddle / jacket) → extras (socks, bonnet, …)
// plus the ready-made gift boxes / bundles that fit the same age.

export const AGE_OPTIONS = [
  { key: '0-3M', en: '0–3 months', ar: '0–3 أشهر' },
  { key: '3-6M', en: '3–6 months', ar: '3–6 أشهر' },
  { key: '6-9M', en: '6–9 months', ar: '6–9 أشهر' },
  { key: '9-12M', en: '9–12 months', ar: '9–12 شهر' },
  { key: '12-18M', en: '12–18 months', ar: '12–18 شهر' },
  { key: '18-24M', en: '18–24 months', ar: '18–24 شهر' },
];

export const GENDER_OPTIONS = [
  { key: 'girl', en: 'Girl', ar: 'بنت' },
  { key: 'boy', en: 'Boy', ar: 'صبي' },
  { key: 'any', en: 'Not sure yet', ar: 'بعد ما منعرف' },
];

export const STEPS = ['outfit', 'cozy', 'extras'];

// Category slug → builder step. Anything not listed is left out of the
// builder (swimwear, summer sale, …). Ready-made gift categories are shown in
// their own "ready-made boxes" section instead of a step.
const STEP_BY_CATEGORY = {
  rompers: 'outfit', 'footed-rompers': 'outfit', 'dungaree-rompers': 'outfit',
  'clothing-sets': 'outfit', dresses: 'outfit', sweatshirts: 'outfit',
  'top-bloomer-sets': 'outfit', 'bodysuit-sets': 'outfit', 'muslin-sets': 'outfit',
  'pyjama-sets': 'outfit', bodysuits: 'outfit', pants: 'outfit',
  blankets: 'cozy', swaddles: 'cozy', jackets: 'cozy', towels: 'cozy', 'bath-sets': 'cozy',
  socks: 'extras', tights: 'extras', hats: 'extras', headbands: 'extras',
  'pacifier-holders': 'extras', bibs: 'extras', 'accessory-sets': 'extras',
  washcloths: 'extras', accessories: 'extras',
};
export const READY_MADE_CATEGORIES = new Set(['gift-sets', 'hospital-sets', 'newborn-gift-sets']);

// Fallback for products without a category.
const NAME_HINTS = [
  [/blanket|swaddle|jacket|towel/i, 'cozy'],
  [/sock|tight|bonnet|\bhat\b|headband|clip|bib|mittens?|turban/i, 'extras'],
  [/romper|set|dress|sweatshirt|bodysuit|pyjama|onesie/i, 'outfit'],
];

/** Builder step for a product, or null when it doesn't belong in the builder. */
export function stepFor(product, categorySlug) {
  if (!product) return null;
  if (categorySlug && STEP_BY_CATEGORY[categorySlug]) return STEP_BY_CATEGORY[categorySlug];
  if (categorySlug) return null; // known category we deliberately skip
  for (const [re, step] of NAME_HINTS) if (re.test(product.name || '')) return step;
  return null;
}

/**
 * Parse a size label into a month range. "3-6M" → [3, 6], "3-6" → [3, 6],
 * "2Y" → [24, 36], "2-3Y" → [24, 36]. Returns null for unparseable labels.
 * (Only "2-3Y" style ranges ending in Y are treated as years.)
 * "One size" / empty → 'any'.
 */
export function parseSizeMonths(size) {
  const s = String(size ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s || s === '-' || /one ?size|onesize|^os$|^tu$|free/.test(s)) return 'any';
  let m = s.match(/^(\d+)-(\d+)(m|y|months?|years?)?$/);
  if (m) {
    const mult = m[3] && m[3].startsWith('y') ? 12 : 1;
    const a = Number(m[1]) * mult;
    const b = Number(m[2]) * mult;
    return a < b ? [a, b] : null;
  }
  m = s.match(/^(\d+)(y|years?)$/);
  if (m) return [Number(m[1]) * 12, Number(m[1]) * 12 + 12];
  return null;
}

/**
 * Does a variant size fit the chosen age? The size range must contain the
 * middle of the age range: "0-6M" fits both 0-3M and 3-6M, "1-3M" fits 0-3M,
 * "6-12M" fits 6-9M and 9-12M.
 */
export function sizeFitsAge(size, ageKey) {
  const v = parseSizeMonths(size);
  if (v === 'any') return true;
  const a = parseSizeMonths(ageKey);
  if (!v || !Array.isArray(a)) return false;
  const mid = (a[0] + a[1]) / 2;
  return v[0] <= mid && mid <= v[1];
}

export function genderFits(productGender, gender) {
  const g = String(productGender || '').toLowerCase();
  if (!gender || gender === 'any') return g === '' || g === 'unisex';
  if (gender === 'girl') return g !== 'boys';
  if (gender === 'boy') return g !== 'girls';
  return true;
}

function availableQty(row) {
  if (!row) return 0;
  const onHand = Number(row.qty_on_hand ?? row.stock_quantity ?? 0);
  const reserved = Number(row.qty_reserved ?? 0);
  return Math.max(0, onHand - reserved);
}

function rank(a, b) {
  return (Number(!!b.product.is_featured) - Number(!!a.product.is_featured))
    || (Number(!!b.product.is_new) - Number(!!a.product.is_new))
    || String(b.product.created_date || '').localeCompare(String(a.product.created_date || ''));
}

/**
 * Build recommendations for one age + gender.
 *
 * @param {object[]} products  Active products (bundles carry a computed stock_quantity)
 * @param {object[]} variants  ProductVariant rows
 * @param {Record<string,string>} categorySlugById
 * @param {{age:string, gender?:string, perStep?:number}} opts
 * @returns {{ ready: object[], steps: Record<string, {product, options}[]> }}
 *   `options` are the in-stock variants of that product in the chosen size
 *   (an empty array means the product has no variants and is in stock).
 */
export function buildRecommendations(products, variants, categorySlugById, opts) {
  const { age, gender = 'any', perStep = 12 } = opts || {};
  const steps = { outfit: [], cozy: [], extras: [] };
  const ready = [];
  if (!age) return { ready, steps };

  const variantsByProduct = new Map();
  for (const v of variants || []) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id).push(v);
  }

  for (const p of products || []) {
    if (!p || (p.status && p.status !== 'Active')) continue;
    if (!genderFits(p.gender, gender)) continue;
    const slug = categorySlugById?.[p.category_id] || '';

    if (p.is_bundle) {
      const items = Array.isArray(p.bundle_items) ? p.bundle_items : [];
      // Every sized piece must fit: a 3-6M box with 0-6M tights is not a 0-3M gift.
      const sized = items.filter((it) => it.size && parseSizeMonths(it.size) !== 'any');
      if (availableQty(p) > 0 && sized.length > 0 && sized.every((it) => sizeFitsAge(it.size, age))) {
        ready.push(p);
      }
      continue;
    }

    const pvs = variantsByProduct.get(p.id) || [];
    const options = p.has_variants
      ? pvs.filter((v) => availableQty(v) > 0 && sizeFitsAge(v.size, age))
      : [];
    const inStock = p.has_variants ? options.length > 0 : availableQty(p) > 0;
    if (!inStock) continue;

    if (READY_MADE_CATEGORIES.has(slug)) {
      // Non-bundle gift sets must still come in the chosen size.
      if (p.has_variants && options.some((v) => parseSizeMonths(v.size) !== 'any')) ready.push(p);
      continue;
    }

    const step = stepFor(p, slug);
    if (!step) continue;
    // Clothes must fit the age exactly; one-size items only make sense as extras/cozy.
    if (step === 'outfit' && (!p.has_variants || options.every((v) => parseSizeMonths(v.size) === 'any'))) continue;
    steps[step].push({ product: p, options, group: slug || step });
  }

  for (const k of STEPS) steps[k] = diversify(steps[k].sort(rank)).slice(0, perStep);
  ready.sort((a, b) => Number(!!b.is_bundle) - Number(!!a.is_bundle) || Number(b.price_usd || 0) - Number(a.price_usd || 0));
  return { ready, steps };
}

/**
 * Round-robin across categories (keeping rank order inside each) so a step
 * isn't twelve pairs of socks: socks, bonnet, tights, clip, socks, …
 */
export function diversify(entries) {
  const groups = new Map();
  for (const e of entries) {
    const g = e.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  const queues = [...groups.values()];
  const out = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

/** Total price of the selected pieces (variant price overrides product price). */
export function selectionTotal(selected) {
  return (selected || []).reduce((sum, s) => sum + Number(s.variant?.price_usd || s.product?.price_usd || 0), 0);
}
