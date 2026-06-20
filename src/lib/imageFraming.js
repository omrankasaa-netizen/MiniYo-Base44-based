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
