import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createRecord, queryRecords, countRecords, kvGet, kvSet, bulkCreate,
} from './db.js';
import { registerUser, findUserByEmail } from './auth.js';
import { DEFAULT_SHIPPING_ZONES } from './functions.js';
import { LEGAL_SECTIONS, FAQS } from './seedContent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(__dirname, 'data', 'catalog.csv');

const SEED_VERSION = '1';

// Deterministic id from a string so products can reference categories by slug.
function idFromSlug(prefix, slug) {
  const h = crypto.createHash('sha1').update(`${prefix}:${slug}`).digest('hex').slice(0, 24);
  return `${prefix}-${h}`;
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignore
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

function toBool(v) {
  return String(v).trim().toUpperCase() === 'TRUE';
}

// pipe-separated already (size_variations like "0-3M|3-6M|6-9M")
function normPipe(v) {
  return String(v || '').split('|').map((s) => s.trim()).filter(Boolean).join('|');
}

function seedAdmin() {
  const email = 'admin@miniyo.store';
  if (!findUserByEmail(email)) {
    registerUser({
      email,
      password: 'REDACTED_PASSWORD',
      full_name: 'MiniYo Super Admin',
      role: 'super_admin',
    });
  }
}

function seedMembershipSettings() {
  if (queryRecords('MembershipSettings', { limit: 1 }).length > 0) return;
  createRecord('MembershipSettings', {
    bronze_credits: 2, bronze_discount_pct: 5,
    silver_threshold_usd: 100, silver_credits: 4, silver_discount_pct: 10,
    gold_threshold_usd: 250, gold_credits: 6, gold_discount_pct: 15,
    credit_expiry_days: 0,
  });
}

function seedSiteSettings() {
  const existing = queryRecords('SiteSetting', {});
  const have = new Set(existing.map((s) => s.setting_key));
  const defaults = {
    store_name: 'MiniYo',
    currency: 'USD',
    free_shipping_threshold: '50',
    payment_cod_enabled: 'true',
    payment_whish_enabled: 'false',
    payment_card_enabled: 'false',
    default_language: 'en',
    whatsapp_number: '+961 81 38 59 40',
    instagram_url: 'https://instagram.com/miniyo.store.lb',
    facebook_url: 'https://facebook.com/miniyo.store.lb',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!have.has(k)) createRecord('SiteSetting', { setting_key: k, setting_value: v });
  }
}

function seedShippingZones() {
  if (queryRecords('ShippingZone', { limit: 1 }).length > 0) return;
  bulkCreate('ShippingZone', DEFAULT_SHIPPING_ZONES);
}

