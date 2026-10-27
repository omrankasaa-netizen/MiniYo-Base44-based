// Unit tests for src/lib/photoColor.js — palette extraction, swatch matching
// and assignment planning for automatic per-color photo tagging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToLab, deltaE, extractPalette, matchPaletteToSwatches, planAssignments } from '../src/lib/photoColor.js';
import { buildColorSwatches } from '../src/lib/colorSwatches.js';

// Build a small RGB bitmap: center rect of `center` color on `bg` background.
function bitmap(center, bg, size = 48, rect = 0.55) {
  const data = new Uint8Array(size * size * 3);
  const lo = Math.floor(size * (1 - rect) / 2), hi = size - lo;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = (x >= lo && x < hi && y >= lo && y < hi) ? center : bg;
      const i = (y * size + x) * 3;
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    }
  }
  return { data, width: size, height: size };
}
const WHITE = { r: 250, g: 250, b: 250 };
const NAVY = hexToRgb('#2e3a55');
const PINK = hexToRgb('#f2b3c6');
const BEIGE = hexToRgb('#d9c7a9');

const swatchesFor = (colors) => buildColorSwatches(
  { has_variants: true },
  colors.map((color) => ({ color, qty_on_hand: 1, qty_reserved: 0 })),
);

test('rgbToLab: white/black endpoints and red sanity', () => {
  const w = rgbToLab(255, 255, 255), k = rgbToLab(0, 0, 0);
  assert.ok(Math.abs(w.L - 100) < 0.5);
  assert.ok(Math.abs(k.L) < 0.5);
  assert.ok(deltaE(w, k) > 90);
  assert.equal(deltaE(w, w), 0);
});

test('extractPalette: navy garment on white background favors NAVY over white', () => {
  const palette = extractPalette(bitmap(NAVY, WHITE));
  assert.ok(palette.length >= 2);
  assert.equal(palette[0].r, NAVY.r); // dominant (background suppressed)
});

test('match: navy photo on white bg → Navy, not White', () => {
  const swatches = swatchesFor(['White', 'Navy']);
  const hit = matchPaletteToSwatches(extractPalette(bitmap(NAVY, WHITE)), swatches);
  assert.equal(hit.key, 'navy');
  assert.ok(hit.confidence >= 0.32);
});

test('match: pink photo → Pink among several candidates', () => {
  const swatches = swatchesFor(['Beige', 'Pink', 'Navy']);
  const hit = matchPaletteToSwatches(extractPalette(bitmap(PINK, WHITE)), swatches);
  assert.equal(hit.key, 'pink');
});

test('match: busy two-color image with no dominant color returns null', () => {
  // 50/50 navy+pink stripes: neither reaches a clear win → no assignment.
  const size = 48;
  const data = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = (y % 8 < 4) ? NAVY : PINK;
      const i = (y * size + x) * 3;
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    }
  }
  const swatches = swatchesFor(['Navy', 'Pink']);
  const hit = matchPaletteToSwatches(extractPalette({ data, width: size, height: size }), swatches);
  assert.equal(hit, null);
});

test('match: two-tone photo claims the combo variant, not its single tones', () => {
  // White top half + navy bottom half (garment filling most of the frame).
  const size = 48;
  const data = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x < 3 || x >= size - 3;
      const c = edge ? WHITE : (y < size / 2 ? WHITE : NAVY);
      const i = (y * size + x) * 3;
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    }
  }
  const swatches = swatchesFor(['White&Navy', 'Pink']);
  const hit = matchPaletteToSwatches(extractPalette({ data, width: size, height: size }), swatches);
  assert.equal(hit.key, 'white navy');
});

test('match: print-only swatches are never auto-matched', () => {
  const swatches = swatchesFor(['Dino', 'Giraffe Set']);
  const hit = matchPaletteToSwatches(extractPalette(bitmap(BEIGE, WHITE)), swatches);
  assert.equal(hit, null);
});

test('planAssignments: best photo per color, existing photos never replaced', () => {
  const productId = 'p1';
  const swatches = swatchesFor(['Navy', 'Pink']);
  swatches.find((s) => s.key === 'pink').image = '/uploads/manual-pink.webp'; // manual win
  const rows = [
    { productId, imageUrl: '/img/navy-weak.webp', suggestion: { key: 'navy', label: 'Navy', confidence: 0.4 } },
    { productId, imageUrl: '/img/navy-strong.webp', suggestion: { key: 'navy', label: 'Navy', confidence: 0.8 } },
    { productId, imageUrl: '/img/pink-new.webp', suggestion: { key: 'pink', label: 'Pink', confidence: 0.9 } },
    { productId, imageUrl: '/img/none.webp', suggestion: null },
  ];
  const plan = planAssignments(rows, { [productId]: swatches });
  assert.equal(plan.length, 1); // pink skipped (already has a manual photo)
  assert.equal(plan[0].imageUrl, '/img/navy-strong.webp');
  assert.equal(plan[0].colorKey, 'navy');
});
