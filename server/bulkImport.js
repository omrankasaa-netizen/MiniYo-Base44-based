// Bulk product import: parse an Excel/CSV sheet (+ optional images zip) into
// Product / ProductVariant / ProductImage records, with a dry-run preview and a
// seed-only cleanup. Matches the schema produced by server/seed.js exactly:
//   Product:        slug, sku, name, name_ar, description, description_ar,
//                   short_description, short_description_ar, category_id,
//                   subcategory_id, age_group, gender, sizes, colors, price_usd,
//                   compare_at_price_usd, cost_usd, currency, stock_quantity,
//                   has_variants, is_new, is_featured, is_trending, tags, status,
//                   video_url, image_url
//   ProductVariant: product_id, size, color, variant_sku, qty_on_hand, qty_reserved
//   ProductImage:   product_id, url, image_url, is_primary, sort_order, alt,
//                   alt_ar, focal:null, crop:null
//
// CONSERVATIVE BY DESIGN: rows are matched to existing products by `sku`
// (fallback `slug`/`handle`). When a product already exists it is UPDATED in
// place — never duplicated. The images column being BLANK leaves existing photos
// untouched so manually-adjusted images survive a re-import. Variants are
// updated/added by default and only removed when removeMissingVariants is set.
import path from 'node:path';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import {
  createRecord, updateRecord, deleteRecord, queryRecords, nowIso,
} from './db.js';
import { optimizeAndStore, bufferFromBase64 } from './imageOptimize.js';

// Canonical sheet columns (header row). Documented in docs/bulk-import/README.md.
export const SHEET_COLUMNS = [
  'sku', 'handle', 'name_en', 'name_ar', 'description_en', 'description_ar',
  'short_description_en', 'short_description_ar', 'category', 'subcategory',
  'gender', 'age_group', 'price', 'compare_at_price', 'cost',
  'is_new', 'is_trending', 'is_featured', 'is_active',
  'video_url', 'tags', 'sizes', 'images',
];

const VALID_GENDERS = ['Girls', 'Boys', 'Unisex'];
const VALID_AGES = ['Newborn', 'Baby', 'Toddler', 'Kids'];

// ── small parsing helpers ───────────────────────────────────────────────────
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function cleanStr(v) {
  return v == null ? '' : String(v).trim();
}

// Accept true/false, 1/0, yes/no, y/n (case-insensitive). Blank -> default.
function parseBool(v, dflt = false) {
  const s = cleanStr(v).toLowerCase();
  if (s === '') return dflt;
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return dflt;
}