function seedCatalog() {
  if (countRecords('Product') > 0) return;
  if (!fs.existsSync(CATALOG)) {
    console.warn('[seed] catalog.csv not found, skipping product seed');
    return;
  }
  const rows = parseCsv(fs.readFileSync(CATALOG, 'utf8'));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const get = (r, key) => (idx[key] != null ? r[idx[key]] : '');

  const categories = new Map(); // slug -> {id, name, name_ar, parent_id, sort_order}
  let catSort = 0;

  function ensureCategory(name, nameAr, parentSlug) {
    const slug = slugify(name);
    if (!slug) return null;
    if (!categories.has(slug)) {
      categories.set(slug, {
        id: idFromSlug('cat', slug),
        slug,
        name,
        name_ar: nameAr || name,
        parent_id: parentSlug ? idFromSlug('cat', parentSlug) : null,
        is_active: true,
        sort_order: catSort++,
        source: 'seed', // marks demo data so the bulk-import cleanup can remove it
      });
    }
    return categories.get(slug);
  }

  const products = [];
  const variants = [];
  const images = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = get(r, 'product_name');
    if (!name) continue;
    const categoryName = get(r, 'category');
    const subName = get(r, 'subcategory');
    const cat = ensureCategory(categoryName, '', null);
    const sub = subName ? ensureCategory(subName, '', categoryName) : null;

    const sizes = normPipe(get(r, 'size_variations'));
    const colors = normPipe(get(r, 'color_variations'));
    const hasVariants = sizes.split('|').filter(Boolean).length > 1 || colors.split('|').filter(Boolean).length > 1;
    const price = parseFloat(get(r, 'selling_price_usd')) || 0;
    const compareRaw = get(r, 'compare_at_price_usd');
    const stockQty = parseInt(get(r, 'stock_qty'), 10);
    const slug = slugify(get(r, 'handle') || name) || idFromSlug('p', name);
    const productId = idFromSlug('prod', slug);
    const imageUrl = get(r, 'image_url');

    products.push({
      id: productId,
      slug,
      sku: `MNY-${slug}`.toUpperCase().slice(0, 32),
      name,
      name_ar: get(r, 'product_name_ar') || name,
      description: get(r, 'description'),
      description_ar: get(r, 'description_ar'),
      short_description: get(r, 'short_description'),
      short_description_ar: get(r, 'short_description_ar'),
      category_id: cat ? cat.id : null,
      subcategory_id: sub ? sub.id : null,
      age_group: get(r, 'age_group'),
      gender: get(r, 'gender'),
      sizes,
      colors,
      price_usd: price,
      compare_at_price_usd: compareRaw ? parseFloat(compareRaw) || null : null,
      currency: get(r, 'currency') || 'USD',
      stock_quantity: Number.isFinite(stockQty) ? stockQty : 0,
      has_variants: hasVariants,
      is_new: toBool(get(r, 'is_new')),
      is_featured: toBool(get(r, 'is_featured')),
      tags: get(r, 'tags'),
      status: (get(r, 'status') || 'Active'),
      image_url: imageUrl,
      source: 'seed', // marks demo data so the bulk-import cleanup can remove it
    });

    if (imageUrl) {
      images.push({
        product_id: productId,
        url: imageUrl,
        image_url: imageUrl,
        alt: get(r, 'image_alt') || name,
        sort_order: 0,
      });
    }

    if (hasVariants) {
      const sizeList = sizes.split('|').filter(Boolean);
      const colorList = colors.split('|').filter(Boolean);
      const sList = sizeList.length ? sizeList : [''];
      const cList = colorList.length ? colorList : [''];
      const perVariant = Math.max(0, Math.floor((Number.isFinite(stockQty) ? stockQty : 0) / (sList.length * cList.length)) || 0);
      for (const s of sList) {
        for (const c of cList) {
          variants.push({
            product_id: productId,
            size: s || null,
            color: c || null,
            variant_sku: `${productId}-${s || 'NA'}-${c || 'NA'}`.replace(/\s+/g, ''),
            qty_on_hand: perVariant,
            qty_reserved: 0,
          });
        }
      }
    }
  }

  bulkCreate('Category', [...categories.values()]);
  bulkCreate('Product', products);
  if (variants.length) bulkCreate('ProductVariant', variants);
  if (images.length) bulkCreate('ProductImage', images);
  console.log(`[seed] catalog: ${categories.size} categories, ${products.length} products, ${variants.length} variants`);
}

// Create the storefront legal/about CmsSection rows if they are missing, so the
// public Legal/About pages are backed by editable DB content (the pages also have
// hard-coded fallback copy, but seeding makes the copy editable from the admin CMS).
// Each row is created only when no CmsSection with that section_key already exists,
// so an admin's later edits are never overwritten.
function seedLegalPages() {
  for (const s of LEGAL_SECTIONS) {
    const existing = queryRecords('CmsSection', { query: { section_key: s.section_key }, limit: 1 });
    if (existing.length > 0) continue;
    createRecord('CmsSection', { ...s, is_active: true, sort_order: 0 });
  }
}

// Seed the storefront FAQ list when no Faq rows exist yet. The FAQ page has no
// hard-coded fallback, so without this the page renders empty on a fresh install.
function seedFaqs() {
  if (countRecords('Faq') > 0) return;
  bulkCreate('Faq', FAQS.map((f, i) => ({ ...f, is_active: true, sort_order: i })));
}

export function runSeed() {
  const fresh = kvGet('seed_version') !== SEED_VERSION;
  // Idempotent seeders run every boot so missing admin/settings/content is
  // backfilled even on existing databases.
  seedAdmin();
  seedMembershipSettings();
  seedSiteSettings();
  seedShippingZones();
  seedLegalPages();
  seedFaqs();
  if (fresh) {
    seedCatalog();
    kvSet('seed_version', SEED_VERSION);
    console.log('[seed] complete');
  }
}
