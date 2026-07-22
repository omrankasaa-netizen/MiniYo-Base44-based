// Non-destructive image framing for the storefront 3:4 product card box.
//
// Two independent, optional pieces of metadata can be stored per ProductImage:
//   focal: { x, y }                 normalized 0..1, default { 0.5, 0.5 }
//   crop:  { x, y, width, height }  normalized 0..1, optional
//
// Both are rendered purely with CSS so the ORIGINAL uploaded image is never
// modified or re-uploaded. Absence of either field falls back to the previous
// behaviour (object-cover / object-center), so existing products keep working.

export const DEFAULT_FOCAL = { x: 0.5, y: 0.5 };

// ── Image source normalization ──────────────────────────────────────────────
// A ProductImage entry can arrive in several shapes depending on when/how it was
// created: a plain string URL (legacy / bulk import), an object with a `.url`
// field plus optional focal/crop metadata (admin uploads), or an object that
// uses a different key for the URL (`image_url`, `file_url`, `src`). It can also
// be missing or carry a blank URL. This helper collapses all of those into a
// single consistent { url, focal, crop } object, or returns null when there is
// no usable image so callers can render a placeholder instead of a blank <img>.

function pickUrl(image) {
  if (typeof image === 'string') return image;
  if (!image || typeof image !== 'object') return '';
  return image.url || image.image_url || image.file_url || image.src || '';
}

// Resolve a stored URL into something the browser can load. Uploaded files are
// stored as site-relative paths (e.g. "/uploads/abc.jpg"); absolute http(s) and
// data: URLs are returned untouched. A relative path that lost its leading slash
// is repaired so it still resolves from the site root.
export function resolveImageUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/')) return url;
  if (url.startsWith('uploads/')) return `/${url}`;
  return url;
}