// Whole/decimal USD. Returns null for blank, NaN sentinel for invalid.
function parseMoney(v) {
  const s = cleanStr(v);
  if (s === '') return null;
  const n = Number(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

// "0-3M:5, 3-6M:8, 6-9M:3" OR with color "Pink|0-3M:5, Blue|3-6M:2".
// Returns { variants:[{size,color,stock}], totalStock, sizesPipe, colorsPipe, errors:[] }.
function parseSizes(raw) {
  const out = { variants: [], totalStock: 0, sizesPipe: '', colorsPipe: '', errors: [] };
  const s = cleanStr(raw);
  if (s === '') return out;
  const sizeSet = [];
  const colorSet = [];
  for (const partRaw of s.split(/[,;]+/)) {
    const part = partRaw.trim();
    if (!part) continue;
    const colonIdx = part.lastIndexOf(':');
    if (colonIdx === -1) {
      out.errors.push(`size entry "${part}" must use the form size:stock (e.g. 0-3M:5)`);
      continue;
    }
    let key = part.slice(0, colonIdx).trim();
    const stockStr = part.slice(colonIdx + 1).trim();
    const stock = Number(stockStr);
    if (!key) { out.errors.push(`size entry "${part}" is missing a size`); continue; }
    if (!Number.isFinite(stock) || stock < 0) {
      out.errors.push(`stock for "${key}" must be a non-negative number (got "${stockStr}")`);
      continue;
    }
    let color = null;
    let size = key;
    if (key.includes('|')) {
      const [c, sz] = key.split('|');
      color = c.trim() || null;
      size = (sz || '').trim();
    }
    if (color && !colorSet.includes(color)) colorSet.push(color);
    if (size && !sizeSet.includes(size)) sizeSet.push(size);
    out.variants.push({ size: size || null, color, stock: Math.floor(stock) });
    out.totalStock += Math.floor(stock);
  }
  out.sizesPipe = sizeSet.join('|');
  out.colorsPipe = colorSet.join('|');
  return out;
}

// images column -> { files:[...zip filenames], urls:[...http urls] }
function parseImages(raw) {
  const files = [];
  const urls = [];
  for (const partRaw of cleanStr(raw).split(/[,]+/)) {
    const part = partRaw.trim();
    if (!part) continue;
    if (/^https?:\/\//i.test(part)) urls.push(part);
    else files.push(part);
  }
  return { files, urls };
}

// ── sheet reading ───────────────────────────────────────────────────────────
// Reads xlsx OR csv from a base64 payload. Returns array of plain row objects
// keyed by the (trimmed, lowercased) header cells. Empty rows are dropped.
function readSheet({ base64, filename }) {
  const buf = bufferFromBase64(base64);
  const isCsv = /\.csv$/i.test(filename || '');
  const wb = XLSX.read(buf, { type: 'buffer', raw: false, ...(isCsv ? { codepage: 65001 } : {}) });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) return [];
  const header = rows[0].map((h) => cleanStr(h).toLowerCase());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => cleanStr(c) === '')) continue;
    const obj = {};
    header.forEach((h, idx) => { if (h) obj[h] = r[idx] != null ? r[idx] : ''; });
    obj.__rowNumber = i + 1; // 1-based incl. header for human-friendly errors
    records.push(obj);
  }
  return records;
}

// Build a lowercase name/slug -> category record index.
function categoryIndex() {
  const cats = queryRecords('Category', {});
  const byName = new Map();
  const bySlug = new Map();
  for (const c of cats) {
    if (c.name) byName.set(String(c.name).toLowerCase(), c);
    if (c.slug) bySlug.set(String(c.slug).toLowerCase(), c);
  }
  return { cats, byName, bySlug };
}

function findCategory(idx, value) {
  const v = cleanStr(value).toLowerCase();
  if (!v) return null;
  return idx.byName.get(v) || idx.bySlug.get(v) || idx.bySlug.get(slugify(value)) || null;
}

// Existing-product index by sku and slug (both lowercased).
function productIndex() {
  const products = queryRecords('Product', {});
  const bySku = new Map();
  const bySlug = new Map();
  for (const p of products) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), p);
    if (p.slug) bySlug.set(String(p.slug).toLowerCase(), p);
  }
  return { bySku, bySlug };
}

