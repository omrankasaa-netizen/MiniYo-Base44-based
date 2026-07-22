import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  initSchema, createRecord, getRecord, updateRecord, deleteRecord,
  queryRecords, ENTITIES, nowIso,
} from './db.js';
import {
  registerUser, authenticate, signToken, setSessionCookie, clearSessionCookie,
  getUserFromRequest, publicUser, findUserByEmail, setPassword, changePassword, updateUser,
  issueOtp, verifyOtp as verifyOtpCode,
} from './auth.js';
import { invokeFunction, invalidateDashboardCache } from './functions.js';
import { sendEmail } from './email.js';
import { runSeed } from './seed.js';
import { repairDuplicateSlugs } from './repairSlugs.js';
import { runR2HostMigration } from './r2HostMigration.js';
import { getStorage } from './storage.js';
import { optimizeAndStore, bufferFromBase64 } from './imageOptimize.js';
import { getProductBySlug, injectProductMeta } from './productMeta.js';
import { buildFeedCsv } from './metaFeed.js';
import { buildTiktokFeedCsv } from './tiktokFeed.js';
import { sendCapiEvent, buildUserData } from './metaCapiClient.js';
import {
  derivePurchaseEventId, buildPurchaseCustomData, buildPurchaseUserData,
  purchaseConsentAllowed, isSendableValue,
} from './metaPurchase.js';
import { isTrackEvent, buildTrackCustomData } from './metaTrack.js';
import { sendTikTokEvent, buildUserData as buildTikTokUserData } from './tiktokEventsClient.js';
import {
  derivePurchaseEventId as deriveTikTokPurchaseEventId,
  buildPurchaseProperties as buildTikTokPurchaseProperties,
  buildPurchaseUserData as buildTikTokPurchaseUserData,
  purchaseConsentAllowed as tiktokPurchaseConsentAllowed,
  isSendableValue as isTikTokSendableValue,
} from './tiktokPurchase.js';
import {
  isTrackEvent as isTikTokTrackEvent,
  buildTrackProperties as buildTikTokTrackProperties,
} from './tiktokTrack.js';

