// Unit tests for the tag/view filtering helpers (src/lib/shopFilters.js)
// that power the home SeasonalDuo + CategoryRail landings.
// Pure functions — no DB, no network.
//
//   Run: npm test   (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTag,
  productMatchesTags,
  isNewSeasonItem,
  tagLabel,
} from '../src/lib/shopFilters.js';

const onSale = () => true;
const notOnSale = () => false;

test('normalizeTag: lowercase, trim, plural-tolerant', () => {
  assert.equal(normalizeTag(' Rompers '), 'romper');
  assert.equal(normalizeTag('Hospital Sets'), 'hospital set');
  assert.equal(normalizeTag('accessories'), 'accessory');
  assert.equal(normalizeTag('accessories'), normalizeTag('accessory'));
  assert.equal(normalizeTag('SUMMER'), 'summer');
  assert.equal(normalizeTag('  comfort   set '), 'comfort set');
});

test('productMatchesTags: exact and plural-insensitive matches', () => {
  const p = { tags: 'miniyo, baby, hospital sets, beige' };
  assert.equal(productMatchesTags(p, ['hospital sets']), true);
  assert.equal(productMatchesTags(p, ['hospital set']), true);
  assert.equal(productMatchesTags(p, 'romper'), false);
});

test('productMatchesTags: singular request matches plural token and vice versa', () => {
  assert.equal(productMatchesTags({ tags: 'romper, baby' }, ['rompers']), true);
  assert.equal(productMatchesTags({ tags: 'rompers, baby' }, ['romper']), true);
  assert.equal(productMatchesTags({ tags: 'bodysuits, cotton' }, ['bodysuit']), true);
  assert.equal(productMatchesTags({ tags: 'accessories, towels' }, ['accessories']), true);
});

test('productMatchesTags: multiple requested tags = OR; empty = match all', () => {
  const p = { tags: 'winter, pyjama' };
  assert.equal(productMatchesTags(p, ['summer', 'winter']), true);
  assert.equal(productMatchesTags(p, ['summer', 'autumn']), false);
  assert.equal(productMatchesTags(p, []), true);
});

test('productMatchesTags: missing tags never crash', () => {
  assert.equal(productMatchesTags({}, ['summer']), false);
  assert.equal(productMatchesTags({ tags: null }, ['summer']), false);
});

test('isNewSeasonItem: winter/autumn-tagged items included even when on sale', () => {
  assert.equal(isNewSeasonItem({ tags: 'winter, fleece' }, onSale), true);
  assert.equal(isNewSeasonItem({ tags: 'autumn, cotton' }, notOnSale), true);
});

test('isNewSeasonItem: new badge included only when NOT discounted', () => {
  assert.equal(isNewSeasonItem({ is_new: true, tags: 'cotton' }, notOnSale), true);
  assert.equal(isNewSeasonItem({ is_new: true, tags: 'cotton' }, onSale), false);
});

test('isNewSeasonItem: regular discounted/seasonless items excluded', () => {
  assert.equal(isNewSeasonItem({ tags: 'summer, beach' }, onSale), false);
  assert.equal(isNewSeasonItem({ is_new: false, tags: 'socks' }, notOnSale), false);
  assert.equal(isNewSeasonItem(null, notOnSale), false);
});

test('tagLabel: bilingual labels for known merchandising tags, raw fallback', () => {
  assert.equal(tagLabel('summer', 'en'), 'Summer Sale');
  assert.equal(tagLabel('summer', 'ar'), 'تخفيضات الصيف');
  assert.equal(tagLabel('hospital sets', 'ar'), 'أطقم الاستقبال');
  assert.equal(tagLabel('unknown tag', 'en'), 'unknown tag');
});

test('productMatchesTags: generic "set"/"sets" products must NOT leak into Hospital/Comfort Sets views', () => {
  // Live catalog has 12 products tagged "sets" + 6 tagged "set"; the old
  // bidirectional substring match pulled all of them into the Hospital Sets
  // view (18 instead of 6).
  assert.equal(productMatchesTags({ tags: 'sets, baby' }, ['hospital sets']), false);
  assert.equal(productMatchesTags({ tags: 'set, newborn' }, ['comfort sets']), false);
  assert.equal(productMatchesTags({ tags: '2 piece set' }, ['comfort sets']), false);
  assert.equal(productMatchesTags({ tags: 'bath sets' }, ['hospital sets']), false);
  assert.equal(productMatchesTags({ tags: 'hospital sets, newborn' }, ['hospital sets']), true);
  assert.equal(productMatchesTags({ tags: 'comfort set' }, ['comfort sets']), true);
});

test('productMatchesTags: accessories family unifies (accessories / accessory / hair accessory)', () => {
  assert.equal(productMatchesTags({ tags: 'accessories' }, ['accessories']), true);
  assert.equal(productMatchesTags({ tags: 'accessory' }, ['accessories']), true);
  assert.equal(productMatchesTags({ tags: 'hair accessory' }, ['accessories']), true);
  assert.equal(productMatchesTags({ tags: 'romper' }, ['accessories']), false);
});

test('productMatchesTags: compound token matches its parts (bodysuits & rompers)', () => {
  assert.equal(productMatchesTags({ tags: 'bodysuits & rompers' }, ['rompers']), true);
  assert.equal(productMatchesTags({ tags: 'bodysuits & rompers' }, ['bodysuits']), true);
  assert.equal(productMatchesTags({ tags: 'summer outfit' }, ['summer']), true);
});
