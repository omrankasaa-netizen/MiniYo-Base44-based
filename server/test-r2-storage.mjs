// Tests for the image storage abstraction + sharp optimization.
//
//   node server/test-r2-storage.mjs
//
// Covers (no real R2 credentials needed):
//   1. Backend SELECTION: r2 when the full env set is present, local otherwise.
//   2. R2 ENDPOINT derivation from account id, and override via R2_ENDPOINT.
//   3. R2 CLIENT CONFIG: the S3 client is built with the right endpoint/region.
//   4. R2 publicUrl building from R2_PUBLIC_BASE_URL + key.
//   5. LOCAL FALLBACK end-to-end: an oversized image is optimized to WebP
//      derivatives (large/card/thumb) on disk, downsized, never upscaled.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (msg) => console.log('ok:', msg);

const {
  isR2Configured, r2Endpoint, plannedBackendName, getStorage, _resetStorageForTest,
} = await import('./storage.js');

// ── 1. Selection logic ───────────────────────────────────────────────────────
const fullR2 = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'AK',
  R2_SECRET_ACCESS_KEY: 'SK',
  R2_BUCKET: 'miniyo-images',
  R2_PUBLIC_BASE_URL: 'https://images.example.com/',
};
assert.equal(isR2Configured(fullR2), true, 'full env => R2 configured');
assert.equal(plannedBackendName(fullR2), 'r2', 'full env => planned backend r2');
ok('R2 selected when all required env vars present');

for (const missing of Object.keys(fullR2)) {
  const partial = { ...fullR2 };
  delete partial[missing];
  assert.equal(isR2Configured(partial), false, `missing ${missing} => not configured`);
  assert.equal(plannedBackendName(partial), 'local', `missing ${missing} => local`);
}
ok('falls back to local when ANY required R2 var is missing');

assert.equal(isR2Configured({}), false, 'empty env => not configured');
assert.equal(plannedBackendName({}), 'local', 'empty env => local');
ok('empty env selects local disk');

// ── 2. Endpoint derivation ───────────────────────────────────────────────────
assert.equal(
  r2Endpoint(fullR2),
  'https://acct123.r2.cloudflarestorage.com',
  'endpoint derived from account id',
);
assert.equal(
  r2Endpoint({ ...fullR2, R2_ENDPOINT: 'https://custom.example.com' }),
  'https://custom.example.com',
  'explicit R2_ENDPOINT overrides derivation',
);
ok('R2 endpoint derivation + override correct');

// ── 3 & 4. R2 backend client config + public URL ─────────────────────────────
_resetStorageForTest();
const r2 = await getStorage(fullR2);
assert.equal(r2.name, 'r2', 'getStorage(fullR2) => r2 backend');
assert.equal(r2._bucket, 'miniyo-images', 'bucket wired');
assert.equal(r2._endpoint, 'https://acct123.r2.cloudflarestorage.com', 'endpoint wired');
const cfg = r2._client.config;
assert.equal(await cfg.region(), 'auto', 'S3 region=auto');
const resolvedEndpoint = await cfg.endpoint();
assert.equal(resolvedEndpoint.hostname, 'acct123.r2.cloudflarestorage.com', 'S3 client endpoint host');
// trailing slash on the public base must not double up in the built URL
assert.equal(
  r2.publicUrl('products/x/card.webp'),
  'https://images.example.com/products/x/card.webp',
  'publicUrl joins base + key without double slash',
);
ok('R2 S3 client configured with correct endpoint/region/bucket + publicUrl');

// ── 5. Local fallback: optimize an OVERSIZED image to WebP derivatives ────────
_resetStorageForTest();
// Build a 2000x2000 PNG so resize must kick in (large=1600, card=600, thumb=300).
const bigPng = await sharp({
  create: { width: 2000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 90 } },
}).png().toBuffer();

const local = await getStorage({}); // no R2 env => local
assert.equal(local.name, 'local', 'no env => local backend');

const { optimizeAndStore } = await import('./imageOptimize.js');
const result = await optimizeAndStore(bigPng, 'huge-photo.png');
assert.equal(result.optimized, true, 'optimized flag true');
assert.equal(result.format, 'webp', 'format webp');
assert.ok(result.variants.large && result.variants.card && result.variants.thumb, 'three variants present');
assert.equal(result.url, result.variants.card, 'canonical url is the card derivative');
assert.ok(result.url.startsWith('/uploads/products/'), 'local url under /uploads/products');

const ROOT = path.join(__dirname, '..');
async function dim(url) {
  const p = path.join(ROOT, url.replace(/^\//, ''));
  assert.ok(fs.existsSync(p), `derivative exists on disk: ${url}`);
  const m = await sharp(p).metadata();
  assert.equal(m.format, 'webp', `${url} is webp`);
  return m.width;
}
assert.equal(await dim(result.variants.large), 1600, 'large resized to 1600 (downscaled)');
assert.equal(await dim(result.variants.card), 600, 'card resized to 600');
assert.equal(await dim(result.variants.thumb), 300, 'thumb resized to 300');
ok('local fallback optimizes oversized image to downscaled WebP derivatives');

// never upscale: a 100px source should stay <= 100 for every variant
_resetStorageForTest();
const smallPng = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 20, b: 30 } },
}).png().toBuffer();
await getStorage({});
const small = await optimizeAndStore(smallPng, 'tiny.png');
assert.equal(await dim(small.variants.large), 100, 'large not upscaled past source (100)');
ok('never upscales beyond the source width');

// cleanup local artifacts this test wrote
fs.rmSync(path.join(ROOT, 'uploads', 'products'), { recursive: true, force: true });

console.log('\nALL R2/STORAGE TESTS PASSED');
