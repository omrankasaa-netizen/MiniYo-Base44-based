// Server-side per-product SEO / social metadata for the SPA.
//
// Product detail pages are a client-rendered React SPA. Meta's (Facebook)
// crawler and Pixel microdata scanner do NOT reliably execute JS, so they only
// ever saw the static index.html shell with the site-wide defaults — which is
// why the catalog microdata debugger reported missing `id`, `availability` and
// `price`. To fix that, the Express server intercepts `/product/:slug`, loads
// the product from the same SQLite DB the API uses, and rewrites the served
// index.html <head> with per-product OpenGraph product tags + JSON-LD Product
// schema BEFORE the SPA fallback. The marker region in index.html
// (MINIYO_SOCIAL_META_START/END) is replaced so no duplicate/conflicting
// og:type or canonical is left behind.

import { queryRecords } from './db.js';

const SITE_BASE = process.env.MINIYO_SITE_BASE || 'https://miniyokids.com';
const DEFAULT_SHARE_IMAGE = `${SITE_BASE}/miniyo-share.jpg`;

const SOCIAL_START = '<!-- MINIYO_SOCIAL_META_START';
const SOCIAL_END = 'MINIYO_SOCIAL_META_END -->';

// Escape a string for safe interpolation into an HTML attribute value.
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Look up a single product by its URL slug. Returns null when not found.
export function getProductBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const rows = queryRecords('Product', { query: { slug }, limit: 1 });
  return rows[0] || null;
}

// Meta only auto-populates a catalog entry when it can read a numeric price.
// Return a "18.99"-style string, or null when the stored value is not a finite
// number (never invent a price).
function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

// Build the replacement <head> block (SEO + OG product tags + JSON-LD) for a
// product. Uses English fields — the crawler is locale-agnostic and the client
// still renders the localized UI. Returns an indented HTML string.
export function buildProductMetaBlock(product) {
  const slug = product.slug || product.id;
  const url = `${SITE_BASE}/product/${slug}`;
  const sku = product.sku || product.id;
  const name = product.name || 'MiniYo';
  const socialDesc = product.short_description || product.description || '';
  const jsonLdDesc = product.description || product.short_description || '';
  const image = product.image_url || DEFAULT_SHARE_IMAGE;
  const isActive = product.status === 'Active';
  const availabilityOg = isActive ? 'in stock' : 'out of stock';
  const availabilitySchema = isActive
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
  const price = formatPrice(product.price_usd);

  const lines = [];
  lines.push('<!-- Per-product SEO + Meta catalog microdata (server-injected) -->');
  lines.push(`<title>${escapeAttr(name)} | MiniYo</title>`);
  if (socialDesc) lines.push(`<meta name="description" content="${escapeAttr(socialDesc)}" />`);
  lines.push('<meta name="author" content="MiniYo" />');
  lines.push(`<link rel="canonical" href="${escapeAttr(url)}" />`);

  // Open Graph product tags — Meta's preferred catalog microdata source.
  lines.push('<meta property="og:type" content="product" />');
  lines.push('<meta property="og:site_name" content="MiniYo" />');
  lines.push(`<meta property="og:url" content="${escapeAttr(url)}" />`);
  lines.push(`<meta property="og:title" content="${escapeAttr(name)}" />`);
  if (socialDesc) lines.push(`<meta property="og:description" content="${escapeAttr(socialDesc)}" />`);
  lines.push(`<meta property="og:image" content="${escapeAttr(image)}" />`);
  lines.push('<meta property="og:locale" content="en_US" />');
  lines.push('<meta property="og:locale:alternate" content="ar_LB" />');
  lines.push(`<meta property="product:retailer_item_id" content="${escapeAttr(sku)}" />`);
  if (price) {
    lines.push(`<meta property="product:price:amount" content="${escapeAttr(price)}" />`);
    lines.push('<meta property="product:price:currency" content="USD" />');
  }
  lines.push(`<meta property="product:availability" content="${availabilityOg}" />`);
  lines.push('<meta property="product:brand" content="MiniYo" />');
  lines.push('<meta property="product:condition" content="new" />');

  // Twitter card.
  lines.push('<meta name="twitter:card" content="summary_large_image" />');
  lines.push(`<meta name="twitter:title" content="${escapeAttr(name)}" />`);
  if (socialDesc) lines.push(`<meta name="twitter:description" content="${escapeAttr(socialDesc)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeAttr(image)}" />`);

  // JSON-LD Product schema.
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    productID: sku,
    sku,
    name,
    ...(jsonLdDesc ? { description: jsonLdDesc } : {}),
    ...(product.image_url ? { image: product.image_url } : {}),
    brand: { '@type': 'Brand', name: 'MiniYo' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      ...(price ? { price } : {}),
      availability: availabilitySchema,
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  // Escape `<` so a value can never break out of the <script> element.
  const jsonLdStr = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  lines.push(`<script type="application/ld+json">${jsonLdStr}</script>`);

  return lines.map((l) => `    ${l}`).join('\n');
}

// Replace the site-wide social-meta marker region in the index.html template
// with the per-product block. If the markers are missing (shouldn't happen with
// the shipped template), returns the template unchanged so the SPA still loads.
export function injectProductMeta(template, product) {
  const start = template.indexOf(SOCIAL_START);
  const endMarker = template.indexOf(SOCIAL_END);
  if (start === -1 || endMarker === -1) return template;
  const end = endMarker + SOCIAL_END.length;
  const block = buildProductMetaBlock(product);
  return template.slice(0, start) + block + template.slice(end);
}
