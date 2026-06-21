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

// Normalize one image entry of any shape into { url, focal, crop } or null.
export function normalizeImage(image) {
  const url = resolveImageUrl(pickUrl(image));
  if (!url) return null;
  const { focal, crop } = readImageFraming(typeof image === 'object' ? image : null);
  return { url, focal, crop, is_primary: !!(image && image.is_primary), sort_order: (image && image.sort_order) || 0 };
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
