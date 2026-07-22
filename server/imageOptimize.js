// Optimize + store product images.
//
// Every uploaded image (single /api/upload AND each photo in a bulk-import zip)
// flows through optimizeAndStore(). It pipes the bytes through sharp to:
//   - auto-rotate from EXIF, then strip metadata
//   - resize DOWN to a set of widths (never upscale)
//   - re-encode as WebP (quality ~80)
// and writes each derivative through the storage adapter (R2 or local disk).
//
// Returns a descriptor with the canonical public URL plus a `variants` map and a
// `base` key so the frontend can request the right size:
//
//   {
//     url,                       // canonical (card) public URL — what to store
//     base,                      // backend key prefix, e.g. products/<id>
//     variants: { large, card, thumb },  // public URLs per size
//     optimized: true,           // false when sharp failed and we stored raw
//     format: 'webp' | <orig>,
//     width, height,             // of the "large" derivative (or original)
//   }
//
// RESILIENCE: if sharp throws on a particular file (corrupt, unsupported), we
// fall back to storing the ORIGINAL bytes once and flag optimized:false rather
// than aborting the whole upload/import.
import crypto from 'node:crypto';
import path from 'node:path';
import { getStorage, sanitizeKey } from './storage.js';

let _sharp = null;
async function loadSharp() {
  if (_sharp === null) {
    try {
      const mod = await import('sharp');
      _sharp = mod.default || mod;
    } catch {
      _sharp = false; // mark unavailable; we'll store originals
    }
  }
  return _sharp;
}

// Derivative widths. "large" is the detail-page image; "card" is the storefront
// grid / carousel; "thumb" is the gallery strip / tiny previews. Heights are
// left to sharp (aspect preserved); withoutEnlargement prevents upscaling.
export const VARIANTS = [
  { name: 'large', width: 1600 },
  { name: 'card', width: 600 },
  { name: 'thumb', width: 300 },
];
// Which derivative the canonical ProductImage.url should point at. Card is the
// most-requested size, so default the stored URL to it; large/thumb live in the
// variants map for context-aware selection on the frontend.
const CANONICAL = 'card';

function makeBaseKey(filename) {
  const stem = path.basename(filename || 'image').replace(/\.[a-zA-Z0-9]+$/, ''); // drop extension
  const safe = (sanitizeKey(stem).slice(0, 60)) || 'image';
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `products/${id}-${safe}`;
}

// Sniff a reasonable content-type for the fallback (raw) path from the filename.
function guessContentType(filename) {
  const ext = (path.extname(filename || '').toLowerCase().replace('.', '')) || 'bin';
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp',
  };
  return map[ext] || 'application/octet-stream';
}

// ── Cloudflare edge-cache pre-warming ────────────────────────────────────────
// The storefront serves images through Cloudflare's resize proxy
// (/cdn-cgi/image/<opts>/<path> on images.miniyokids.com). A resized variant
// that no visitor has requested yet can error on a cold edge cache, leaving
// broken images for the first visitors after an upload. After a successful
// store, fetch the two most common resized variants (width=600 and width=1200,
// quality=80, format=auto — matching the client's card/large requests) so the
// edge cache is warm before anyone arrives. STRICTLY fire-and-forget: never
// awaited by the upload path, and failures are logged quietly.
const CF_RESIZE_ORIGIN = 'https://images.miniyokids.com';

export function prewarmResizeCache(urls) {
  try {
    const list = Object.values(urls || {}).filter(
      (u) => typeof u === 'string' && u.startsWith(CF_RESIZE_ORIGIN),
    );
    for (const u of list) {
      const { pathname } = new URL(u);
      for (const width of [600, 1200]) {
        fetch(`${CF_RESIZE_ORIGIN}/cdn-cgi/image/width=${width},quality=80,format=auto${pathname}`)
          .catch((e) => console.warn('[imageOptimize] prewarm failed:', e?.message));
      }
    }
  } catch (e) {
    console.warn('[imageOptimize] prewarm failed:', e?.message);
  }
}

// Core entry point. `buffer` is the raw image bytes; `filename` is used only to
// derive a readable key and a fallback content-type.
export async function optimizeAndStore(buffer, filename) {
  const storage = await getStorage();
  const base = makeBaseKey(filename);
  const sharp = await loadSharp();

  if (sharp) {
    try {
      // Derivatives are independent (distinct keys, own pipelines). Run them
      // concurrently: sharp/libvips encodes off the JS thread and the storage
      // PUTs overlap, so this is meaningfully faster than awaiting in series.
      const results = await Promise.all(VARIANTS.map(async (v) => {
        const out = await sharp(buffer, { failOn: 'none' })
          .rotate()                                  // honor EXIF orientation
          .resize({ width: v.width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        const { url } = await storage.putObject(`${base}/${v.name}.webp`, out.data, 'image/webp');
        return { name: v.name, url, info: out.info };
      }));
      const variants = Object.fromEntries(results.map(r => [r.name, r.url]));
      const large = results.find(r => r.name === 'large')?.info || null;
      // Fire-and-forget: warm Cloudflare's resize cache for the common sizes.
      prewarmResizeCache(variants);
      return {
        url: variants[CANONICAL] || variants.large,
        base,
        variants,
        optimized: true,
        format: 'webp',
        width: large ? large.width : null,
        height: large ? large.height : null,
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[imageOptimize] sharp failed for "${filename}" (${e.message}); storing original`);
      // fall through to raw storage
    }
  }

  // Fallback: store the original bytes once, unoptimized.
  const ext = (path.extname(filename || '').toLowerCase()) || '.bin';
  const key = `${base}/orig${ext}`;
  const { url } = await storage.putObject(key, buffer, guessContentType(filename));
  // Fire-and-forget: warm Cloudflare's resize cache for the common sizes.
  prewarmResizeCache({ orig: url });
  // No derivatives — `variants: null` so the frontend falls back to this single
  // URL via imageSrc() rather than reporting three identical "sizes".
  return {
    url,
    base,
    variants: null,
    optimized: false,
    format: ext.replace('.', '') || 'bin',
    width: null,
    height: null,
  };
}

// Decode a data/base64 payload (with or without a data: prefix) into a Buffer.
export function bufferFromBase64(content) {
  const data = content.includes(',') ? content.split(',')[1] : content;
  return Buffer.from(data, 'base64');
}
