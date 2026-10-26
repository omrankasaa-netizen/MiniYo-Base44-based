// Color-swatch helpers for the storefront product card — kept dependency-free
// (only imports the dependency-free availableQty) so it can be unit-tested with
// `node --test` (no vite `@/` alias resolution needed).
//
// Variant colors on this catalog are messy free text: real color names
// ("Powder Pink", "Sage-Green"), multi-tone combos ("White&Navy",
// "Pink&Powder-Pink Set"), print names that START with a color ("Pink Floral",
// "White Star"), supplier codes ("Beige (MND1842)", "Style2:green") and pure
// print names with no color at all ("Dino", "Giraffe Set"). These helpers turn
// each label into up to two hex tones for a small circle swatch, and aggregate
// per-color stock so the card can dim sold-out colors.

import { availableQty } from './availableQty.js';

// Known color tokens → hex. Keys are lowercase; multi-word keys are matched
// longest-first so "powder pink" wins over "pink". Tones are soft, slightly
// muted pastels that read well at 14px on the store's warm neutral background.
const TONES = {
  'off-white': '#f6f3ec',
  white: '#ffffff',
  ecru: '#e7dcc6',
  cream: '#f2e9d5',
  beige: '#d9c7a9',
  greige: '#c6bcae',
  camel: '#c19a6b',
  mink: '#a3866a',
  brown: '#8a6844',
  'powder pink': '#f5d2d9',
  powder: '#f5d2d9',
  'dusty pink': '#d5a3ac',
  'blush pink': '#f0c2cb',
  blush: '#f0c2cb',
  pink: '#f2b3c6',
  coral: '#ef8f7d',
  salmon: '#efa08c',
  somon: '#efa08c',
  cherry: '#b23a52',
  berry: '#a34a66',
  burgundy: '#6f2e37',
  red: '#cf4545',
  rosewood: '#a06a60',
  rose: '#e5b0b0',
  fuscia: '#cd64a2',
  fuchsia: '#cd64a2',
  'dusty purple': '#a292b3',
  purple: '#9b7bb8',
  lilac: '#c8b2dc',
  'light blue': '#a9c6e2',
  'baby blue': '#a9c6e2',
  blue: '#7fa6cf',
  navy: '#2e3a55',
  marine: '#3a5570',
  aqua: '#9ad3cf',
  'mint green': '#b4ddc6',
  mint: '#b4ddc6',
  'light green': '#b3d6a4',
  'sage green': '#b5c2ab',
  sage: '#b5c2ab',
  green: '#7da97d',
  lemon: '#f2e198',
  yellow: '#f0d65c',
  mustard: '#d6a243',
  'grey melange': '#a9a9a9',
  'gray melange': '#a9a9a9',
  melange: '#a9a9a9',
  'light grey': '#cfcfcf',
  'light gray': '#cfcfcf',
  'dark grey': '#7c7c7c',
  'dark gray': '#7c7c7c',
  grey: '#b3b3b3',
  gray: '#b3b3b3',
  anthracite: '#4b4b4e',
  black: '#2b2b2b',
};

// Longest-first token list for matching.
const TONE_KEYS = Object.keys(TONES).sort((a, b) => b.length - a.length);

// Trailing/filler words that never carry color meaning: print nouns, set/style
// markers and supplier noise. Stripped before token matching.
const FILLER_WORDS = new Set([
  'set', 'style', 'flowers', 'flower', 'floral', 'heart', 'hearts', 'leaves',
  'star', 'butterfly', 'bow', 'duck', 'rabbit', 'bunny', 'horse', 'giraffe',
  'dino', 'lion', 'penguin', 'sheep', 'lotus', 'sailboat', 'pattern', 'print',
  'love', 'simple', 'with', 'cloth', 'toy', 'tether', 'be', 'happy', 'colors',
  '3colors', 'and',
]);

// Normalize a raw color label into a dedupe key: lowercase, drop parenthetical
// supplier codes "(MND1842)", treat &/- as separators, drop filler words,
// collapse spaces. "Sage Green" vs "Sage-Green" and "Pink&Powder-Pink Set" vs
// "Pink&Powder-Pink set" collapse to the same key.
export function normalizeColorLabel(label) {
  let s = String(label || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');           // "(MND1842)" codes
  s = s.replace(/style\s*\d*\s*:?/g, ' ');    // "Style2:", "Style 1119"
  s = s.replace(/[&/+,;_-]+/g, ' ');          // separators → spaces
  const words = s.split(/\s+/)
    .filter((w) => w && !FILLER_WORDS.has(w) && !/^\d+$/.test(w));
  return words.join(' ');
}

// Resolve a label to up to two hex tones.
//  1. Split the raw label on explicit combo separators (&, /, " and ") and
//     resolve each side, so "White&Navy" → [white, navy].
//  2. Within each side, longest-match TONES keys on word boundaries. Matching
//     runs on the raw side (only supplier codes stripped), NOT the normalized
//     dedupe key, so multi-word tones like "light blue" / "grey melange" keep
//     their own hexes instead of collapsing to plain "blue" / "grey".
//  3. Returns [] when nothing matches (pure print name like "Dino") — the card
//     renders a neutral dot so the variant is still visible.
export function tonesForLabel(label) {
  const hexes = [];
  const push = (hex) => { if (hex && !hexes.includes(hex)) hexes.push(hex); };

  const sides = String(label || '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s*(?:&|\/|\band\b)\s*/i);

  for (const side of sides) {
    const matchStr = side.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!matchStr) continue;
    // Longest-first substring match on word boundaries.
    for (const key of TONE_KEYS) {
      if (new RegExp(`(^|\\s)${key.replace(/[-\s]/g, '[\\s-]')}(?=\\s|$)`).test(matchStr)) {
        push(TONES[key]);
        break;
      }
    }
    if (hexes.length >= 2) break;
  }
  return hexes.slice(0, 2);
}

// Build the card swatch list for a product.
//   product  — product record (uses .colors pipe-string only when no variants)
//   variants — the product's ProductVariant rows (optional)
// Returns ordered, deduped [{ key, label, hexes, inStock, image }]:
//   key      — normalized dedupe key
//   label    — first-seen original label (for title/aria)
//   hexes    — up to two tones ([] → caller renders a neutral fallback dot)
//   inStock  — any variant of this color has orderable stock
//   image    — first variant image_url for this color (null when the catalog
//              has no per-color photo; the card then deep-links instead)
export function buildColorSwatches(product, variants) {
  if (!product) return [];
  const out = [];
  const byKey = new Map();

  const add = (rawLabel, qty, image) => {
    const label = String(rawLabel || '').trim();
    if (!label) return;
    const key = normalizeColorLabel(label) || label.toLowerCase();
    let entry = byKey.get(key);
    if (!entry) {
      entry = { key, label, hexes: tonesForLabel(label), inStock: false, image: null };
      byKey.set(key, entry);
      out.push(entry);
    }
    if (qty > 0) entry.inStock = true;
    if (!entry.image && image) entry.image = image;
  };

  const rows = Array.isArray(variants) ? variants : [];
  const variantColors = rows.filter((v) => v && String(v.color || '').trim());
  if (variantColors.length > 0) {
    for (const v of variantColors) {
      const img = typeof v.image_url === 'string' && v.image_url.trim() ? v.image_url.trim() : null;
      add(v.color, availableQty(v), img);
    }
  } else if (product.colors) {
    for (const c of String(product.colors).split('|')) add(c, 1);
  }
  return out;
}
