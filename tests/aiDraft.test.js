// Unit tests for server/aiDraftCore.js — the pure prompt/normalization/SKU
// logic behind the "Add by Photos" AI drafting feature (aiProductDraft).
//
//   Run: npm test   (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDraftPrompt,
  DRAFT_RESPONSE_SCHEMA,
  extractJson,
  normalizeDraft,
  sanitizeSku,
  ensureUniqueSku,
  VALID_GENDERS,
  VALID_AGES,
} from '../server/aiDraftCore.js';

const CATS = [
  { id: 'c1', name: 'Rompers', name_ar: 'رومبر' },
  { id: 'c2', name: 'Accessories', name_ar: 'أكسسوارات' },
];
const VOCAB = ['summer', 'romper', 'hospital sets'];

test('buildDraftPrompt: embeds existing categories and tag vocabulary', () => {
  const p = buildDraftPrompt({ categories: CATS, tagVocabulary: VOCAB });
  assert.match(p, /Rompers/);
  assert.match(p, /hospital sets/);
  assert.match(p, /Lebanese Arabic/);
  // Safety rule: never invent fabric/certification claims.
  assert.match(p, /NEVER claim fabric/i);
  assert.match(p, /organic cotton/i);
});

test('buildDraftPrompt: multi-photo sets are drafted as ONE product', () => {
  const single = buildDraftPrompt({ categories: CATS, tagVocabulary: VOCAB, photoCount: 1 });
  assert.match(single, /Look at this product photo/);
  const multi = buildDraftPrompt({ categories: CATS, tagVocabulary: VOCAB, photoCount: 4 });
  assert.match(multi, /4 attached photos/);
  assert.match(multi, /SAME product/);
  assert.match(multi, /ONE catalog entry/);
  // Single-photo prompt must NOT claim multiple photos.
  assert.doesNotMatch(single, /SAME product/);
});

test('DRAFT_RESPONSE_SCHEMA: required fields match normalizeDraft expectations', () => {
  for (const f of ['name', 'name_ar', 'category', 'gender', 'age_group', 'tags']) {
    assert.ok(DRAFT_RESPONSE_SCHEMA.required.includes(f), `schema must require ${f}`);
  }
});

test('extractJson: plain, fenced, and junk input', () => {
  assert.deepEqual(extractJson('{"name":"X"}'), { name: 'X' });
  assert.deepEqual(extractJson('```json\n{"name":"Y"}\n```'), { name: 'Y' });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{broken'), null);
});

test('normalizeDraft: happy path maps category to id, keeps tags', () => {
  const raw = {
    name: 'Baby Girls Floral Romper — Dusty Pink',
    name_ar: 'رومبر بناتي وردي',
    description: 'Soft floral romper with snap buttons.',
    description_ar: 'رومبر ناعم بكبسات.',
    category: 'rompers', // case-insensitive match to "Rompers"
    gender: 'Girls',
    age_group: 'Baby',
    color: 'Dusty Pink',
    tags: ['Romper', 'summer', 'SUMMER'],
    sizes: ['0-3M', '3-6M'],
    sku_hint: 'romp floral pnk!',
  };
  const { draft, issues } = normalizeDraft(raw, { categories: CATS, tagVocabulary: VOCAB });
  assert.equal(draft.category_id, 'c1');
  assert.equal(draft.category_suggestion, '');
  assert.deepEqual(draft.tags, ['romper', 'summer']); // lowercased + deduped
  assert.deepEqual(draft.new_tags, []); // both already in vocabulary
  assert.deepEqual(draft.sizes, ['0-3M', '3-6M']);
  assert.equal(draft.sku_hint, 'romp floral pnk!'); // hint kept raw; sanitize happens at SKU step
  assert.deepEqual(issues, []);
});

test('normalizeDraft: unknown category kept as suggestion + issue flagged', () => {
  const raw = { name: 'X', name_ar: 'X', category: 'Winter Jackets', gender: 'Boys', age_group: 'Kids', tags: [] };
  const { draft, issues } = normalizeDraft(raw, { categories: CATS, tagVocabulary: VOCAB });
  assert.equal(draft.category_id, '');
  assert.equal(draft.category_suggestion, 'Winter Jackets');
  assert.ok(issues.some((i) => i.includes('not an existing category')));
});

test('normalizeDraft: out-of-vocabulary gender/age nulled + flagged', () => {
  const raw = { name: 'X', name_ar: 'X', category: 'Rompers', gender: 'Aliens', age_group: 'Teens', tags: ['newtag'] };
  const { draft, issues } = normalizeDraft(raw, { categories: CATS, tagVocabulary: VOCAB });
  assert.equal(draft.gender, '');
  assert.equal(draft.age_group, '');
  assert.deepEqual(draft.new_tags, ['newtag']);
  assert.equal(issues.length, 2);
  assert.ok(VALID_GENDERS.includes('Girls') && VALID_AGES.includes('Baby')); // constants exported
});

test('normalizeDraft: unusable model output → null draft + issue', () => {
  const { draft, issues } = normalizeDraft(null, { categories: CATS });
  assert.equal(draft, null);
  assert.equal(issues.length, 1);
  const unnamed = normalizeDraft({ category: 'Rompers', gender: 'Girls', age_group: 'Baby', tags: [] }, { categories: CATS });
  assert.ok(unnamed.issues.some((i) => i.includes('name')));
});

test('sanitizeSku: uppercase, charset, length', () => {
  assert.equal(sanitizeSku('romp floral pnk!'), 'ROMP-FLORAL-PNK');
  assert.equal(sanitizeSku('--weird__sku--'), 'WEIRD-SKU');
  assert.equal(sanitizeSku('x'.repeat(40)), 'X'.repeat(24));
  assert.equal(sanitizeSku('!!!'), '');
});

test('ensureUniqueSku: appends -2/-3 on collision, case-insensitive', () => {
  const taken = new Set(['romp-floral-pnk', 'romp-floral-pnk-2']);
  assert.equal(ensureUniqueSku('romp floral pnk', taken), 'ROMP-FLORAL-PNK-3');
  assert.equal(ensureUniqueSku('fresh-sku', taken), 'FRESH-SKU');
  assert.equal(ensureUniqueSku('!!!', taken), ''); // no usable base → caller fallback
});
