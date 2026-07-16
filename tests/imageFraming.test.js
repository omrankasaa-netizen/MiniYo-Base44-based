// Unit tests for storefront image URL construction (src/lib/imageFraming.js).
// Focus: multi-size (thumb/card/large) product image URLs must route through the
// Cloudflare Image Resizing proxy (images.miniyokids.com/cdn-cgi/image/...),
// including when the stored variant URL points at the raw r2.dev bucket — while
// legacy single-image URLs already on the CDN stay byte-identical.
//
//   Run: npm test         (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeImage,
  imageSrc,
  imageSrcSet,
  cmsImageSrc,
} from '../src/lib/imageFraming.js';

const RAW = 'https://pub-a73adc77083a4bdc89b8ad4e7eba0e1c.r2.dev';
const CDN = 'https://images.miniyokids.com';
const KEY = '/products/1700000000000-abcd1234-blanket/';

const cdnResized = (width, path) =>
  `${CDN}/cdn-cgi/image/width=${width},quality=80,format=auto,fit=scale-down${path}`;

test('multi-size variant URLs on raw r2.dev route through the CDN resize proxy', () => {
  const img = normalizeImage({
    url: `${RAW}${KEY}card.webp`,
    variants: {
      thumb: `${RAW}${KEY}thumb.webp`,
      card: `${RAW}${KEY}card.webp`,
      large: `${RAW}${KEY}large.webp`,
    },
  });

  assert.equal(imageSrc(img, 'thumb'), cdnResized(320, `${KEY}thumb.webp`));
  assert.equal(imageSrc(img, 'card'), cdnResized(600, `${KEY}card.webp`));
  assert.equal(imageSrc(img, 'large'), cdnResized(1200, `${KEY}large.webp`));

  // No output should still reference the raw bucket host.
  for (const size of ['thumb', 'card', 'large']) {
    assert.ok(!imageSrc(img, size).includes('r2.dev'), `${size} still on r2.dev`);
  }
});

test('imageSrcSet re-homes raw variant URLs and reports resized widths', () => {
  const img = normalizeImage({
    url: `${RAW}${KEY}card.webp`,
    variants: {
      thumb: `${RAW}${KEY}thumb.webp`,
      card: `${RAW}${KEY}card.webp`,
      large: `${RAW}${KEY}large.webp`,
    },
  });
  const set = imageSrcSet(img);
  assert.ok(!set.includes('r2.dev'), 'srcset still references raw bucket');
  assert.equal(
    set,
    [
      `${cdnResized(320, `${KEY}thumb.webp`)} 320w`,
      `${cdnResized(600, `${KEY}card.webp`)} 600w`,
      `${cdnResized(1200, `${KEY}large.webp`)} 1200w`,
    ].join(', '),
  );
});

test('legacy single-image CDN URL is unchanged except for the standard resize wrap', () => {
  // Legacy record: plain string URL already on the CDN, no variants.
  const legacy = normalizeImage(`${CDN}/products/SKU_1.webp`);
  assert.equal(imageSrc(legacy, 'card'), cdnResized(600, '/products/SKU_1.webp'));
  assert.equal(imageSrc(legacy, 'thumb'), cdnResized(320, '/products/SKU_1.webp'));
  assert.equal(imageSrc(legacy, 'large'), cdnResized(1200, '/products/SKU_1.webp'));
});

test('already-transformed CDN URLs are not double-wrapped', () => {
  const already = `${CDN}/cdn-cgi/image/width=320,quality=80,format=auto,fit=scale-down/products/x.webp`;
  const img = normalizeImage(already);
  assert.equal(imageSrc(img, 'card'), already);
});

test('local/relative upload paths are left untouched', () => {
  const img = normalizeImage({
    url: '/uploads/products/x/card.webp',
    variants: { card: '/uploads/products/x/card.webp' },
  });
  assert.equal(imageSrc(img, 'card'), '/uploads/products/x/card.webp');
});

test('cmsImageSrc swaps derivative and routes raw r2.dev through the proxy', () => {
  // A CMS single-URL card derivative living on the raw bucket, requested at large.
  const out = cmsImageSrc(`${RAW}${KEY}card.webp`, 'large');
  assert.equal(out, cdnResized(1200, `${KEY}large.webp`));
});
