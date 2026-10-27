import { base44 } from '@/api/base44Client';
import { buildColorSwatches, normalizeColorLabel } from '@/lib/colorSwatches';
import { extractPalette, matchPaletteToSwatches, planAssignments } from '@/lib/photoColor';

const CONCURRENCY = 4;

async function loadCatalog() {
  const [products, variants, images] = await Promise.all([
    base44.entities.Product.filter({ status: 'Active' }, '-created_date', 1000),
    base44.entities.ProductVariant.list('-created_date', 10000),
    base44.entities.ProductImage.list('-created_date', 20000),
  ]);
  return { products, variants, images };
}

function contextFromCatalog({ products, variants }) {
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);
  const swatchesByProduct = {};
  const targets = [];
  for (const p of products) {
    const swatches = buildColorSwatches(p, variantsByProduct[p.id] || []);
    if (swatches.length < 2) continue;
    if (!swatches.some((s) => !s.image && s.hexes.length > 0)) continue;
    targets.push(p);
    swatchesByProduct[p.id] = swatches;
  }
  return { targets, variantsByProduct, swatchesByProduct };
}

async function analyzeImage(image, swatches) {
  const url = image.variants?.thumb || image.variants?.card || image.url || image.image_url;
  if (!url) return { suggestion: null, failed: false };
  let bitmap;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 48, 48);
    const rgba = ctx.getImageData(0, 0, 48, 48).data;
    const data = new Uint8Array(48 * 48 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      data[j] = rgba[i]; data[j + 1] = rgba[i + 1]; data[j + 2] = rgba[i + 2];
    }
    const palette = extractPalette({ data, width: 48, height: 48 });
    return { suggestion: matchPaletteToSwatches(palette, swatches), failed: false };
  } catch {
    return { suggestion: null, failed: true };
  } finally {
    bitmap?.close();
  }
}

export async function analyzePhotoColors() {
  const catalog = await loadCatalog();
  const { targets, swatchesByProduct } = contextFromCatalog(catalog);
  const imagesByProduct = {};
  for (const img of catalog.images) (imagesByProduct[img.product_id] ||= []).push(img);
  const queue = [];
  for (const p of targets) {
    for (const img of imagesByProduct[p.id] || []) queue.push({ product: p, image: img });
  }

  const rows = [];
  let imagesFailed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const { product, image } = queue[cursor++];
      const { suggestion, failed } = await analyzeImage(image, swatchesByProduct[product.id]);
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

export async function applyPhotoColors(assignments) {
  // Re-read immediately before writing. The review may have been open while
  // someone edited variants, so stale/manual-assigned colors are skipped.
  const catalog = await loadCatalog();
  const { variantsByProduct, swatchesByProduct } = contextFromCatalog(catalog);
  const imageProducts = new Map(catalog.images.map((i) => [i.url || i.image_url, i.product_id]));
  let colorsAssigned = 0, variantsUpdated = 0, skipped = 0;

  for (const a of assignments.slice(0, 500)) {
    const swatch = swatchesByProduct[a.productId]?.find((s) => s.key === a.colorKey);
    if (!swatch || swatch.image || imageProducts.get(a.imageUrl) !== a.productId) { skipped++; continue; }
    const targets = (variantsByProduct[a.productId] || []).filter((v) =>
      String(v.color || '').trim()
      && (normalizeColorLabel(v.color) || String(v.color).toLowerCase()) === a.colorKey
      && !v.image_url);
    if (targets.length === 0) { skipped++; continue; }
    for (const v of targets) await base44.entities.ProductVariant.update(v.id, { image_url: a.imageUrl });
    variantsUpdated += targets.length;
    colorsAssigned++;
  }
  return { ok: true, colorsAssigned, variantsUpdated, skipped };
}
