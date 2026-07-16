// TikTok Catalog product feed (CSV).
//
// Mirrors the Meta feed (server/metaFeed.js) but formatted for TikTok's Product
// Catalog CSV spec. Reuses the SAME data access, price/availability logic, image
// URL, title/description sourcing, and RFC-4180 CSV escaping as the Meta feed —
// the only intentional differences are:
//   1. TikTok column header names/order (sku_id instead of id, etc.).
//   2. google_product_category / product_type are populated (the Meta feed keeps
//      them blank). This fixes TikTok's "missing google_product_category" warning.
//
// price uses the exact same "<amount> USD" format the Meta feed emits — the store
// sells in USD, and the prior TikTok rejection ("Invalid value: price") was caused
// by a JOD/USD currency mismatch in the old catalog, so USD is the source of truth.

import { normalizeSku, csvEscape, stripHtml, mapAvailability } from './metaFeed.js';

const SITE_BASE = process.env.MINIYO_SITE_BASE || 'https://miniyokids.com';

// Column order for the CSV header + every row (TikTok Catalog spec).
export const TIKTOK_FEED_COLUMNS = [
  'sku_id', 'title', 'description', 'availability', 'condition', 'price',
  'sale_price', 'link', 'image_link', 'brand', 'google_product_category',
  'product_type', 'item_group_id',
];

// Same price format the Meta feed uses: "18.99 USD". Currency is always USD.
function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} USD` : '';
}

// Conservative default when no category can be derived from the DB. Baby/kids
// apparel is the correct bucket for the overwhelming majority of the catalog.
const DEFAULT_GOOGLE_CATEGORY = 'Apparel & Accessories > Clothing > Baby & Toddler Clothing';

// Keyword → Google Product Taxonomy mapping, checked in order (first match wins).
// Keys are matched against the lowercased "category / subcategory / product name"
// text so a socks subcategory maps to socks regardless of the parent category.
const GOOGLE_CATEGORY_RULES = [
  [/\bsock\b|socks/, 'Apparel & Accessories > Clothing > Underwear & Socks > Socks'],
  [/bathrobe|robe/, 'Apparel & Accessories > Clothing > Sleepwear & Loungewear > Robes'],
  [/pajama|pyjama|sleepwear|nightgown/, 'Apparel & Accessories > Clothing > Sleepwear & Loungewear'],
  [/swaddle|muslin/, 'Baby & Toddler > Nursing & Feeding'],
  [/bib|burp/, 'Baby & Toddler > Nursing & Feeding > Baby Bibs & Burp Cloths'],
  [/pacifier|teether/, 'Baby & Toddler > Nursing & Feeding > Pacifiers & Teethers'],
  [/blanket/, 'Baby & Toddler > Nursery > Baby & Toddler Blankets'],
  [/towel|cloth|tissue/, 'Baby & Toddler > Nursing & Feeding'],
  [/hairband|hair clip|hair-band|hairclip|clip\b|pompom|grosgrain/, 'Apparel & Accessories > Clothing Accessories > Hair Accessories'],
  [/\bhat\b|\bcap\b|bonnet|beanie/, 'Apparel & Accessories > Clothing Accessories > Hats'],
  [/collar/, 'Apparel & Accessories > Clothing Accessories'],
  [/dress|overall|bodysuit|salopette|tights|pants|t-shirt|tshirt|short|set|apparel/, DEFAULT_GOOGLE_CATEGORY],
];

// Resolve a product's category + subcategory names from the Category records,
// keyed by id. Returns { category, subcategory } (either may be '').
function resolveCategoryNames(product, categoriesById) {
  const cat = product.category_id ? categoriesById.get(product.category_id) : null;
  const sub = product.subcategory_id ? categoriesById.get(product.subcategory_id) : null;
  return {
    category: cat?.name || '',
    subcategory: sub?.name || '',
  };
}

// Map a product to a Google Product Taxonomy string. Prefers the most specific
// signal (subcategory), falling back to a conservative baby-apparel default so a
// row is NEVER emitted with a blank google_product_category.
export function mapGoogleCategory({ category, subcategory, name }) {
  const haystack = `${subcategory} ${category} ${name}`.toLowerCase();
  for (const [pattern, taxonomy] of GOOGLE_CATEGORY_RULES) {
    if (pattern.test(haystack)) return taxonomy;
  }
  return DEFAULT_GOOGLE_CATEGORY;
}

// Human-readable breadcrumb from the DB category/subcategory (e.g.
// "Apparel > Footed Overall"). Empty parts are dropped; '' when nothing is known.
export function buildProductType({ category, subcategory }) {
  return [category, subcategory].filter(Boolean).join(' > ');
}

// Build a single TikTok feed row object (unescaped values) for a product.
// `categoriesById` is a Map of Category.id → Category record for name resolution.
export function buildTiktokFeedRow(product, categoriesById = new Map()) {
  const sku = product.sku;
  const slug = product.slug || product.id;
  const price = Number(product.price_usd);
  const compareAt = Number(product.compare_at_price_usd);

  // Same discount logic as the Meta feed: only treat compare_at as the "was"
  // price when it is genuinely higher than the current price.
  const hasRealDiscount = Number.isFinite(compareAt) && Number.isFinite(price) && compareAt > price;

  const { category, subcategory } = resolveCategoryNames(product, categoriesById);
  const name = product.name || '';

  return {
    sku_id: normalizeSku(sku),
    title: name,
    description: stripHtml(product.description || product.short_description || name),
    availability: mapAvailability(product),
    condition: 'new',
    price: hasRealDiscount ? formatPrice(compareAt) : formatPrice(price),
    sale_price: hasRealDiscount ? formatPrice(price) : '',
    link: `${SITE_BASE}/product/${slug}`,
    image_link: product.image_url || '',
    brand: product.brand || 'MiniYo',
    google_product_category: mapGoogleCategory({ category, subcategory, name }),
    product_type: buildProductType({ category, subcategory }),
    item_group_id: normalizeSku(sku),
  };
}

// Build the full CSV string from a list of product records. Products without a
// sku are skipped (the sku is the required catalog id and event key), matching
// the Meta feed. `categoriesById` maps Category.id → Category record.
export function buildTiktokFeedCsv(products = [], categoriesById = new Map()) {
  const header = TIKTOK_FEED_COLUMNS.join(',');
  const rows = [header];
  for (const product of products) {
    if (!product?.sku) continue;
    const row = buildTiktokFeedRow(product, categoriesById);
    rows.push(TIKTOK_FEED_COLUMNS.map((col) => csvEscape(row[col])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
