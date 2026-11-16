// Unit tests for gift packaging + Whish helpers (src/lib/giftOptions.js).
//   Run: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { giftBoxFee, collectionStatus, whishWhatsappText, waLink, isWhish, isPrepaid, cardLinkWhatsappText, CARD_LINK_METHOD } from '../src/lib/giftOptions.js';

test('giftBoxFee: $1 when selected, free from $60, 0 when not selected', () => {
  assert.equal(giftBoxFee({ selected: false, subtotal: 20 }), 0);
  assert.equal(giftBoxFee({ selected: true, subtotal: 20 }), 1);
  assert.equal(giftBoxFee({ selected: true, subtotal: 59.99 }), 1);
  assert.equal(giftBoxFee({ selected: true, subtotal: 60 }), 0);
  assert.equal(giftBoxFee({ selected: true, subtotal: 64 }), 0);
});

test('giftBoxFee: settings override, junk settings fall back to defaults', () => {
  assert.equal(giftBoxFee({ selected: true, subtotal: 50, fee: 3, freeOver: 80 }), 3);
  assert.equal(giftBoxFee({ selected: true, subtotal: 50, fee: 'x', freeOver: 'y' }), 1);
  assert.equal(giftBoxFee({ selected: true, subtotal: 70, fee: 2, freeOver: 0 }), 0, 'freeOver 0 → default 60');
});

test('collectionStatus: COD collects total, Whish paid collects 0, unpaid Whish is flagged', () => {
  assert.deepEqual(collectionStatus({ payment_method: 'Cash on Delivery', grand_total_usd: 46 }), { kind: 'cod', amount: 46 });
  assert.deepEqual(collectionStatus({ payment_method: 'Whish', payment_status: 'paid', grand_total_usd: 46 }), { kind: 'paid', amount: 0 });
  assert.deepEqual(collectionStatus({ payment_method: 'Whish', payment_status: 'pending', grand_total_usd: 46 }), { kind: 'awaiting', amount: 0 });
  assert.deepEqual(collectionStatus({ payment_method: 'Whish', grand_total_usd: 46 }), { kind: 'awaiting', amount: 0 });
  assert.equal(isWhish({ payment_method: 'whish' }), true);
});

test('whishWhatsappText + waLink', () => {
  const en = whishWhatsappText({ orderNumber: 'MNY-12345', total: 47 });
  assert.match(en, /MNY-12345/);
  assert.match(en, /\$47\.00/);
  assert.match(whishWhatsappText({ orderNumber: 'MNY-1', total: 5, lang: 'ar' }), /Whish/);
  assert.equal(waLink('+961 71 787 205', 'hi there'), 'https://wa.me/96171787205?text=hi%20there');
  assert.equal(waLink('', 'x'), '');
});

test('card payment link is prepaid like Whish', () => {
  assert.equal(isPrepaid({ payment_method: CARD_LINK_METHOD }), true);
  assert.equal(isPrepaid({ payment_method: 'Cash on Delivery' }), false);
  assert.deepEqual(collectionStatus({ payment_method: CARD_LINK_METHOD, grand_total_usd: 60 }), { kind: 'awaiting', amount: 0 });
  assert.deepEqual(collectionStatus({ payment_method: CARD_LINK_METHOD, payment_status: 'paid', grand_total_usd: 60 }), { kind: 'paid', amount: 0 });
  assert.match(cardLinkWhatsappText({ orderNumber: 'MNY-9', total: 60 }), /MNY-9.*\$60\.00.*payment link/);
});
