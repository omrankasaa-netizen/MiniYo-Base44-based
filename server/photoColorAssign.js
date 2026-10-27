// Automatic per-color photo assignment (Level 1: dominant-color matching).
// Admin-only function `photoColorAssign`:
//   { }                                  → dry-run report + suggested assignments
//   { apply: true, assignments: [...] }  → apply the reviewed assignments
// Only products with 2+ distinct colors are analyzed. Each photo is decoded
// to a 48px RGB bitmap, matched against the product's OWN color swatches
// (pure logic in src/lib/photoColor.js), and the best photo per color is
// suggested. Applying writes ProductVariant.image_url ONLY on variants whose
// color matches and that have no image yet — manual assignments always win,
// and re-running is idempotent.

import { queryRecords, updateRecord } from './db.js';
import { buildColorSwatches, normalizeColorLabel } from '../src/lib/colorSwatches.js';
import { extractPalette, matchPaletteToSwatches, planAssignments } from '../src/lib/photoColor.js';

const FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;

async function loadSharp() {
  try { return (await import('sharp')).default; } catch { return null; }
}

export async function analyzeImage(image, swatches, sharp) {
  const url = image.variants?.thumb || image.variants?.card || image.url || image.image_url;
  if (!url) return { suggestion: null, failed: false };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buffer, { failOn: 'none' })
      .resize(48, 48, { fit: 'fill' })
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const palette = extractPalette({ data, width: info.width, height: info.height });
    return { suggestion: matchPaletteToSwatches(palette, swatches), failed: false };
  } catch {
    return { suggestion: null, failed: true };
  }
}

function buildContext() {
  const products = queryRecords('Product', { query: { status: 'Active' }, limit: 1000 });
  const variants = queryRecords('ProductVariant', { limit: 10000 });
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);
  const swatchesByProduct = {};
  const targets = [];
  for (const p of products) {
    const pvs = variantsByProduct[p.id] || [];
    const sw = buildColorSwatches(p, pvs);
    if (sw.length < 2) continue; // single-color products need no assignment
    if (!sw.some((s) => !s.image && s.hexes.length > 0)) continue; // nothing to assign
    swatchesByProduct[p.id] = sw;
    targets.push(p);
  }
  return { targets, variantsByProduct, swatchesByProduct };
}

export async function photoColorAssign(body = {}) {
  const apply = body.apply === true;
  const { targets, variantsByProduct, swatchesByProduct } = buildContext();

  if (apply) {
    const assignments = Array.isArray(body.assignments) ? body.assignments.slice(0, 500) : [];
    const images = queryRecords('ProductImage', { limit: 20000 });
    const imageProducts = new Map(images.map((i) => [i.url || i.image_url, i.product_id]));
    let colorsAssigned = 0, variantsUpdated = 0, skipped = 0;
    for (const a of assignments) {
      const swatches = swatchesByProduct[a?.productId];
      const swatch = swatches?.find((s) => s.key === a.colorKey);
      // Re-validate server-side: known product+color, color still photoless,
      // and the photo really belongs to that product. Anything else is skipped.
      if (!swatch || swatch.image || typeof a.imageUrl !== 'string'
          || imageProducts.get(a.imageUrl) !== a.productId) { skipped++; continue; }
      const pvs = (variantsByProduct[a.productId] || []).filter((v) =>
        String(v.color || '').trim()
        && (normalizeColorLabel(v.color) || String(v.color).toLowerCase()) === a.colorKey
        && !v.image_url);
      if (pvs.length === 0) { skipped++; continue; }
      for (const v of pvs) updateRecord('ProductVariant', v.id, { image_url: a.imageUrl });
      variantsUpdated += pvs.length;
      colorsAssigned++;
    }
    return { ok: true, colorsAssigned, variantsUpdated, skipped };
  }

  // Dry run: analyze every gallery image of every multi-color target product.
  const allImages = queryRecords('ProductImage', { limit: 20000 });
  const imagesByProduct = {};
  for (const img of allImages) (imagesByProduct[img.product_id] ||= []).push(img);
  const queue = [];
  for (const p of targets) {
    for (const img of imagesByProduct[p.id] || []) queue.push({ product: p, image: img });
  }

  const sharp = await loadSharp();
  if (!sharp) return { _status: 500, error: 'Image decoder (sharp) unavailable on the server' };

  const rows = [];
  let imagesFailed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const { product, image } = queue[cursor++];
      const { suggestion, failed } = await analyzeImage(image, swatchesByProduct[product.id], sharp);
      if (failed) { imagesFailed++; continue; }
      rows.push({ productId: product.id, imageUrl: image.url || image.image_url, suggestion });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const productNames = Object.fromEntries(targets.map((p) => [p.id, p.name]));
  const assignments = planAssignments(rows, swatchesByProduct)
    .map((a) => ({ ...a, productName: productNames[a.productId] || a.productId }));
  const unmatchedColors = Object.values(swatchesByProduct)
    .flat().filter((s) => !s.image && s.hexes.length > 0).length - assignments.length;
  return {
    productsAnalyzed: targets.length,
    imagesAnalyzed: rows.length,
    imagesFailed,
    unmatchedColors,
    assignments,
  };
}
