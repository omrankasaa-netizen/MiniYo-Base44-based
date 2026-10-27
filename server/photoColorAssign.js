// Gemini-first per-color/pattern photo assignment.
// Admin-only function `photoColorAssign`:
//   { productId }                         → analyze one product, no writes
//   { apply: true, assignments: [...] }   → apply reviewed suggestions
// The browser analyzes products in a small concurrency pool so one slow or
// failed Gemini request cannot block or invalidate the whole catalog report.

import { queryRecords, updateRecord } from './db.js';
import { buildColorSwatches, normalizeColorLabel } from '../src/lib/colorSwatches.js';
import {
  PHOTO_COLOR_RESPONSE_SCHEMA, buildPhotoColorPrompt,
  normalizeAiMatches, planAiAssignments,
} from './photoColorAiCore.js';

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const STORE_BASE_URL = 'https://miniyokids.com';
const FETCH_TIMEOUT_MS = 15_000;
const GEMINI_TIMEOUT_MS = 60_000;
const MAX_IMAGES_PER_PRODUCT = 16;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

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
    if (sw.length < 2) continue;
    // Unlike pixel matching, Gemini can identify print-only variants (hexes: []).
    if (!sw.some((s) => !s.image)) continue;
    swatchesByProduct[p.id] = sw;
    targets.push(p);
  }
  return { targets, variantsByProduct, swatchesByProduct };
}

async function loadSharp() {
  try { return (await import('sharp')).default; } catch { return null; }
}

function absoluteImageUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, STORE_BASE_URL).toString();
}

async function prepareImage(image, sharp) {
  const source = image.variants?.card || image.variants?.large || image.url || image.image_url;
  if (!source) return null;
  try {
    const res = await fetch(absoluteImageUrl(source), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_SOURCE_BYTES) throw new Error('Image too large');
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_SOURCE_BYTES) throw new Error('Image too large');
    const data = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { ...image, data: data.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}

function extractJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

async function callGemini({ images, prompt, apiKey }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
            { text: prompt },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: PHOTO_COLOR_RESPONSE_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `Gemini HTTP ${res.status}`);
      err.geminiStatus = res.status;
      throw err;
    }
    const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return extractJson(text);
  } finally {
    clearTimeout(timer);
  }
}

function safeAnalysisError(error) {
  if (error?.name === 'AbortError') return 'AI analysis timed out. Retry this product.';
  if (error?.geminiStatus === 429) return 'AI rate limit reached. Wait a minute and retry.';
  return 'AI could not analyze this product. Retry or assign its photos manually.';
}

async function analyzeProduct(product, swatches, images, apiKey) {
  const sharp = await loadSharp();
  if (!sharp) return { error: 'Image decoder is unavailable on the server.' };
  const selected = images.slice(0, MAX_IMAGES_PER_PRODUCT);
  const prepared = await Promise.all(selected.map((img) => prepareImage(img, sharp)));
  const readable = prepared.filter(Boolean);
  const imagesFailed = selected.length - readable.length + Math.max(0, images.length - selected.length);
  if (readable.length === 0) {
    return { productId: product.id, imagesAnalyzed: 0, imagesFailed, assignments: [], error: 'No photos could be read.' };
  }
  try {
    const raw = await callGemini({
      images: readable,
      prompt: buildPhotoColorPrompt(product, swatches, readable.length),
      apiKey,
    });
    const rows = normalizeAiMatches(raw, { productId: product.id, images: readable, swatches });
    return {
      productId: product.id,
      imagesAnalyzed: readable.length,
      imagesFailed,
      assignments: planAiAssignments(rows, product),
      model: MODEL(),
    };
  } catch (error) {
    // Do not log the API key, image payloads, or upstream response details.
    console.error('[photoColorAssign] Gemini analysis failed (status %s)', error?.geminiStatus || 'n/a');
    return {
      productId: product.id,
      imagesAnalyzed: readable.length,
      imagesFailed,
      assignments: [],
      error: safeAnalysisError(error),
    };
  }
}

export async function photoColorAssign(body = {}) {
  const { targets, variantsByProduct, swatchesByProduct } = buildContext();

  if (body.apply === true) {
    const assignments = Array.isArray(body.assignments) ? body.assignments.slice(0, 500) : [];
    const images = queryRecords('ProductImage', { limit: 20000 });
    const imageProducts = new Map(images.map((i) => [i.url || i.image_url, i.product_id]));
    let colorsAssigned = 0, variantsUpdated = 0, skipped = 0;
    for (const a of assignments) {
      const swatch = swatchesByProduct[a?.productId]?.find((s) => s.key === a.colorKey);
      // Revalidate ownership and emptiness at write time. Stale review windows
      // and manually assigned colors are skipped, never overwritten.
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { _status: 503, error: 'Gemini analysis is not configured on the server.' };
  const product = targets.find((p) => p.id === body.productId);
  if (!product) return { _status: 404, error: 'Product not found or it has no unassigned colors.' };
  const images = queryRecords('ProductImage', { query: { product_id: product.id }, limit: 100 });
  return analyzeProduct(product, swatchesByProduct[product.id], images, apiKey);
}
