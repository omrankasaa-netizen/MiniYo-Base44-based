// Automatic per-color photo assignment — pure, dependency-free color science.
// The server decodes product photos to small RGB bitmaps (sharp), this lib
// extracts a background-suppressed, center-weighted palette and matches it
// against the product's OWN color swatches (see colorSwatches.js). Everything
// here is synchronous and injectable so `node --test` covers the full logic
// without network or sharp.

// ── Color space helpers (sRGB → CIE Lab, D65) ───────────────────────────────
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE(lab1, lab2) {
  return Math.sqrt((lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
}

// ── Palette extraction ──────────────────────────────────────────────────────
// input: { data: RGB triplets (3 bytes/pixel), width, height } — small (~48px).
// Two clothing-photo-specific tricks:
//   1. Center weighting: the garment sits in the middle, backgrounds at edges.
//   2. Background suppression: pixels close to the average CORNER color are
//      heavily down-weighted, so a navy romper on a white studio background
//      matches "Navy", not "White". A white garment on a white background
//      simply ends up unassigned (safe) instead of confidently wrong.
export function extractPalette({ data, width, height }, { maxColors = 6 } = {}) {
  if (!data || !width || !height) return [];
  const px = (x, y) => {
    const i = (y * width + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // Corner background estimate (4 corner blocks).
  let br = 0, bg = 0, bb = 0, bn = 0;
  const bs = Math.max(2, Math.floor(Math.min(width, height) / 8));
  for (const [cx, cy] of [[0, 0], [width - bs, 0], [0, height - bs], [width - bs, height - bs]]) {
    for (let y = cy; y < cy + bs; y++) {
      for (let x = cx; x < cx + bs; x++) {
        const [r, g, b] = px(x, y);
        br += r; bg += g; bb += b; bn++;
      }
    }
  }
  const bgLab = rgbToLab(br / bn, bg / bn, bb / bn);

  const buckets = new Map();
  let totalWeight = 0;
  const cx0 = (width - 1) / 2, cy0 = (height - 1) / 2;
  const sx = width * 0.38, sy = height * 0.38;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      const dx = (x - cx0) / sx, dy = (y - cy0) / sy;
      let w = Math.exp(-(dx * dx + dy * dy) / 2) + 0.05; // floor keeps edges visible
      if (deltaE(rgbToLab(r, g, b), bgLab) < 18) w *= 0.15;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { w: 0, r: 0, g: 0, b: 0 }; buckets.set(key, bucket); }
      bucket.w += w; bucket.r += r * w; bucket.g += g * w; bucket.b += b * w;
      totalWeight += w;
    }
  }
  if (totalWeight <= 0) return [];

  // Merge quantized buckets into perceptual clusters, most weighted first.
  const sorted = [...buckets.values()].sort((a, b) => b.w - a.w);
  const clusters = [];
  for (const bucket of sorted) {
    const r = bucket.r / bucket.w, g = bucket.g / bucket.w, b = bucket.b / bucket.w;
    const lab = rgbToLab(r, g, b);
    let merged = false;
    for (const c of clusters) {
      if (deltaE(c.lab, lab) < 30) {
        const w = c.w + bucket.w;
        c.r = (c.r * c.w + r * bucket.w) / w;
        c.g = (c.g * c.w + g * bucket.w) / w;
        c.b = (c.b * c.w + b * bucket.w) / w;
        c.lab = rgbToLab(c.r, c.g, c.b);
        c.w = w;
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ r, g, b, lab, w: bucket.w });
    if (clusters.length >= maxColors * 2 && bucket.w / totalWeight < 0.02) break;
  }
  return clusters
    .sort((a, b) => b.w - a.w)
    .slice(0, maxColors)
    .map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), lab: c.lab, share: c.w / totalWeight }));
}

// ── Swatch matching ─────────────────────────────────────────────────────────
const MATCH_DISTANCE = 32;   // Delta-E radius for "this palette entry is that color"
const MIN_CONFIDENCE = 0.32; // minimum weighted coverage to trust an assignment
const MIN_MARGIN = 1.4;      // winner must beat the runner-up by this ratio

// palette: extractPalette output. swatches: buildColorSwatches output.
// Returns { key, label, confidence } or null when no color is clearly dominant.
// Print-only swatches (hexes: []) are never auto-matched — color math cannot
// identify a print, and guessing would attach the wrong photo.
export function matchPaletteToSwatches(palette, swatches) {
  const candidates = (Array.isArray(swatches) ? swatches : []).filter((s) => s.hexes.length > 0);
  if (!palette.length || candidates.length === 0) return null;

  // Flatten ALL candidate hexes; each palette entry votes for its nearest hex
  // across every swatch, so a pale pink photo can't also score as "beige"
  // (pastel tones sit closer together than the match radius).
  const flat = [];
  candidates.forEach((s, si) => {
    s.hexes.forEach((h, hi) => {
      const { r, g, b } = hexToRgb(h);
      flat.push({ si, hi, lab: rgbToLab(r, g, b) });
    });
  });
  const votes = candidates.map((s) => s.hexes.map(() => 0));
  for (const entry of palette) {
    let bestF = null, bestD = Infinity;
    for (const f of flat) {
      const d = deltaE(entry.lab, f.lab);
      if (d < bestD) { bestD = d; bestF = f; }
    }
    if (bestF && bestD <= MATCH_DISTANCE) votes[bestF.si][bestF.hi] += entry.share;
  }

  const scored = candidates.map((s, si) => {
    const perHex = votes[si];
    let coverage;
    if (perHex.length === 1) {
      coverage = perHex[0];
    } else {
      // Two-tone variant ("White&Navy"): BOTH tones must show up; a photo of
      // only one tone must not claim the combo.
      const [c1, c2] = perHex;
      coverage = Math.min(c1, c2) >= 0.08 ? c1 + c2 : Math.min(c1, c2);
    }
    return { key: s.key, label: s.label, confidence: coverage };
  }).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.confidence < MIN_CONFIDENCE) return null;
  if (second && second.confidence >= 0.15 && best.confidence < second.confidence * MIN_MARGIN) return null;
  return { key: best.key, label: best.label, confidence: Math.round(best.confidence * 100) / 100 };
}

// ── Assignment planning ─────────────────────────────────────────────────────
// rows: [{ productId, imageUrl, suggestion: {key,label,confidence}|null }]
// swatchesByProduct: productId → buildColorSwatches output (entry.image set
// when a variant of that color already has a manual/earlier photo).
// Picks the highest-confidence photo per (product, color). Colors that already
// have a photo are NEVER touched — manual assignments always win.
export function planAssignments(rows, swatchesByProduct) {
  const best = new Map();
  for (const row of rows) {
    if (!row.suggestion) continue;
    const swatches = swatchesByProduct[row.productId] || [];
    const swatch = swatches.find((s) => s.key === row.suggestion.key);
    if (!swatch || swatch.image) continue;
    const k = `${row.productId}|${row.suggestion.key}`;
    const current = best.get(k);
    if (!current || row.suggestion.confidence > current.confidence) {
      best.set(k, {
        productId: row.productId,
        colorKey: row.suggestion.key,
        label: row.suggestion.label,
        imageUrl: row.imageUrl,
        confidence: row.suggestion.confidence,
      });
    }
  }
  return [...best.values()].sort((a, b) => a.productId.localeCompare(b.productId) || b.confidence - a.confidence);
}