// Validate + normalize a single sheet row into an intermediate shape.
// Pure: never writes. Returns { ok, row:<normalized>, errors:[], warnings:[] }.
function normalizeRow(raw, ctx) {
  const errors = [];
  const warnings = [];
  const rowNumber = raw.__rowNumber;

  const sku = cleanStr(raw.sku);
  if (!sku) errors.push('sku is required (it is the stable key used to match/update products)');

  const name = cleanStr(raw.name_en) || cleanStr(raw.name_ar);
  if (!name) errors.push('name_en (or at least name_ar) is required');

  const price = parseMoney(raw.price);
  if (price === null) errors.push('price is required');
  else if (Number.isNaN(price)) errors.push(`price must be a number (got "${cleanStr(raw.price)}")`);

  const compareAt = parseMoney(raw.compare_at_price);
  if (Number.isNaN(compareAt)) errors.push(`compare_at_price must be a number (got "${cleanStr(raw.compare_at_price)}")`);

  const cost = parseMoney(raw.cost);
  if (Number.isNaN(cost)) errors.push(`cost must be a number (got "${cleanStr(raw.cost)}")`);

  const gender = cleanStr(raw.gender);
  if (gender && !VALID_GENDERS.includes(gender)) warnings.push(`gender "${gender}" is not one of ${VALID_GENDERS.join('/')} — stored as-is`);
  const ageGroup = cleanStr(raw.age_group);
  if (ageGroup && !VALID_AGES.includes(ageGroup)) warnings.push(`age_group "${ageGroup}" is not one of ${VALID_AGES.join('/')} — stored as-is`);

  // Category: match by name/slug. Unknown -> flag (creation handled at commit).
  const categoryName = cleanStr(raw.category);
  let category = findCategory(ctx.categoryIdx, categoryName);
  let createCategory = null;
  if (categoryName && !category) {
    createCategory = categoryName;
    warnings.push(`category "${categoryName}" does not exist yet — it will be created`);
  }
  const subName = cleanStr(raw.subcategory);
  let subcategory = findCategory(ctx.categoryIdx, subName);
  let createSubcategory = null;
  if (subName && !subcategory) {
    createSubcategory = subName;
    warnings.push(`subcategory "${subName}" does not exist yet — it will be created`);
  }

  const sizeParsed = parseSizes(raw.sizes);
  for (const e of sizeParsed.errors) errors.push(e);

  const imgParsed = parseImages(raw.images);
  const imagesProvided = (raw.images != null && cleanStr(raw.images) !== '');
  // Verify referenced zip files exist (only matters at commit; warn in dry-run).
  const missingFiles = [];
  if (ctx.zipFiles) {
    for (const f of imgParsed.files) {
      if (!ctx.zipFiles.has(f)) missingFiles.push(f);
    }
  } else if (imgParsed.files.length) {
    warnings.push(`row references ${imgParsed.files.length} image file(s) but no images zip was uploaded — those images will be skipped`);
  }
  for (const f of missingFiles) errors.push(`image file "${f}" was not found in the uploaded zip`);

  const slug = slugify(raw.handle) || slugify(name) || slugify(sku);

  // Match against existing products (upsert decision).
  const existing = (sku && ctx.productIdx.bySku.get(sku.toLowerCase()))
    || (slug && ctx.productIdx.bySlug.get(slug.toLowerCase()))
    || null;

  const hasVariants = sizeParsed.variants.length > 0;

  const normalized = {
    rowNumber,
    sku,
    slug,
    name,
    existingId: existing ? existing.id : null,
    action: existing ? 'update' : 'create',
    fields: {
      slug,
      sku,
      name,
      name_ar: cleanStr(raw.name_ar),
      description: cleanStr(raw.description_en),
      description_ar: cleanStr(raw.description_ar),
      short_description: cleanStr(raw.short_description_en),
      short_description_ar: cleanStr(raw.short_description_ar),
      gender: gender || null,
      age_group: ageGroup || null,
      price_usd: price === null ? 0 : price,
      compare_at_price_usd: compareAt === null || Number.isNaN(compareAt) ? null : compareAt,
      cost_usd: cost === null || Number.isNaN(cost) ? null : cost,
      currency: 'USD',
      sizes: sizeParsed.sizesPipe,
      colors: sizeParsed.colorsPipe,
      has_variants: hasVariants,
      stock_quantity: hasVariants ? 0 : 0,
      is_new: parseBool(raw.is_new, false),
      is_trending: parseBool(raw.is_trending, false),
      is_featured: parseBool(raw.is_featured, false),
      status: parseBool(raw.is_active, true) ? 'Active' : 'Hidden',
      video_url: cleanStr(raw.video_url) || null,
      tags: cleanStr(raw.tags),
    },
    variants: sizeParsed.variants,
    images: { files: imgParsed.files, urls: imgParsed.urls, provided: imagesProvided },
    categoryName,
    subName,
    category,
    subcategory,
    createCategory,
    createSubcategory,
  };

  return { ok: errors.length === 0, row: normalized, errors, warnings };
}

