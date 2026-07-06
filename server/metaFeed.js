// Meta catalog product feed (CSV).
//
// Emits one row per product with Meta's supported columns. The `id` column is
// the product SKU — the SAME identifier used as content_ids in Pixel/CAPI
// events and product:retailer_item_id in the injected JSON-LD — so catalog
// entries match conversion events for dynamic ads.
//
// Conservative by design: we never invent Meta taxonomy. google_product_category
// is left blank, and gender/age_group are only mapped when the source value is
// unambiguous (otherwise omitted).

const SITE_BASE = process.env.MINIYO_SITE_BASE || 'https://miniyokids.com';

// Column order for the CSV header + every row.
export const FEED_COLUMNS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'link', 'image_link', 'brand', 'google_product_category', 'product_type',
  'gender', 'age_group', 'size', 'color',
];

// RFC-4180 CSV field escaping: wrap in quotes and double internal quotes when
// the value contains a comma, quote, CR or LF.
export function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Strip HTML tags + collapse whitespace so descriptions are clean plain text.
export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} USD` : '';
}

// Availability: Active status → in stock. Variant-parent products (has_variants)
// keep product-level stock_quantity at 0 while real stock lives on variants, so
// an Active variant-parent is treated as in stock (matches the storefront's own
// behavior). Documented in docs/META_TRACKING.md.
export function mapAvailability(product) {
  if (product.status !== 'Active') return 'out of stock';
  if (product.has_variants) return 'in stock';
  return Number(product.stock_quantity) > 0 ? 'in stock' : 'out of stock';
}

// Conservative gender mapping. Only the unambiguous cases are mapped; anything
// else is left blank rather than guessed.
export function mapGender(raw) {
  const g = String(raw || '').trim().toLowerCase();
  if (g === 'boys' || g === 'boy' || g === 'male') return 'male';
  if (g === 'girls' || g === 'girl' || g === 'female') return 'female';
  if (g === 'unisex') return 'unisex';
  return '';
}

// Conservative age_group mapping to Meta's enum (newborn/infant/toddler/kids).
// Only maps clear source values; unknown → blank (never invented).
export function mapAgeGroup(raw) {
  const a = String(raw || '').trim().toLowerCase();
  if (!a) return '';
  if (a === 'newborn') return 'newborn';
  if (a === 'infant' || a === 'baby') return 'infant';
  if (a === 'toddler') return 'toddler';
  if (a === 'kids' || a === 'kid' || a === 'children') return 'kids';
  return '';
}

// First pipe-delimited token (products are variant-parents; the full variant
// matrix is a future per-variant feed enhancement). Empty → ''.
function firstToken(piped) {
  const s = String(piped || '').split('|')[0]?.trim();
  return s || '';
}

// Build a single feed row object (unescaped values) for a product.
export function buildFeedRow(product) {
  const sku = product.sku;
  const slug = product.slug || product.id;
  const price = Number(product.price_usd);
  const compareAt = Number(product.compare_at_price_usd);

  // Only treat compare_at as the "was" price when it is genuinely higher than
  // the current price — then price=compare_at and sale_price=current price.
  const hasRealDiscount = Number.isFinite(compareAt) && Number.isFinite(price) && compareAt > price;

  return {
    id: sku,
    title: product.name || '',
    description: stripHtml(product.description || product.short_description || product.name || ''),
    availability: mapAvailability(product),
    condition: 'new',
    price: hasRealDiscount ? formatPrice(compareAt) : formatPrice(price),
    sale_price: hasRealDiscount ? formatPrice(price) : '',
    link: `${SITE_BASE}/product/${slug}`,
    image_link: product.image_url || '',
    brand: product.brand || 'MiniYo',
    google_product_category: '', // conservative: never invented
    product_type: '',            // conservative: never invented
    gender: mapGender(product.gender),
    age_group: mapAgeGroup(product.age_group),
    size: firstToken(product.sizes),
    color: firstToken(product.colors),
  };
}

// Build the full CSV string from a list of product records. Products without a
// sku are skipped (the sku is the required catalog id and event key).
export function buildFeedCsv(products = []) {
  const header = FEED_COLUMNS.join(',');
  const rows = [header];
  for (const product of products) {
    if (!product?.sku) continue;
    const row = buildFeedRow(product);
    rows.push(FEED_COLUMNS.map((col) => csvEscape(row[col])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}
