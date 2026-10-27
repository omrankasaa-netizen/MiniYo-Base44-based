import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_AI_CONFIDENCE, buildPhotoColorPrompt, normalizeAiMatches, planAiAssignments,
} from '../server/photoColorAiCore.js';

const product = { id: 'p1', name: 'Printed Romper', category_name: 'Babywear' };
const swatches = [
  { key: 'dino', label: 'Dino', hexes: [], image: null },
  { key: 'pink', label: 'Pink', hexes: ['#f2b3c6'], image: null },
  { key: 'blue', label: 'Blue', hexes: ['#7fa6cf'], image: null },
];
const images = [
  { url: 'https://img.test/dino.jpg' },
  { url: 'https://img.test/pink.jpg' },
  { url: 'https://img.test/blue.jpg' },
];
const context = { productId: 'p1', images, swatches };

function match(imageIndex, colorKey, confidence = 0.9) {
  return { imageIndex, colorKey, confidence, pattern: 'floral', reason: 'The garment shows this variant.' };
}

test('prompt constrains Gemini to exact keys and includes print-only variants', () => {
  const prompt = buildPhotoColorPrompt(product, swatches, 3);
  assert.match(prompt, /"colorKey": "dino"/);
  assert.match(prompt, /Pattern and print labels/);
  assert.match(prompt, /imageIndex 0/);
  assert.match(prompt, /not the background, packaging/);
});

test('normalizes a print-only match without requiring hex colors', () => {
  const rows = normalizeAiMatches({ matches: [match(0, 'dino')] }, context);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].suggestion.key, 'dino');
  assert.equal(rows[0].suggestion.source, 'gemini');
});

test('rejects unknown keys, invalid indexes, and low confidence', () => {
  const rows = normalizeAiMatches({ matches: [
    match(0, 'invented'), match(-1, 'pink'), match(9, 'pink'),
    match(1, 'pink', MIN_AI_CONFIDENCE - 0.01), match(2, 'blue', 1.2),
  ] }, context);
  assert.deepEqual(rows, []);
});

test('never suggests a color that already has an assigned photo', () => {
  const assigned = swatches.map((s) => s.key === 'pink' ? { ...s, image: 'manual.jpg' } : s);
  const rows = normalizeAiMatches({ matches: [match(1, 'pink')] }, { ...context, swatches: assigned });
  assert.deepEqual(rows, []);
});

test('keeps only the strongest row when Gemini duplicates one photo', () => {
  const rows = normalizeAiMatches({ matches: [match(0, 'dino', 0.7), match(0, 'pink', 0.95)] }, context);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].suggestion.key, 'pink');
  assert.equal(rows[0].suggestion.confidence, 0.95);
});

test('sanitizes and bounds model-provided explanation text', () => {
  const row = { ...match(0, 'dino'), pattern: ` floral\n`, reason: ` evidence\u0000${'x'.repeat(400)}` };
  const [result] = normalizeAiMatches({ matches: [row] }, context);
  assert.equal(result.suggestion.pattern, 'floral');
  assert.equal(result.suggestion.reason.length, 240);
  assert.doesNotMatch(result.suggestion.reason, /\u0000/);
});

test('plans the clearest photo per color and preserves AI review metadata', () => {
  const rows = normalizeAiMatches({ matches: [
    match(0, 'dino', 0.8), match(1, 'pink', 0.85), match(2, 'pink', 0.96),
  ] }, context);
  const plan = planAiAssignments(rows, product);
  assert.equal(plan.length, 2);
  const pink = plan.find((a) => a.colorKey === 'pink');
  assert.equal(pink.imageUrl, images[2].url);
  assert.equal(pink.productName, product.name);
  assert.equal(pink.pattern, 'floral');
  assert.equal(pink.source, 'gemini');
});