// Optimize a zip image entry (sharp → WebP derivatives) and store it via the
// active backend (R2 or local disk). Returns { url, variants } where `url` is
// the canonical/card derivative. Reuses the SAME pipeline as /api/upload so
// batch imports also get R2 + optimization.
async function writeZipImage(zipEntry) {
  const result = await optimizeAndStore(zipEntry.getData(), path.basename(zipEntry.entryName));
  return { url: result.url, variants: result.variants };
}

// Replace a product's ProductImage rows from the row's images (files + urls).
async function reconcileImages(productId, productName, productNameAr, normalized, zipMap) {
  // Remove existing images for this product, then recreate from the sheet.
  const existing = queryRecords('ProductImage', { query: { product_id: productId } });
  for (const img of existing) deleteRecord('ProductImage', img.id);

  let sort = 0;
  let primaryUrl = null;
  const created = [];
  // Files first (in listed order), then explicit URLs.
  for (const f of normalized.images.files) {
    const entry = zipMap.get(f);
    if (!entry) continue; // validated already; defensive
    const { url, variants } = await writeZipImage(entry);
    const isPrimary = sort === 0;
    if (isPrimary) primaryUrl = url;
    created.push(createRecord('ProductImage', {
      product_id: productId, url, image_url: url, variants: variants || null,
      is_primary: isPrimary,
      sort_order: sort, alt: productName, alt_ar: productNameAr, focal: null, crop: null,
    }));
    sort += 1;
  }
  // Explicit http(s) URLs from the sheet are referenced as-is (no derivatives);
  // the frontend falls back to the single URL when no variants are present.
  for (const url of normalized.images.urls) {
    const isPrimary = sort === 0;
    if (isPrimary) primaryUrl = url;
    created.push(createRecord('ProductImage', {
      product_id: productId, url, image_url: url, variants: null, is_primary: isPrimary,
      sort_order: sort, alt: productName, alt_ar: productNameAr, focal: null, crop: null,
    }));
    sort += 1;
  }
  return { count: created.length, primaryUrl };
}

// Update/add variant rows from the parsed sizes; optionally remove ones not in
// the sheet. Matches variants by (size,color).
function reconcileVariants(productId, sku, variants, removeMissing) {
  const existing = queryRecords('ProductVariant', { query: { product_id: productId } });
  const keyOf = (v) => `${cleanStr(v.size).toLowerCase()}|${cleanStr(v.color).toLowerCase()}`;
  const existingByKey = new Map(existing.map((v) => [keyOf(v), v]));
  const seen = new Set();
  let added = 0;
  let updated = 0;

  for (const v of variants) {
    const key = `${cleanStr(v.size).toLowerCase()}|${cleanStr(v.color).toLowerCase()}`;
    seen.add(key);
    const found = existingByKey.get(key);
    if (found) {
      updateRecord('ProductVariant', found.id, { qty_on_hand: v.stock });
      updated += 1;
    } else {
      const variantSku = `${sku || 'VAR'}-${[v.size, v.color].filter(Boolean).join('-') || 'NA'}`
        .replace(/\s+/g, '').toUpperCase();
      createRecord('ProductVariant', {
        product_id: productId, size: v.size || null, color: v.color || null,
        variant_sku: variantSku, qty_on_hand: v.stock, qty_reserved: 0,
      });
      added += 1;
    }
  }

  let removed = 0;
  if (removeMissing) {
    for (const v of existing) {
      if (!seen.has(keyOf(v))) { deleteRecord('ProductVariant', v.id); removed += 1; }
    }
  }
  return { added, updated, removed };
}

