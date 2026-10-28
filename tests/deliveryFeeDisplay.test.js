import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deliveryFeeRange,
  formatDeliveryFeeRange,
} from '../src/lib/deliveryFeeDisplay.js';

test('delivery fee display: identical active zone fees show one price', () => {
  const range = deliveryFeeRange([
    { name: 'Beirut', fee_usd: 5 },
    { name: 'Mount Lebanon', fee_usd: '5' },
    { name: 'All other areas/districts', fee_usd: 5 },
  ]);

  assert.deepEqual(range, { min: 5, max: 5 });
  assert.equal(formatDeliveryFeeRange(range), '$5.00');
});

test('delivery fee display: mixed active zone fees show the full range', () => {
  const range = deliveryFeeRange([
    { fee_usd: 5 },
    { fee_usd: 3 },
    { fee_usd: 4.5 },
  ]);

  assert.deepEqual(range, { min: 3, max: 5 });
  assert.equal(formatDeliveryFeeRange(range), '$3.00–$5.00');
});

test('delivery fee display: no active zones uses legacy settings as fallback', () => {
  const range = deliveryFeeRange([], { inside: 3, outside: 4 });

  assert.deepEqual(range, { min: 3, max: 4 });
  assert.equal(formatDeliveryFeeRange(range), '$3.00–$4.00');
});

test('delivery fee display: a real zero-fee zone remains free', () => {
  assert.equal(
    formatDeliveryFeeRange(deliveryFeeRange([{ fee_usd: 0 }])),
    '$0.00',
  );
  assert.equal(
    formatDeliveryFeeRange(deliveryFeeRange([{ fee_usd: 0 }, { fee_usd: 5 }])),
    '$0.00–$5.00',
  );
});

test('delivery fee display: invalid fees are ignored instead of becoming free', () => {
  const invalidZones = [
    { fee_usd: 'not-a-number' },
    { fee_usd: -1 },
    { fee_usd: null },
    { fee_usd: '' },
    {},
  ];

  assert.equal(
    formatDeliveryFeeRange(deliveryFeeRange([...invalidZones, { fee_usd: 5 }])),
    '$5.00',
  );
  assert.deepEqual(
    deliveryFeeRange(invalidZones, { inside: 3, outside: 4 }),
    { min: 3, max: 4 },
  );
});
