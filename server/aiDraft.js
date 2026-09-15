// Network + handler half of the "Add by Photos" feature. The pure prompt /
// normalization / SKU logic lives in server/aiDraftCore.js (unit-tested).
//
//   POST /api/functions/aiProductDraft   (admin-gated via GUARDS in functions.js)
//   body: { images: [{ data: <base64>, mime_type: 'image/jpeg' }, …] }  (max 8)
//   → { drafts: [{ index, draft, issues } | { index, error }] }
//
// The endpoint NEVER writes to the catalog — it only returns drafts. Products
// are created later, one by one, after the operator reviews/edits each card
// and fills price/cost/stock. Created products are always status 'Hidden'.
//
// Security/cost notes:
// - Admin-gated (GUARDS registry) so the Gemini quota cannot be burned by the
//   public. Batch-capped at MAX_IMAGES_PER_CALL.
// - The API key is read from env at call time and NEVER logged or returned.
// - Gemini errors are mapped to safe, operator-readable messages.

import { queryRecords } from './db.js';
import {
  buildDraftPrompt, DRAFT_RESPONSE_SCHEMA, extractJson, normalizeDraft,
  sanitizeSku, ensureUniqueSku,
} from './aiDraftCore.js';

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MAX_IMAGES_PER_CALL = 8;
const GEMINI_TIMEOUT_MS = 45000;

// ─── Live catalog context for the prompt ────────────────────────────────────
function catalogContext() {
  const categories = queryRecords('Category', { limit: 1000 })
    .map((c) => ({ id: c.id, name: c.name, name_ar: c.name_ar }));
  // Distinct, frequency-sorted tag vocabulary (top 40) so the model reuses
  // existing storefront filter terms.
  const freq = new Map();
  for (const p of queryRecords('Product', { limit: 100000 })) {
    for (const t of String(p.tags || '').split(',')) {
      const tag = t.trim().toLowerCase();
      if (tag) freq.set(tag, (freq.get(tag) || 0) + 1);
    }
  }
  const tagVocabulary = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([t]) => t);
  const takenSkus = new Set(
    queryRecords('Product', { limit: 100000 })
      .map((p) => String(p.sku || '').toLowerCase())
      .filter(Boolean),
  );
  return { categories, tagVocabulary, takenSkus };
}

// ─── Gemini call ────────────────────────────────────────────────────────────
async function callGemini({ imageBase64, mimeType, prompt, apiKey }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: DRAFT_RESPONSE_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message || `Gemini HTTP ${res.status}`;
      // Never include the key or request payload in what we surface/log.
      const err = new Error(msg);
      err.geminiStatus = res.status;
      throw err;
    }
    const text = body?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('') || '';
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
// Registered in functions.js REGISTRY + GUARDS ('admin').
export async function aiProductDraft(body = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { _status: 503, error: 'AI drafting is not configured yet (missing GEMINI_API_KEY on the server).' };
  }
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length === 0) return { _status: 400, error: 'No images provided.' };
  if (images.length > MAX_IMAGES_PER_CALL) {
    return { _status: 400, error: `Too many images in one batch — max ${MAX_IMAGES_PER_CALL}.` };
  }
  for (const img of images) {
    if (!img?.data || typeof img.data !== 'string') {
      return { _status: 400, error: 'Each image needs a base64 `data` string.' };
    }
  }

  const { categories, tagVocabulary, takenSkus } = catalogContext();
  const prompt = buildDraftPrompt({ categories, tagVocabulary });

  // Small concurrency pool (3) — fast enough for a batch, gentle on rate limits.
  const results = new Array(images.length);
  let cursor = 0;
  async function worker() {
    while (cursor < images.length) {
      const i = cursor++;
      const img = images[i];
      try {
        const text = await callGemini({
          imageBase64: img.data, mimeType: img.mime_type, prompt, apiKey,
        });
        const raw = extractJson(text);
        const { draft, issues } = normalizeDraft(raw, { categories, tagVocabulary });
        if (!draft) {
          results[i] = { index: i, error: 'AI returned an unreadable draft — please retry this photo.' };
          continue;
        }
        // SKU: sanitize the hint, guarantee uniqueness across the catalog AND
        // this batch (reserve each accepted SKU immediately).
        let sku = ensureUniqueSku(draft.sku_hint, takenSkus);
        if (!sku) {
          // Fallback when the hint was empty/unusable: derive from the name.
          sku = ensureUniqueSku(draft.name, takenSkus) || '';
        }
        if (sku) takenSkus.add(sku.toLowerCase());
        draft.sku = sku; // '' → operator must fill one in the review grid
        if (!sku) issues.push('Could not derive a unique SKU — enter one manually');
        results[i] = { index: i, draft, issues };
      } catch (e) {
        const status = e.geminiStatus;
        const msg = e.name === 'AbortError'
          ? 'AI timed out on this photo — retry it.'
          : status === 429
            ? 'AI rate limit reached — wait a minute and retry.'
            : 'AI analysis failed for this photo — retry or fill the fields manually.';
        console.error('[aiDraft] Gemini call failed (status %s): %s', status || 'n/a', e.message);
        results[i] = { index: i, error: msg };
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  return { drafts: results, model: MODEL() };
}