// Create the categories a set of normalized rows asked for, then re-resolve.
function ensureCategories(normalizedRows, categoryIdx) {
  const wanted = new Map(); // slug -> {name, parentName}
  for (const n of normalizedRows) {
    if (n.createCategory) wanted.set(slugify(n.createCategory), { name: n.createCategory, parentName: null });
  }
  // Subcategories after parents so parent_id can be linked.
  for (const n of normalizedRows) {
    if (n.createSubcategory) wanted.set(slugify(n.createSubcategory), { name: n.createSubcategory, parentName: n.categoryName || null });
  }
  let sortBase = (categoryIdx.cats.length || 0);
  for (const [slug, info] of wanted) {
    if (categoryIdx.bySlug.has(slug)) continue;
    const parent = info.parentName ? findCategory(categoryIdx, info.parentName) : null;
    const rec = createRecord('Category', {
      slug, name: info.name, name_ar: info.name,
      parent_id: parent ? parent.id : null, is_active: true, sort_order: sortBase++,
    });
    categoryIdx.bySlug.set(slug, rec);
    categoryIdx.byName.set(String(info.name).toLowerCase(), rec);
    categoryIdx.cats.push(rec);
  }
}

// ── public entry: import (handles dry-run + commit) ─────────────────────────
// payload: {
//   spreadsheet: { base64, filename },
//   imagesZip?:  { base64, filename },
//   dryRun?: boolean,
//   removeMissingVariants?: boolean,
//   createCategories?: boolean (default true),
// }
export async function bulkImportProducts(payload = {}) {
  const dryRun = !!payload.dryRun;
  const createCategoriesFlag = payload.createCategories !== false;
  const removeMissingVariants = !!payload.removeMissingVariants;

  if (!payload.spreadsheet || !payload.spreadsheet.base64) {
    return { _status: 400, error: 'spreadsheet file (base64) is required' };
  }

  let rows;
  try {
    rows = readSheet(payload.spreadsheet);
  } catch (e) {
    return { _status: 400, error: `Could not parse spreadsheet: ${e.message}` };
  }
  if (!rows.length) {
    return { _status: 400, error: 'The spreadsheet has no data rows (only a header, or empty).' };
  }

  // Load the optional images zip into an in-memory name -> entry map.
  let zip = null;
  let zipMap = new Map();
  let zipFiles = null;
  if (payload.imagesZip && payload.imagesZip.base64) {
    try {
      zip = new AdmZip(bufferFromBase64(payload.imagesZip.base64));
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        // Index by both the full entry path and the bare basename so the sheet
        // can reference "SKU_1.jpg" even if the zip nests it in a folder.
        zipMap.set(entry.entryName, entry);
        zipMap.set(path.basename(entry.entryName), entry);
      }
      zipFiles = new Set(zipMap.keys());
    } catch (e) {
      return { _status: 400, error: `Could not read images zip: ${e.message}` };
    }
  }

  const categoryIdx = categoryIndex();
  const productIdx = productIndex();
  const ctx = { categoryIdx, productIdx, zipFiles };

  const results = [];
  const normalizedOk = [];
  let toCreate = 0;
  let toUpdate = 0;
  let errorRows = 0;

  // Detect duplicate SKUs within the sheet itself.
  const skuSeen = new Map();

  for (const raw of rows) {
    const { ok, row, errors, warnings } = normalizeRow(raw, ctx);
    if (row.sku) {
      const k = row.sku.toLowerCase();
      if (skuSeen.has(k)) {
        errors.push(`duplicate sku "${row.sku}" — also on row ${skuSeen.get(k)}; only the first is used`);
      } else {
        skuSeen.set(k, row.rowNumber);
      }
    }
    const rowOk = ok && errors.length === 0;
    results.push({
      rowNumber: row.rowNumber,
      sku: row.sku,
      name: row.name,
      action: rowOk ? row.action : 'skip',
      errors,
      warnings,
    });
    if (rowOk) {
      normalizedOk.push(row);
      if (row.action === 'create') toCreate += 1; else toUpdate += 1;
    } else {
      errorRows += 1;
    }
  }

  const summary = {
    totalRows: rows.length,
    toCreate,
    toUpdate,
    errorRows,
    imagesZipProvided: !!zip,
    dryRun,
  };

  if (dryRun) {
    return { ok: true, summary, results };
  }

  // ── COMMIT ────────────────────────────────────────────────────────────────
  if (createCategoriesFlag) ensureCategories(normalizedOk, categoryIdx);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const commitResults = [];

  for (const n of normalizedOk) {
    try {
      const category = n.category || findCategory(categoryIdx, n.categoryName);
      const subcategory = n.subcategory || findCategory(categoryIdx, n.subName);
      const fields = {
        ...n.fields,
        category_id: category ? category.id : null,
        subcategory_id: subcategory ? subcategory.id : null,
      };

      let productId;
      if (n.existingId) {
        updateRecord('Product', n.existingId, fields);
        productId = n.existingId;
      } else {
        const rec = createRecord('Product', fields);
        productId = rec.id;
      }

      // Variants: update/add (+ optional removal).
      const variantStats = reconcileVariants(productId, n.fields.sku, n.variants, removeMissingVariants);

      // Images: only touch when the column was provided. Blank => preserve.
      let imageStats = { count: 0, primaryUrl: null, skipped: true };
      if (n.images.provided) {
        const r = await reconcileImages(productId, n.fields.name, n.fields.name_ar, n, zipMap);
        imageStats = { ...r, skipped: false };
        // Keep the legacy product.image_url in sync with the new primary.
        if (r.primaryUrl) updateRecord('Product', productId, { image_url: r.primaryUrl });
      }

      if (n.existingId) updated += 1; else created += 1;
      commitResults.push({
        rowNumber: n.rowNumber, sku: n.sku, name: n.name,
        action: n.existingId ? 'updated' : 'created', productId,
        variants: variantStats, images: imageStats,
      });
    } catch (e) {
      failed += 1;
      commitResults.push({ rowNumber: n.rowNumber, sku: n.sku, name: n.name, action: 'failed', error: e.message });
    }
  }

  return {
    ok: true,
    summary: { ...summary, created, updated, failed },
    results,
    commitResults,
  };
}

