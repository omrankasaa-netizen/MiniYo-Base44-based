import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUtmValue,
  normalizeUtmPayload,
  getUtmFromSearch,
} from '../src/lib/utmAttribution.js';

test('normalizeUtmValue trims + lowercases and is null-safe', () => {
  assert.equal(normalizeUtmValue('  Facebook  '), 'facebook');
  assert.equal(normalizeUtmValue('SUMMER_SALE'), 'summer_sale');
  assert.equal(normalizeUtmValue(''), '');
  assert.equal(normalizeUtmValue(null), '');
  assert.equal(normalizeUtmValue(undefined), '');
});

test('normalizeUtmPayload keeps only supported UTM keys with normalized values', () => {
  const out = normalizeUtmPayload({
    utm_source: '  Instagram ',
    utm_medium: ' PAID_SOCIAL',
    utm_campaign: ' BackToSchool ',
    utm_content: '',
    custom: 'ignored',
  });
  assert.deepEqual(out, {
    utm_source: 'instagram',
    utm_medium: 'paid_social',
    utm_campaign: 'backtoschool',
  });
});

test('getUtmFromSearch extracts only non-empty normalized utm params', () => {
  const out = getUtmFromSearch('?utm_source=Google&utm_medium=CPC&utm_campaign=Launch&utm_term=kids+clothes&x=1');
  assert.deepEqual(out, {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'launch',
    utm_term: 'kids clothes',
  });
});