// Pull a per-size derivative map off an image record, tolerating absent fields.
// Returns { large, card, thumb } of resolved URLs, or null when none exist.
// Legacy records (string URL or {url} with no `variants`) return null so callers
// fall back to the single canonical URL.
function readVariants(image) {
  if (!image || typeof image !== 'object') return null;
  const v = image.variants || image.image_variants || image.srcset;
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const k of ['large', 'card', 'thumb']) {
    const u = resolveImageUrl(v[k]);
    if (u) out[k] = u;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Normalize one image entry of any shape into
// { url, variants, focal, crop, is_primary, sort_order } or null.
// `url` is the canonical fallback; `variants` (when present) lets callers request
// a size via imageSrc().
export function normalizeImage(image) {
  const url = resolveImageUrl(pickUrl(image));
  if (!url) return null;
  const { focal, crop } = readImageFraming(typeof image === 'object' ? image : null);
  const variants = readVariants(image);
  return {
    url, variants, focal, crop,
    is_primary: !!(image && image.is_primary),
    sort_order: (image && image.sort_order) || 0,
  };
}

// Pick the best URL for a desired size from a normalized image.
//   size: 'large' | 'card' | 'thumb' (default 'card')
// Falls back through sensible neighbors, then the canonical single URL, so
// legacy images (no variants) and partially-generated sets always resolve.
// ── Cloudflare on-the-fly image resizing ─────────────────────────────────────
// Our product images live on Cloudflare R2 behind images.miniyokids.com. Rather
// than ship a single multi-MB original to every context (a 3MB blanket photo
// shown at 200px on the grid), we route the URL through Cloudflare's image
// resizing endpoint (/cdn-cgi/image/<opts>/<original>). Cloudflare resizes once,
// re-encodes to the best modern format the browser accepts (AVIF/WebP), and
// edge-caches each size. The original file is never modified or re-uploaded.
//
// Requires "Image Resizing" to be enabled on the Cloudflare zone. If it is off,
// the resizing path 404s — so this is guarded: we only rewrite URLs on our own
// R2 host, and a CF_IMAGE_RESIZE flag lets us instantly fall back to originals.
// Image Transformations are enabled on the miniyokids.com zone (Sources: this
// zone only). Verified live: a 3.26MB original returns ~11KB at width=320.
const CF_IMAGE_RESIZE = true;

// Cloudflare-proxied custom domain (same R2 bucket, Image Resizing enabled) that
// all product images should be served through. Resized URLs are always emitted
// on this origin.
const CF_RESIZE_ORIGIN = 'https://images.miniyokids.com';

// Hosts whose images can be safely routed through Cloudflare resizing. This is
// the CDN custom domain itself (already-correct URLs).
const CF_RESIZE_HOSTS = new Set(['images.miniyokids.com']);

// Raw R2 public bucket hosts (e.g. pub-<hash>.r2.dev). These serve the SAME
// objects under the SAME keys as CF_RESIZE_ORIGIN, but bypass Cloudflare Image
// Resizing — so a card/thumb/large derivative referenced by its raw r2.dev URL
// ships full-size and, on constrained connections, stalls the page. We rewrite
// such URLs onto CF_RESIZE_ORIGIN so they get the same optimization the custom
// domain provides. The object key (u.pathname) is identical on both hosts.
function isRawR2Host(host) {
  return /(^|\.)r2\.dev$/i.test(host);
}

// Target widths (CSS px) per logical size. Cloudflare caps the height to keep
// aspect ratio; quality 80 is visually lossless for photos at these sizes.
const CF_SIZE_WIDTH = { thumb: 320, card: 600, large: 1200 };

// Wrap an absolute R2 URL with a Cloudflare resizing transform. Returns the URL
// unchanged when resizing is disabled, the host isn't ours, the URL is already
// transformed, or it's not a plain http(s) image (data:/blob:/relative upload).
// URLs already on the CDN keep their origin; raw r2.dev URLs are re-homed onto
// CF_RESIZE_ORIGIN (same bucket/key) so they benefit from resizing too.
function cfResize(url, size) {
  if (!CF_IMAGE_RESIZE || !url) return url;
  if (!/^https?:\/\//i.test(url)) return url;            // skip data:/blob:/relative
  if (url.includes('/cdn-cgi/image/')) return url;        // already transformed
  let u;
  try { u = new URL(url); } catch { return url; }
  const onCdn = CF_RESIZE_HOSTS.has(u.host);
  const onRawR2 = isRawR2Host(u.host);
  if (!onCdn && !onRawR2) return url;                     // only our own images
  const origin = onCdn ? u.origin : CF_RESIZE_ORIGIN;
  const width = CF_SIZE_WIDTH[size] || CF_SIZE_WIDTH.card;
  const opts = `width=${width},quality=80,format=auto,fit=scale-down`;
  // /cdn-cgi/image/<opts>/<path-with-leading-slash>
  return `${origin}/cdn-cgi/image/${opts}${u.pathname}${u.search}`;
}

// CMS sections (hero, banners, category icons) store only a single canonical
// `image_url` string — the 600px "card" derivative produced by optimizeAndStore
// (key path …/<base>/card.webp). They have no variants map, so a raw <img> would
// render the 600px image even for a full-bleed hero (soft on large screens) and
// download a too-big icon for a 144px category tile.
//
// cmsImageSrc() right-sizes such a URL by:
//   1) if it points at a generated derivative (…/card.webp), swapping to the
//      sibling derivative for the requested size (…/large.webp | …/thumb.webp) —
//      these were pre-generated at upload, so it's free and pixel-crisp; then
//   2) routing the result through Cloudflare resizing as a final tightener
//      (e.g. a 1600px large served to a 400px icon slot is shrunk on the edge).
// Anything not on our R2 host, or not a derivative path, is passed through
// cfResize() unchanged-or-resized as appropriate.
export function cmsImageSrc(rawUrl, size = 'large') {
  const url = resolveImageUrl(rawUrl);
  if (!url) return '';
  // Swap the derivative segment when this is one of our generated variants.
  const swapped = url.replace(/\/(large|card|thumb)\.webp(\?.*)?$/i,
    (_m, _old, q) => `/${size}.webp${q || ''}`);
  return cfResize(swapped, size);
}

// Build a 3-candidate srcset (thumb/card/large) for a CMS single-URL image so
// the browser picks the smallest sufficient derivative for the actual layout
// slot. Without this, every CMS banner/hero/category tile downloaded the
// 1200px "large" derivative even inside a 176px tile (Lighthouse "improve
// image delivery"). Pair with a `sizes` attribute matching the slot. Returns
// '' when there is nothing useful to offer (caller relies on `src` alone).
export function cmsImageSrcSet(rawUrl) {
  const url = resolveImageUrl(rawUrl);
  if (!url || !/^https?:\/\//i.test(url)) return '';
  const entries = ['thumb', 'card', 'large']
    .map((k) => `${cmsImageSrc(url, k)} ${CF_SIZE_WIDTH[k]}w`);
  return entries.join(', ');
}

export function imageSrc(normalized, size = 'card') {
  if (!normalized) return '';
  const v = normalized.variants;
  if (v) {
    const order = {
      large: ['large', 'card', 'thumb'],
      card: ['card', 'large', 'thumb'],
      thumb: ['thumb', 'card', 'large'],
    }[size] || ['card', 'large', 'thumb'];
    // Route the chosen derivative through Cloudflare resizing too: the stored
    // variant URL may point at the raw r2.dev bucket (unoptimized, ~4x larger),
    // so cfResize re-homes it onto the CDN and right-sizes it for this context.
    for (const k of order) if (v[k]) return cfResize(v[k], size);
  }
  // Single-URL image (e.g. bulk-imported originals): resize on the fly.
  return cfResize(normalized.url, size);
}

// Approximate intrinsic widths (CSS px) of each derivative, used as the `w`
// descriptors in srcset so the browser can pick the smallest sufficient image.
// R2 derivatives: thumb <=300, card <=600, large <=1600. Single-URL images are
// resized on the fly by Cloudflare, so their descriptors mirror CF_SIZE_WIDTH.
const SRCSET_VARIANT_WIDTH = { thumb: 300, card: 600, large: 1600 };

// Sensible default `sizes` strings for each render context. Callers can override.
export const CARD_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px';
export const DETAIL_SIZES = '(max-width: 768px) 100vw, 50vw';

// Build a srcset for a normalized image so mobile pulls the right derivative.
// Prefers the pre-generated R2 variants (free, pixel-crisp); for legacy single
// URL images it emits Cloudflare-resized candidates. Returns '' when there is
// nothing useful to offer (caller should just rely on `src`).
export function imageSrcSet(normalized) {
  if (!normalized) return '';
  const v = normalized.variants;
  const entries = [];
  if (v) {
    for (const k of ['thumb', 'card', 'large']) {
      if (!v[k]) continue;
      // Route each derivative through Cloudflare resizing (re-homing raw r2.dev
      // URLs onto the CDN). When rewritten, the served width is capped to
      // CF_SIZE_WIDTH[k], so the `w` descriptor must reflect that; otherwise the
      // pre-generated variant keeps its intrinsic-width descriptor.
      const u = cfResize(v[k], k);
      const w = u !== v[k] ? (CF_SIZE_WIDTH[k] || CF_SIZE_WIDTH.card) : SRCSET_VARIANT_WIDTH[k];
      entries.push(`${u} ${w}w`);
    }
  } else if (normalized.url && /^https?:\/\//i.test(normalized.url)) {
    for (const k of ['thumb', 'card', 'large']) {
      const u = cfResize(normalized.url, k);
      const w = CF_SIZE_WIDTH[k] || CF_SIZE_WIDTH.card;
      // Only emit a candidate when resizing actually changed the URL, otherwise
      // we'd list the same original at several widths (misleading to the browser).
      if (u !== normalized.url) entries.push(`${u} ${w}w`);
    }
  }
  // A single candidate adds no value over `src`.
  return entries.length > 1 ? entries.join(', ') : '';
}

// Normalize a mixed list, dropping any entry without a usable URL so a carousel
// never renders a blank slide.
export function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.map(normalizeImage).filter(Boolean);
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export function normalizeFocal(focal) {
  if (!focal || typeof focal !== 'object') return { ...DEFAULT_FOCAL };
  return { x: clamp01(focal.x), y: clamp01(focal.y) };
}

// A crop is only valid if it actually narrows the image to a sub-rectangle.
export function hasValidCrop(crop) {
  if (!crop || typeof crop !== 'object') return false;
  const { x, y, width, height } = crop;
  if ([x, y, width, height].some(v => typeof v !== 'number' || Number.isNaN(v))) return false;
  if (width <= 0 || height <= 0) return false;
  // Treat a full-frame crop as "no crop" so we keep the simpler cover path.
  return !(x <= 0.001 && y <= 0.001 && width >= 0.999 && height >= 0.999);
}

// Read focal/crop metadata off a ProductImage record, tolerating absent fields.
export function readImageFraming(image) {
  if (!image || typeof image !== 'object') {
    return { focal: { ...DEFAULT_FOCAL }, crop: null };
  }
  const focal = normalizeFocal(
    image.focal || (image.focal_x != null || image.focal_y != null
      ? { x: image.focal_x, y: image.focal_y }
      : null)
  );
  const crop = hasValidCrop(image.crop) ? image.crop : null;
  return { focal, crop };
}

// Styles for the simple focal-point case (no crop): the <img> fills the box with
// object-cover and the focal point is kept in view via object-position.
export function focalImageStyle(focal) {
  const f = normalizeFocal(focal);
  return {
    objectFit: 'cover',
    objectPosition: `${(f.x * 100).toFixed(2)}% ${(f.y * 100).toFixed(2)}%`,
  };
}

// Styles for the crop case: the <img> is scaled up so the chosen crop rectangle
// exactly fills the framing box, then translated so the rectangle's top-left
// lands at the box origin. The box itself must be `overflow: hidden`.
//
// The image is sized to 1/crop.width × 1/crop.height of the box (so the crop
// rect maps onto the full box), then translated. CSS translate percentages are
// relative to the ELEMENT's own size, so the shift to bring normalized point
// crop.x to the box origin is exactly -crop.x (likewise for y).
export function cropImageStyle(crop) {
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const w = Math.min(1 - x, clamp01(crop.width));
  const h = Math.min(1 - y, clamp01(crop.height));
  const safeW = w > 0 ? w : 1;
  const safeH = h > 0 ? h : 1;
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: `${(100 / safeW).toFixed(3)}%`,
    height: `${(100 / safeH).toFixed(3)}%`,
    transform: `translate(${(-x * 100).toFixed(3)}%, ${(-y * 100).toFixed(3)}%)`,
    maxWidth: 'none',
    objectFit: 'cover',
  };
}

// Neutral inline placeholder (warm muted bag glyph on the card background) used
// as an <img> onError fallback so a dead/missing image never shows the browser's
// broken-image icon. Inline SVG data URI keeps it dependency- and network-free.
export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">` +
    `<rect width="120" height="160" fill="#f1ece4"/>` +
    `<g fill="none" stroke="#c9bba9" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="M44 64h32l6 44a8 8 0 0 1-8 9H46a8 8 0 0 1-8-9z"/>` +
    `<path d="M50 64v-6a10 10 0 0 1 20 0v6"/></g></svg>`,
  );

// Attach to an <img onError={...}>.
// Cloudflare's /cdn-cgi/image/ resize proxy can error on a cold edge cache and
// leave the image broken; when the failed src is a resize-proxy URL, retry ONCE
// against the direct origin URL (prefix stripped) before giving up. After the
// retry (or for non-proxy URLs), swap in the neutral placeholder exactly once
// (guards against an error loop if the placeholder itself fails).
export function handleImageError(e) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied) return;
  if (!img.dataset.cfRetried && img.src.includes('/cdn-cgi/image/')) {
    img.dataset.cfRetried = '1';
    const direct = img.src.replace(/\/cdn-cgi\/image\/[^/]+/, '');
    if (direct !== img.src) {
      img.src = direct;
      return;
    }
  }
  img.dataset.fallbackApplied = '1';
  img.src = IMAGE_PLACEHOLDER;
}

// Group a flat list of ProductImage records into an ordered array per product.
// Sort by sort_order, with the primary image first so the card opens on it.
export function buildImagesByProduct(images = []) {
  const m = {};
  for (const img of images) {
    if (!img || !img.product_id || !img.url) continue;
    (m[img.product_id] ||= []).push(img);
  }
  for (const id of Object.keys(m)) {
    m[id].sort((a, b) => {
      if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }
  return m;
}

// Single entry point used by both the storefront card and the admin preview.
// Returns { style, cropped } where `cropped` indicates the absolute-positioned
// (crop) rendering path so callers can mark the wrapper position: relative.
export function framingStyle(image) {
  const { focal, crop } = readImageFraming(image);
  if (crop) return { style: cropImageStyle(crop), cropped: true };
  return { style: focalImageStyle(focal), cropped: false };
}