// ── public entry: cleanup seeded demo products ──────────────────────────────
// Deletes ONLY products tagged source==='seed' (added by server/seed.js), plus
// their ProductVariant and ProductImage children. Idempotent; never touches a
// product without the marker. Optional dryRun reports the count first.
export function cleanupSeedProducts(payload = {}) {
  const dryRun = !!payload.dryRun;
  const seedProducts = queryRecords('Product', { query: { source: 'seed' } });
  const ids = seedProducts.map((p) => p.id);

  // Children to remove for those products.
  let variantCount = 0;
  let imageCount = 0;
  for (const id of ids) {
    variantCount += queryRecords('ProductVariant', { query: { product_id: id } }).length;
    imageCount += queryRecords('ProductImage', { query: { product_id: id } }).length;
  }

  // Seeded categories (also marked source:'seed') — only delete those NOT
  // referenced by any surviving (non-seed) product, so manual products keep
  // their categories.
  const seedCategories = dryRun ? [] : queryRecords('Category', { query: { source: 'seed' } });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      productsToDelete: ids.length,
      variantsToDelete: variantCount,
      imagesToDelete: imageCount,
    };
  }

  for (const id of ids) {
    for (const v of queryRecords('ProductVariant', { query: { product_id: id } })) {
      deleteRecord('ProductVariant', v.id);
    }
    for (const img of queryRecords('ProductImage', { query: { product_id: id } })) {
      deleteRecord('ProductImage', img.id);
    }
    deleteRecord('Product', id);
  }

  // Remove seed categories no longer used by any remaining product.
  let categoriesDeleted = 0;
  const remaining = queryRecords('Product', {});
  const usedCatIds = new Set();
  for (const p of remaining) {
    if (p.category_id) usedCatIds.add(p.category_id);
    if (p.subcategory_id) usedCatIds.add(p.subcategory_id);
  }
  for (const c of seedCategories) {
    if (!usedCatIds.has(c.id)) { deleteRecord('Category', c.id); categoriesDeleted += 1; }
  }

  return {
    ok: true,
    productsDeleted: ids.length,
    variantsDeleted: variantCount,
    imagesDeleted: imageCount,
    categoriesDeleted,
  };
}
