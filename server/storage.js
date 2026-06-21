// Pluggable object storage for product images.
//
// Two backends sit behind one interface:
//   - LOCAL disk  (default/fallback): writes under <repo>/uploads and serves
//                 via Express static at /uploads. This is the original behavior
//                 and is what runs in local dev with no R2 configured.
//   - R2          (Cloudflare R2, S3-compatible): writes objects into an R2
//                 bucket and builds public URLs from R2_PUBLIC_BASE_URL. Durable
//                 across redeploys (fixes the Railway ephemeral-disk problem).
//
// The backend is chosen ONCE at boot from env vars (see isR2Configured). If the
// full R2 var set is present we use R2; otherwise we fall back to local disk.
// Either way the public interface is identical:
//
//   putObject(key, buffer, contentType) -> Promise<{ url, key }>
//   publicUrl(key)                      -> string   (site-relative or absolute)
//   name                                -> 'r2' | 'local'
//
// `key` is a backend-agnostic object key like "products/<base>/card.webp".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// ── Env detection ────────────────────────────────────────────────────────────
// R2 is considered "configured" only when every credential needed to both WRITE
// and BUILD PUBLIC URLs is present. R2_ENDPOINT is optional (derived from the
// account id when absent). If any required var is missing we stay on local disk.
export function isR2Configured(env = process.env) {
  return Boolean(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET &&
    env.R2_PUBLIC_BASE_URL,
  );
}

// Endpoint defaults to the account-scoped R2 S3 endpoint when not given.
export function r2Endpoint(env = process.env) {
  return env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function trimSlashes(s) {
  return String(s || '').replace(/\/+$/, '');
}

// Sanitize an object key for safe on-disk/URL use: keep the "/" separators but
// scrub each segment to a conservative charset. Shared so the write path and the
// URL path can never drift (writing one path, serving another).
export function sanitizeKey(key) {
  return String(key)
    .split('/')
    .map(seg => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .join('/');
}

// ── Local disk backend ───────────────────────────────────────────────────────
function createLocalBackend() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  return {
    name: 'local',
    async putObject(key, buffer /* , contentType */) {
      // Object keys may contain "/" (e.g. products/<base>/card.webp). Map them
      // onto a nested path under /uploads so the key is reproducible on disk.
      const dest = path.join(UPLOAD_DIR, sanitizeKey(key));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buffer);
      return { url: this.publicUrl(key), key };
    },
    publicUrl(key) {
      return `/uploads/${sanitizeKey(key)}`;
    },
  };
}

// ── R2 backend ───────────────────────────────────────────────────────────────
// Lazily imports the AWS SDK so installations that never touch R2 don't pay the
// load cost, and so a missing optional dep can't crash local-disk boot.
async function createR2Backend(env = process.env) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const endpoint = r2Endpoint(env);
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = env.R2_BUCKET;
  const publicBase = trimSlashes(env.R2_PUBLIC_BASE_URL);

  return {
    name: 'r2',
    // Deliberate test seam: tests assert the S3 client is configured with the
    // right endpoint/bucket without performing real network calls.
    _client: client,
    _bucket: bucket,
    _endpoint: endpoint,
    async putObject(key, buffer, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return { url: this.publicUrl(key), key };
    },
    publicUrl(key) {
      return `${publicBase}/${String(key).replace(/^\/+/, '')}`;
    },
  };
}

// ── Singleton selection ──────────────────────────────────────────────────────
let _storage = null;

// Build (once) and return the active storage backend. Logs which backend is
// active at first call (boot). Safe to call repeatedly.
export async function getStorage(env = process.env) {
  if (_storage) return _storage;
  if (isR2Configured(env)) {
    try {
      _storage = await createR2Backend(env);
      // eslint-disable-next-line no-console
      console.log(`[storage] backend=r2 bucket=${env.R2_BUCKET} endpoint=${r2Endpoint(env)} publicBase=${trimSlashes(env.R2_PUBLIC_BASE_URL)}`);
      return _storage;
    } catch (e) {
      // If the SDK or client can't initialize, never take the storefront down —
      // fall back to local disk and make the failure loud.
      // eslint-disable-next-line no-console
      console.error(`[storage] R2 init failed (${e.message}); falling back to local disk`);
    }
  }
  _storage = createLocalBackend();
  // eslint-disable-next-line no-console
  console.log('[storage] backend=local dir=uploads (no R2 configured)');
  return _storage;
}

// Synchronous helper for code paths that just need to know the chosen backend
// name for logging/branching, without forcing async init.
export function plannedBackendName(env = process.env) {
  return isR2Configured(env) ? 'r2' : 'local';
}

// Test seam: reset the memoized singleton so unit tests can re-select.
export function _resetStorageForTest() {
  _storage = null;
}
