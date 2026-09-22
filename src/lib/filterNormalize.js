// Storefront filter normalization layer.
//
// Product fields (sizes / age_group / gender) are free-text and messy: raw
// "colors" that are print names, ghost/overlapping size tokens, an unused
// "Kids" age, and lots of "Unisex". This module maps those raw values onto a
// small set of clean, ordered shopper-facing buckets. It NEVER mutates product
// data — it only affects how the Shop page derives filter options and matches
// products to a selected filter.
//
// Pure functions only, so they stay testable (see tests/filterNormalize.test.js).

// ── Fixed display orders (never alphabetical) ────────────────────────────────
// Shopper-requested granularity: month-by-month up to 24M, then one toddler
// bucket covering 2Y and up.
export const SIZE_BUCKETS = ['0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M', '2Y-5Y+'];
export const AGE_BUCKETS = ['Newborn', 'Baby', 'Toddler'];
export const GENDER_BUCKETS = ['Girls', 'Boys'];

// ── SIZE ─────────────────────────────────────────────────────────────────────
// Each raw token maps to one clean bucket. Broad spans map to EVERY bucket they
// cover, so a product tagged with a wide range still appears under each relevant
// age range. EU cm sizes (50-56, 56-62) are real clothing sizes and DO map.
// Non-clothing tokens (packs, blanket dimensions, "One size", "Assorted") map to
// NOTHING and are excluded from the size facet.
const SIZE_TOKEN_MAP = {
  // 0-3M
  '0-1m': ['0-3M'],
  '0-3m': ['0-3M'],
  '1-3m': ['0-3M'],
  'nb': ['0-3M'],
  '50-56': ['0-3M'], // EU 50-56cm ≈ newborn/0-3M
  // 3-6M
  '3-6m': ['3-6M'],
  '0-6m': ['0-3M', '3-6M'], // span covers both
  '56-62': ['3-6M'], // EU 56-62cm ≈ 3-6M
  // 6-9M
  '6-9m': ['6-9M'],
  // 9-12M
  '9-12m': ['9-12M'],
  // 6-12M span covers both month buckets
  '6-12m': ['6-9M', '9-12M'],
  // 12-18M
  '12-18m': ['12-18M'],
  // 18-24M
  '18-24m': ['18-24M'],
  // 12-24M span covers both; 1-2Y literally means 12-24 months
  '12-24m': ['12-18M', '18-24M'],
  '1-2y': ['12-18M', '18-24M'],
  // 2Y-5Y+ (24-36M = 2-3 years)
  '24-36m': ['2Y-5Y+'],
  '2-3y': ['2Y-5Y+'],
  '3-4y': ['2Y-5Y+'],
  '4-5y': ['2Y-5Y+'],
  '2-4y': ['2Y-5Y+'],
  '3-5y': ['2Y-5Y+'],
  '2-5y': ['2Y-5Y+'],
  '2y': ['2Y-5Y+'],
  '3y': ['2Y-5Y+'],
  '4y': ['2Y-5Y+'],
  '5y': ['2Y-5Y+'],
  // Bare numbers appear when variant strings like "3-6/6-9/9-12/12-18M" are
  // split on '/' — only the last part keeps the unit suffix.
  '0-1': ['0-3M'],
  '0-3': ['0-3M'],
  '1-3': ['0-3M'],
  '3-6': ['3-6M'],
  '6-9': ['6-9M'],
  '9-12': ['9-12M'],
  '12-18': ['12-18M'],
  '18-24': ['18-24M'],
  // Broad spans → every overlapping bucket.
  '0-18m': ['0-3M', '3-6M', '6-9M', '9-12M', '12-18M'],
  'nb-0m to 6-9m': ['0-3M', '3-6M', '6-9M'],
  '0-1y': ['0-3M', '3-6M', '6-9M', '9-12M'],
};

// Tokens explicitly excluded from the size facet (not clothing sizes).
const SIZE_EXCLUDE = new Set([
  '5-pack', '7-pack',
  '77x90 cm', '90x90 cm', '80x85+85x90 cm',
  'one size', 'assorted', 'none', 'n/a', 'mixed',
]);