// Build the verification-code email HTML.
function otpEmailHtml(code) {
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:20px;color:#5a4a3f;margin:0 0 8px;">Verify your MiniYo email</h1>
      <p style="color:#6b5d52;font-size:14px;line-height:1.6;margin:0 0 24px;">Enter this code to confirm your email address. It expires in 10 minutes.</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#3f342c;background:#fff;border:1px solid #ece4da;border-radius:12px;padding:18px;text-align:center;">${code}</div>
      <p style="color:#9a8d80;font-size:12px;margin:24px 0 0;">If you didn't create a MiniYo account, you can safely ignore this email.</p>
    </div></body></html>`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PORT = process.env.PORT || 4000;

initSchema();
runSeed();
// Repair any pre-existing duplicate product slugs so each product page resolves
// to the correct item. Idempotent — a no-op once slugs are unique.
repairDuplicateSlugs();
// Rewrite any image URLs still pointing at the bucket's raw r2.dev host onto
// the runtime R2_PUBLIC_BASE_URL custom domain. Idempotent, never throws.
runR2HostMigration();

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Initialize the storage backend at boot so the chosen backend (R2 vs local
// disk) is logged once and ready before the first upload.
getStorage().catch((e) => console.error('[storage] init error:', e.message));

// Log once at boot whether the server-side TikTok Events API is active. When the
// access token is unset every TikTok send silently no-ops (never throws, never
// hits the network) — this line makes that state visible without exposing the
// secret. Mirrors the Meta CAPI token pattern.
if (!process.env.MINIYO_TIKTOK_ACCESS_TOKEN) {
  console.warn('[tiktokEvents] TikTok Events API disabled: no access token');
}

const app = express();
app.disable('x-powered-by');

// Baseline security headers. NOTE: a Content-Security-Policy is intentionally
// NOT set yet — Meta/TikTok pixels and Google Fonts make a correct CSP risky;
// TODO: introduce one in report-only mode first (Content-Security-Policy-Report-Only)
// and tighten from observed violations.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
// Limit is generous so the bulk-import endpoint can accept a base64 spreadsheet
// plus a base64 images zip in a single JSON body.
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));
app.use(cookieParser());

// ─── helpers ────────────────────────────────────────────────────────────────
function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse list()/filter() args from query string.
//   list: ?sort=-created_date&limit=50
//   filter: ?q=<json>&sort=...&limit=...
function parseListParams(req) {
  let query = {};
  if (req.query.q) {
    try { query = JSON.parse(req.query.q); } catch { query = {}; }
  }
  const sort = req.query.sort || null;
  const limit = req.query.limit != null ? asInt(req.query.limit) : null;
  return { query, sort, limit };
}

function handleError(res, e) {
  const status = e?.status || 500;
  res.status(status).json({ error: e?.message || 'Internal error' });
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.get('/api/auth/me', (req, res) => {
  const user = getUserFromRequest(req);
  // Guests are the normal case on a public storefront. Return 200 with a null
  // body instead of 401 so the client's session probe on every page load does
  // not surface a red console error. Protected routes still enforce auth (401).
  if (!user) return res.json(null);
  res.json(publicUser(user));
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = authenticate(email, password);
    const token = signToken(user.id);
    setSessionCookie(res, token);
    res.json({ access_token: token, user: publicUser(user) });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = registerUser({ email, password, full_name, phone, role: 'customer' });
    // Issue a real verification code and email it. Email send is best-effort
    // (never blocks signup), but the code is required to obtain a session.
    const code = issueOtp(user.id);
    if (process.env.MINIYO_OTP_DEBUG === '1') console.log(`[otp:register] ${user.email} -> ${code}`);
    sendEmail({
      to: user.email,
      subject: 'Your MiniYo verification code',
      html: otpEmailHtml(code),
      email_type: 'otp_verification',
      customer_id: user.id,
      trigger_event: 'register',
    }).catch(() => {});
    res.json({ ok: true, email: user.email, requires_otp: true });
  } catch (e) { handleError(res, e); }
});

// Verify the emailed OTP code. Only issues a session on a correct, unexpired code.
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { email, otpCode } = req.body || {};
    const user = findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const result = verifyOtpCode(user.id, otpCode);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    const fresh = getRecord('User', user.id);
    const token = signToken(user.id);
    setSessionCookie(res, token);
    res.json({ access_token: token, user: publicUser(fresh) });
  } catch (e) { handleError(res, e); }
});

// Regenerate and re-email a verification code.
app.post('/api/auth/resend-otp', (req, res) => {
  try {
    const { email } = req.body || {};
    const user = findUserByEmail(email);
    // Do not reveal whether the account exists.
    if (user && !user.email_verified) {
      const code = issueOtp(user.id);
      if (process.env.MINIYO_OTP_DEBUG === '1') console.log(`[otp:resend] ${user.email} -> ${code}`);
      sendEmail({
        to: user.email,
        subject: 'Your MiniYo verification code',
        html: otpEmailHtml(code),
        email_type: 'otp_verification',
        customer_id: user.id,
        trigger_event: 'resend_otp',
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/auth/update-me', (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const updated = updateUser(user.id, req.body || {});
    res.json(publicUser(updated));
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    changePassword(user.id, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/reset-password-request', (req, res) => {
  // No external mail dependency required; always succeed (token surfaced for self-host).
  try {
    const { email } = req.body || {};
    const user = findUserByEmail(email);
    res.json({ ok: true, reset_token: user ? signToken(user.id) : null });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { resetToken, newPassword } = req.body || {};
    const payload = resetToken
      ? (() => { try { return JSON.parse(Buffer.from(resetToken.split('.')[1], 'base64').toString()); } catch { return null; } })()
      : null;
    if (!payload?.sub) return res.status(400).json({ error: 'Invalid or expired reset token' });
    setPassword(payload.sub, newPassword);
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

// ─── User invite (admin) ────────────────────────────────────────────────────
app.post('/api/users/invite', (req, res) => {
  try {
    const actor = getUserFromRequest(req);
    if (!actor || !['admin', 'super_admin'].includes(actor.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { email, role = 'staff' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    // Only a super admin may grant elevated (admin/super_admin) roles; a regular
    // admin can invite staff only. Prevents privilege escalation via invite.
    if (['admin', 'super_admin'].includes(role) && actor.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: super admin required to assign admin roles' });
    }
    let user = findUserByEmail(email);
    if (!user) {
      const tempPassword = crypto.randomUUID();
      user = registerUser({ email, password: tempPassword, role });
    } else {
      user = updateRecord('User', user.id, { role });
    }
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) { handleError(res, e); }
});

// ─── Functions ────────────────────────────────────────────────────────────────
app.post('/api/functions/:name', async (req, res) => {
  try {
    const user = getUserFromRequest(req);
    const result = await invokeFunction(req.params.name, req.body || {}, user);
    if (result && typeof result === 'object' && result._status) {
      const { _status, ...rest } = result;
      return res.status(_status).json({ data: rest });
    }
    res.json({ data: result });
  } catch (e) { handleError(res, e); }
});

// ─── File upload (base64 JSON or raw) ──────────────────────────────────────────
// Uploaded images are optimized (sharp → WebP derivatives) and written through
// the storage adapter (R2 when configured, else local disk). The response keeps
// the legacy `file_url` key (now the canonical/card derivative) for backward
// compatibility, and ADDS `variants` (large/card/thumb URLs) + `base_key` so the
// frontend and ProductForm can persist size-aware sources.
app.post('/api/upload', async (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { filename, content_base64 } = req.body || {};
    if (!content_base64) return res.status(400).json({ error: 'content_base64 required' });
    const buffer = bufferFromBase64(content_base64);
    const result = await optimizeAndStore(buffer, filename || 'upload');
    res.json({
      file_url: result.url,
      url: result.url,
      variants: result.variants,
      base_key: result.base,
      optimized: result.optimized,
      width: result.width,
      height: result.height,
    });
  } catch (e) { handleError(res, e); }
});

// ─── Entity CRUD ────────────────────────────────────────────────────────────
function ensureEntity(req, res, next) {
  if (!ENTITIES.includes(req.params.entity)) {
    return res.status(404).json({ error: `Unknown entity: ${req.params.entity}` });
  }
  next();
}

// Write authorization for the generic entity CRUD surface.
//
// Reads stay public (the storefront is a public catalog). Writes are admin-only
// by default; without this gate ANY anonymous client could create/modify/delete
// products, prices, discounts, orders, etc. directly against the API.
//
// The storefront legitimately performs a small set of writes as an
// unauthenticated guest (checkout, account self-service). Those — and only
// those — are allowed per (entity, operation) below. Everything else requires
// an admin/super_admin session.
const isAdmin = (user) => !!user && (user.role === 'admin' || user.role === 'super_admin');

// Entity → operations that a non-admin (guest/customer) may perform.
const PUBLIC_WRITES = {
  Order: ['create'],
  OrderItem: ['create'],
  OrderStatusHistory: ['create'],
  Customer: ['create', 'update'],
  CustomerAddress: ['create', 'update', 'delete'],
  Review: ['create'],
  WishlistItem: ['create', 'delete'],
  PromoCode: ['update'], // checkout increments times_used only
  AuditLog: ['create'],
};

function authorizeWrite(op) {
  return (req, res, next) => {
    const user = getUserFromRequest(req);
    if (isAdmin(user)) return next();
    if (PUBLIC_WRITES[req.params.entity]?.includes(op)) return next();
    return res.status(user ? 403 : 401).json({
      error: user ? 'Forbidden: admin access required' : 'Authentication required',
    });
  };
}

// Entities whose writes change dashboard aggregates — bust the metrics cache so
// the next poll recomputes fresh (never serves stale data longer than the TTL).
const DASHBOARD_ENTITIES = new Set([
  'Order', 'OrderItem', 'Product', 'ProductVariant', 'Category', 'Customer',
]);
function maybeInvalidateDashboard(entity) {
  if (DASHBOARD_ENTITIES.has(entity)) invalidateDashboardCache();
}

// Never expose User credential-bearing fields through generic CRUD.
function sanitize(entity, record) {
  if (entity === 'User' && record) {
    const { password_hash, ...rest } = record;
    return rest;
  }
  return record;
}

// Storefront content entities are public, change rarely (admin edits), and are
// fetched by every visitor on every landing. A short shared cache lifetime
// lets the browser (and any CDN in front) reuse them across the react-query
// staleTime window instead of revalidating on every page view — this is the
// same-origin chunk of Lighthouse's "efficient cache lifetimes" finding.
// 60s max-age matches the storefront's react-query staleTime; SWR keeps repeat
// views instant while a fresh copy streams in. Admin screens always revalidate
// on mutation via invalidateDashboardCache + query invalidation, so a ≤60s
// staleness window is operationally invisible.
// Non-content entities (Order, Customer, User, EmailLog, …) stay uncached.
const CACHEABLE_CONTENT_ENTITIES = new Set([
  'Product', 'ProductImage', 'ProductVariant', 'Category', 'Collection',
  'CmsSection', 'Campaign', 'Review', 'Faq', 'MediaAsset', 'SiteSetting',
  'Discount', 'MembershipSettings', 'ShippingZone',
]);

app.get('/api/entities/:entity', ensureEntity, (req, res) => {
  try {
    const { query, sort, limit } = parseListParams(req);
    const records = queryRecords(req.params.entity, { query, sort, limit })
      .map((r) => sanitize(req.params.entity, r));
    if (CACHEABLE_CONTENT_ENTITIES.has(req.params.entity)) {
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }
    res.json(records);
  } catch (e) { handleError(res, e); }
});

app.get('/api/entities/:entity/:id', ensureEntity, (req, res) => {
  try {
    const record = getRecord(req.params.entity, req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(sanitize(req.params.entity, record));
  } catch (e) { handleError(res, e); }
});

// Reject order creation from a customer that an admin has blocked. Matches by
// customer_id, falling back to a case-insensitive email match for guests.
function blockedCustomerFor(body) {
  const id = body?.customer_id;
  if (id) {
    const c = getRecord('Customer', id);
    if (c?.is_blocked) return c;
  }
  const email = (body?.customer_email || '').toLowerCase();
  if (email) {
    const match = queryRecords('Customer', { limit: 5000 })
      .find((c) => (c.email || '').toLowerCase() === email && c.is_blocked);
    if (match) return match;
  }
  return null;
}

app.post('/api/entities/:entity', ensureEntity, authorizeWrite('create'), (req, res) => {
  try {
    if (req.params.entity === 'Order' && blockedCustomerFor(req.body || {})) {
      return res.status(403).json({ error: 'This account is blocked from placing orders. Please contact support.' });
    }
    const record = createRecord(req.params.entity, req.body || {});
    maybeInvalidateDashboard(req.params.entity);
    res.json(sanitize(req.params.entity, record));
  } catch (e) { handleError(res, e); }
});

app.put('/api/entities/:entity/:id', ensureEntity, authorizeWrite('update'), (req, res) => {
  try {
    const record = updateRecord(req.params.entity, req.params.id, req.body || {});
    maybeInvalidateDashboard(req.params.entity);
    res.json(sanitize(req.params.entity, record));
  } catch (e) { handleError(res, e); }
});

app.delete('/api/entities/:entity/:id', ensureEntity, authorizeWrite('delete'), (req, res) => {
  try {
    const result = deleteRecord(req.params.entity, req.params.id);
    maybeInvalidateDashboard(req.params.entity);
    res.json(result);
  } catch (e) { handleError(res, e); }
});

// ─── Meta catalog feed ────────────────────────────────────────────────────────
// Meta-supported CSV product feed. `id` == Product.sku so catalog entries match
// content_ids in Pixel/CAPI events + product:retailer_item_id in the JSON-LD.
// Cached so Meta's scheduled fetch is cheap; regenerated at most hourly.
const SITE_BASE = process.env.MINIYO_SITE_BASE || 'https://miniyokids.com';
app.get('/meta-feed.csv', (req, res) => {
  try {
    const products = queryRecords('Product', { limit: 100000 });
    const csv = buildFeedCsv(products);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="meta-feed.csv"');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(csv);
  } catch (e) {
    console.error('[metaFeed] generation failed:', e?.message);
    res.status(500).type('text/plain').send('feed generation error');
  }
});

// ─── TikTok catalog feed ──────────────────────────────────────────────────────
// TikTok Catalog CSV product feed. Mirrors the Meta feed (same product query,
// price/availability logic, image URL, and CSV escaping) but uses TikTok's column
// names and populates google_product_category/product_type from the DB category.
// `sku_id` == Product.sku so catalog entries match the same identifier used
// everywhere else. Cached so TikTok's scheduled fetch is cheap.
app.get('/tiktok-feed.csv', (req, res) => {
  try {
    const products = queryRecords('Product', { limit: 100000 });
    const categoriesById = new Map(
      queryRecords('Category', { limit: 100000 }).map((c) => [c.id, c]),
    );
    const csv = buildTiktokFeedCsv(products, categoriesById);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="tiktok-feed.csv"');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(csv);
  } catch (e) {
    console.error('[tiktokFeed] generation failed:', e?.message);
    res.status(500).type('text/plain').send('feed generation error');
  }
});

// ─── Sitemap ────────────────────────────────────────────────────────────────
// Dynamic XML sitemap for search crawlers (robots.txt points here). Registered
// before the SPA fallback. Reuses SITE_BASE so absolute URLs stay consistent
// with the OG/meta-feed base URL (MINIYO_SITE_BASE env override).
function xmlEscape(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Public, indexable storefront pages (from src/App.jsx). Excludes cart,
// checkout, account, admin, and auth-utility pages (register/reset-password).
const SITEMAP_STATIC_PAGES = [
  { loc: '/', priority: '1.0' },
  { loc: '/shop', priority: '0.5' },
  { loc: '/gifts', priority: '0.5' },
  { loc: '/faq', priority: '0.5' },
  { loc: '/about', priority: '0.5' },
  { loc: '/track', priority: '0.5' },
  { loc: '/wishlist', priority: '0.5' },
  { loc: '/login', priority: '0.5' },
  { loc: '/legal/contact', priority: '0.5' },
  { loc: '/legal/shipping', priority: '0.5' },
  { loc: '/legal/returns', priority: '0.5' },
  { loc: '/legal/privacy', priority: '0.5' },
  { loc: '/legal/terms', priority: '0.5' },
];

function isoDate(v) {
  const t = Date.parse(v || '');
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

app.get('/sitemap.xml', (req, res) => {
  try {
    const products = queryRecords('Product', { limit: 100000 })
      .filter((p) => p && p.slug && p.status === 'Active');
    const urls = [];
    for (const page of SITEMAP_STATIC_PAGES) {
      urls.push(
        `  <url><loc>${xmlEscape(SITE_BASE + page.loc)}</loc>`
        + `<changefreq>weekly</changefreq><priority>${page.priority}</priority></url>`,
      );
    }
    for (const p of products) {
      const lastmod = isoDate(p.updated_date);
      urls.push(
        `  <url><loc>${xmlEscape(`${SITE_BASE}/product/${p.slug}`)}</loc>`
        + (lastmod ? `<lastmod>${lastmod}</lastmod>` : '')
        + '<changefreq>weekly</changefreq><priority>0.8</priority></url>',
      );
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + urls.join('\n')
      + '\n</urlset>\n';
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (e) {
    console.error('[sitemap] generation failed:', e?.message);
    res.status(500).type('text/plain').send('sitemap generation error');
  }
});

// ─── Meta Conversions API: Purchase ─────────────────────────────────────────
// Fires the server-side Purchase event from TRUSTED order data. The client only
// passes an order_id; all money/contact values are read from the DB (never from
// the request body) so the event can't be spoofed. Idempotent + consent-gated.
function metaClientSignals(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    fbp: req.cookies?._fbp,
    fbc: req.cookies?._fbc,
    clientIp: req.headers['cf-connecting-ip'] || xff || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

app.post('/api/meta/purchase', async (req, res) => {
  try {
    const orderId = req.body?.order_id;
    if (!orderId) return res.status(400).json({ error: 'order_id required' });
    const order = getRecord('Order', orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Idempotent: never fire twice for the same order.
    if (order.meta_purchase_sent) return res.json({ ok: true, deduped: true });

    // Consent gate: skip when the buyer declined marketing.
    if (!purchaseConsentAllowed(order)) return res.json({ ok: true, skipped: 'no_consent' });

    const items = queryRecords('OrderItem', { query: { order_id: orderId }, limit: 5000 });
    const { customData, value } = buildPurchaseCustomData(order, items);

    // Only send for a real sale (value > 0).
    if (!isSendableValue(value)) return res.json({ ok: true, skipped: 'invalid_value' });

    const userData = buildPurchaseUserData(order, metaClientSignals(req));
    const eventId = derivePurchaseEventId(order);
    const eventTime = order.created_date
      ? Math.floor(Date.parse(order.created_date) / 1000) || Math.floor(Date.now() / 1000)
      : Math.floor(Date.now() / 1000);

    const result = await sendCapiEvent({
      eventName: 'Purchase',
      eventId,
      eventTime,
      eventSourceUrl: `${SITE_BASE}/checkout`,
      actionSource: 'website',
      userData,
      customData,
    });

    // Mark as sent only on a confirmed send so a transient failure (or a
    // not-yet-configured token) can retry with the SAME deterministic event_id.
    if (result.ok) {
      updateRecord('Order', orderId, { meta_purchase_sent: nowIso() });
    }
    res.json({ ok: result.ok, skipped: result.skipped });
  } catch (e) {
    // Tracking must never surface as a checkout error.
    console.error('[metaCapi] purchase route error:', e?.message);
    res.json({ ok: false, error: 'purchase_capi_failed' });
  }
});

// ─── Meta Conversions API: client-originated events ─────────────────────────
// Server-side twin for the browser Pixel's ViewContent / AddToCart /
// InitiateCheckout. The storefront posts the SAME event_id it passed to fbq so
// Meta dedups the two. Only NON-PII custom_data is accepted from the client;
// user_data (ip/ua/fbp/fbc) is derived server-side. Purchase is NOT accepted
// here — it fires only from the trusted order flow above. Fire-and-forget: the
// response never waits on Meta and tracking can never break a page load.
app.post('/api/meta/track', (req, res) => {
  try {
    const body = req.body || {};
    const eventName = body.event_name;
    if (!isTrackEvent(eventName)) {
      return res.status(400).json({ error: 'unsupported_event' });
    }

    const customData = buildTrackCustomData(body);
    // PII is never trusted from the client; only request-derived signals.
    const userData = buildUserData(metaClientSignals(req));

    sendCapiEvent({
      eventName,
      eventId: body.event_id ? String(body.event_id) : undefined,
      eventSourceUrl: typeof body.event_source_url === 'string' ? body.event_source_url : undefined,
      actionSource: 'website',
      userData,
      customData,
    }).catch((e) => console.error('[metaCapi] track send error:', e?.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[metaCapi] track route error:', e?.message);
    res.json({ ok: false });
  }
});

// ─── TikTok Events API: CompletePayment ─────────────────────────────────────
// The TikTok twin of /api/meta/purchase. Fires the server-side CompletePayment
// from TRUSTED order data. The client only passes an order_id; all money/contact
// values are read from the DB (never from the request body) so the event can't
// be spoofed. Idempotent (tiktok_purchase_sent) + consent-gated. Reuses the same
// deterministic event_id per order as Meta so the two platforms dedup cleanly.
function tiktokClientSignals(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    ttp: req.cookies?._ttp,
    ttclid: req.cookies?.ttclid,
    clientIp: req.headers['cf-connecting-ip'] || xff || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

app.post('/api/tiktok/purchase', async (req, res) => {
  try {
    const orderId = req.body?.order_id;
    if (!orderId) return res.status(400).json({ error: 'order_id required' });
    const order = getRecord('Order', orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Idempotent: never fire twice for the same order.
    if (order.tiktok_purchase_sent) return res.json({ ok: true, deduped: true });

    // Consent gate: skip when the buyer declined marketing.
    if (!tiktokPurchaseConsentAllowed(order)) return res.json({ ok: true, skipped: 'no_consent' });

    const items = queryRecords('OrderItem', { query: { order_id: orderId }, limit: 5000 });
    const { properties, value } = buildTikTokPurchaseProperties(order, items);

    // Only send for a real sale (value > 0).
    if (!isTikTokSendableValue(value)) return res.json({ ok: true, skipped: 'invalid_value' });

    const userData = buildTikTokPurchaseUserData(order, tiktokClientSignals(req));
    const eventId = deriveTikTokPurchaseEventId(order);
    const eventTime = order.created_date
      ? Math.floor(Date.parse(order.created_date) / 1000) || Math.floor(Date.now() / 1000)
      : Math.floor(Date.now() / 1000);

    const result = await sendTikTokEvent({
      eventName: 'CompletePayment',
      eventId,
      eventTime,
      pageUrl: `${SITE_BASE}/checkout`,
      userData,
      properties,
    });

    // Mark as sent only on a confirmed send so a transient failure (or a
    // not-yet-configured token) can retry with the SAME deterministic event_id.
    if (result.ok) {
      updateRecord('Order', orderId, { tiktok_purchase_sent: nowIso() });
    }
    res.json({ ok: result.ok, skipped: result.skipped });
  } catch (e) {
    // Tracking must never surface as a checkout error.
    console.error('[tiktokEvents] purchase route error:', e?.message);
    res.json({ ok: false, error: 'purchase_tiktok_failed' });
  }
});

// ─── TikTok Events API: client-originated events ─────────────────────────────
// Server-side twin for the browser Pixel's ViewContent / AddToCart /
// InitiateCheckout. The storefront posts the SAME event_id it passed to ttq so
// TikTok dedups the two. Only NON-PII properties are accepted from the client;
// user (ip/ua/ttp/ttclid) is derived server-side. CompletePayment is NOT accepted
// here — it fires only from the trusted order flow above. Fire-and-forget: the
// response never waits on TikTok and tracking can never break a page load.
app.post('/api/tiktok/track', (req, res) => {
  try {
    const body = req.body || {};
    const eventName = body.event_name;
    if (!isTikTokTrackEvent(eventName)) {
      return res.status(400).json({ error: 'unsupported_event' });
    }

    const properties = buildTikTokTrackProperties(body);
    // PII is never trusted from the client; only request-derived signals.
    const userData = buildTikTokUserData(tiktokClientSignals(req));

    sendTikTokEvent({
      eventName,
      eventId: body.event_id ? String(body.event_id) : undefined,
      pageUrl: typeof body.event_source_url === 'string' ? body.event_source_url : undefined,
      userData,
      properties,
    }).catch((e) => console.error('[tiktokEvents] track send error:', e?.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[tiktokEvents] track route error:', e?.message);
    res.json({ ok: false });
  }
});

// Uploaded files are stored under content-random filenames (uuid), so they can
// be cached hard at the edge/browser.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// ─── Serve SPA with history fallback ──────────────────────────────────────────
if (fs.existsSync(DIST)) {
  // Cache policy (Lighthouse "use efficient cache lifetimes"):
  //  • /assets/* — Vite content-hashed bundles: cache for a year, immutable.
  //  • index.html — never cached, so deploys take effect immediately.
  //  • everything else (logo, manifest, share image) — 1 day.
  const setStaticCacheHeaders = (res, filePath) => {
    const p = filePath.replace(/\\/g, '/');
    if (p.includes('/assets/')) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (p.endsWith('/index.html')) {
      res.set('Cache-Control', 'no-cache');
    } else {
      res.set('Cache-Control', 'public, max-age=86400');
    }
  };

  // Serve the PWA manifest, robots.txt and llms.txt with their correct content
  // types, ahead of both express.static and the SPA history fallback. Without
  // these, they fall through to the catch-all and return the index.html shell
  // as text/html — an invalid manifest that some in-app WebViews (e.g.
  // Facebook) choke on.
  app.get('/manifest.json', (req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.join(DIST, 'manifest.json'));
  });
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(DIST, 'robots.txt'));
  });
  app.get('/llms.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(DIST, 'llms.txt'));
  });

  app.use(express.static(DIST, { setHeaders: setStaticCacheHeaders }));

  // Server-inject per-product structured data for product detail pages so
  // Meta's non-JS crawler / Pixel catalog scanner sees per-product OG product
  // tags + JSON-LD (id, price, availability). Registered before the SPA
  // fallback; unknown slugs fall through to the plain shell (the SPA renders
  // its own not-found state). Best-effort — any read/inject error degrades to
  // serving the untouched shell so the page always loads.
  const INDEX_HTML = path.join(DIST, 'index.html');
  app.get('/product/:slug', (req, res, next) => {
    try {
      const product = getProductBySlug(req.params.slug);
      const template = fs.readFileSync(INDEX_HTML, 'utf8');
      res.set('Cache-Control', 'no-cache');
      // Unknown slug: serve the SPA shell (the client renders its own NotFound
      // UI) but with a real HTTP 404 so crawlers stop indexing dead URLs.
      if (!product) return res.status(404).type('html').send(template);
      res.type('html').send(injectProductMeta(template, product));
    } catch (e) {
      console.error('[productMeta] inject failed:', e?.message);
      next();
    }
  });

  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(INDEX_HTML);
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).send('Backend running. Build the frontend with `npm run build` to serve the SPA.');
  });
}

// Bind to 0.0.0.0 so the platform router (Railway/Render/etc.) can reach the app.
// Binding to the default (localhost) causes the proxy to 502 even though the
// server logs that it is "listening".
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MiniYo server listening on 0.0.0.0:${PORT}`);
});