// Map a single raw size token to zero or more clean buckets.
export function sizeTokenToBuckets(token) {
  if (!token) return [];
  const key = String(token).trim().toLowerCase();
  if (!key || SIZE_EXCLUDE.has(key)) return [];
  return SIZE_TOKEN_MAP[key] || [];
}

// Map a raw sizes string (pipe-delimited; variant strings also use "/" inside
// compound tokens like "3-6/6-9/9-12/12-18M" or "Ecru / 1-3M") to clean
// buckets, deduplicated and returned in the fixed display order.
export function productSizeBuckets(sizesStr) {
  if (!sizesStr) return [];
  const found = new Set();
  for (const raw of String(sizesStr).split(/[|/]/)) {
    for (const bucket of sizeTokenToBuckets(raw)) found.add(bucket);
  }
  return SIZE_BUCKETS.filter(b => found.has(b));
}

// Variant-aware: a product's purchasable sizes live on its ProductVariant rows,
// and the product-level `sizes` string is sometimes empty (8 winter products)
// or stale. Union both sources so the size facet reflects what is actually
// sold. Non-size junk in variant.size (color names, "One size", "None") maps
// to nothing by design.
export function productSizeBucketsWithVariants(product, variants = []) {
  const parts = [product?.sizes, ...variants.map(v => v?.size)].filter(Boolean);
  return productSizeBuckets(parts.join('|'));
}

// ── AGE GROUP ────────────────────────────────────────────────────────────────
// Honest mapping of the raw catalog values: most products are "Baby" (3-24M
// range), a small set is "Newborn", fewer still "Toddler". The unused "Kids"
// ghost maps to nothing. (Baby previously folded into Newborn, which made the
// Newborn filter meaningless and silently broke the age:'Baby' quick links.)
export function normalizeAge(raw) {
  if (!raw) return null;
  switch (String(raw).trim().toLowerCase()) {
    case 'newborn':
      return 'Newborn';
    case 'baby':
      return 'Baby';
    case 'toddler':
      return 'Toddler';
    default:
      return null;
  }
}

// ── GENDER ───────────────────────────────────────────────────────────────────
// Only Girls and Boys are shopper-facing. A "Unisex" product surfaces under
// BOTH, so filtering Boys shows Boys + Unisex and filtering Girls shows
// Girls + Unisex.
export function genderMatchBuckets(raw) {
  if (!raw) return [];
  switch (String(raw).trim().toLowerCase()) {
    case 'girls':
      return ['Girls'];
    case 'boys':
      return ['Boys'];
    case 'unisex':
      return ['Girls', 'Boys'];
    default:
      return [];
  }
}

// ── Option-list builders (only buckets ≥1 visible product maps to) ───────────
function orderedPresent(order, present) {
  return order.filter(b => present.has(b));
}

export function availableSizeBuckets(products, variantsByProduct = null) {
  const present = new Set();
  for (const p of products) {
    const buckets = variantsByProduct
      ? productSizeBucketsWithVariants(p, variantsByProduct[p.id] || [])
      : productSizeBuckets(p.sizes);
    for (const b of buckets) present.add(b);
  }
  return orderedPresent(SIZE_BUCKETS, present);
}

export function availableAgeBuckets(products) {
  const present = new Set();
  for (const p of products) {
    const a = normalizeAge(p.age_group);
    if (a) present.add(a);
  }
  return orderedPresent(AGE_BUCKETS, present);
}

export function availableGenderBuckets(products) {
  const present = new Set();
  for (const p of products) {
    for (const g of genderMatchBuckets(p.gender)) present.add(g);
  }
  return orderedPresent(GENDER_BUCKETS, present);
}

// ── Bilingual labels for the buckets (RTL-aware via the site's t(en, ar)) ────
export const SIZE_LABELS_AR = {
  '0-3M': '0-3 شهور',
  '3-6M': '3-6 شهور',
  '6-9M': '6-9 شهور',
  '9-12M': '9-12 شهر',
  '12-18M': '12-18 شهر',
  '18-24M': '18-24 شهر',
  '2Y-5Y+': '2-5+ سنين',
};

export const AGE_LABELS_AR = {
  Newborn: 'حديث الولادة',
  Baby: 'بيبي',
  Toddler: 'تودلر',
};

export const GENDER_LABELS_AR = {
  Girls: 'بنات',
  Boys: 'أولاد',
};
