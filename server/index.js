import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  initSchema, createRecord, getRecord, updateRecord, deleteRecord,
  queryRecords, ENTITIES,
} from './db.js';
import {
  registerUser, authenticate, signToken, setSessionCookie, clearSessionCookie,
  getUserFromRequest, publicUser, findUserByEmail, setPassword, updateUser,
} from './auth.js';
import { invokeFunction } from './functions.js';
import { runSeed } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PORT = process.env.PORT || 4000;

initSchema();
runSeed();

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
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
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
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
    // OTP auto-verify model: registration succeeds immediately, client then calls verifyOtp.
    res.json({ ok: true, email: user.email, requires_otp: true });
  } catch (e) { handleError(res, e); }
});

// OTP auto-verify: any code accepted, returns a real session token.
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { email } = req.body || {};
    const user = findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const token = signToken(user.id);
    setSessionCookie(res, token);
    res.json({ access_token: token, user: publicUser(user) });
  } catch (e) { handleError(res, e); }
});

app.post('/api/auth/resend-otp', (req, res) => {
  res.json({ ok: true });
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
app.post('/api/upload', (req, res) => {
  try {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { filename, content_base64 } = req.body || {};
    if (!content_base64) return res.status(400).json({ error: 'content_base64 required' });
    const base = (filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}`;
    const data = content_base64.includes(',') ? content_base64.split(',')[1] : content_base64;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(data, 'base64'));
    res.json({ file_url: `/uploads/${name}` });
  } catch (e) { handleError(res, e); }
});

// ─── Entity CRUD ────────────────────────────────────────────────────────────
function ensureEntity(req, res, next) {
  if (!ENTITIES.includes(req.params.entity)) {
    return res.status(404).json({ error: `Unknown entity: ${req.params.entity}` });
  }
  next();
}

// Never expose User credential-bearing fields through generic CRUD.
function sanitize(entity, record) {
  if (entity === 'User' && record) {
    const { password_hash, ...rest } = record;
    return rest;
  }
  return record;
}

app.get('/api/entities/:entity', ensureEntity, (req, res) => {
  try {
    const { query, sort, limit } = parseListParams(req);
    const records = queryRecords(req.params.entity, { query, sort, limit })
      .map((r) => sanitize(req.params.entity, r));
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

app.post('/api/entities/:entity', ensureEntity, (req, res) => {
  try {
    const record = createRecord(req.params.entity, req.body || {});
    res.json(sanitize(req.params.entity, record));
  } catch (e) { handleError(res, e); }
});

app.put('/api/entities/:entity/:id', ensureEntity, (req, res) => {
  try {
    const record = updateRecord(req.params.entity, req.params.id, req.body || {});
    res.json(sanitize(req.params.entity, record));
  } catch (e) { handleError(res, e); }
});

app.delete('/api/entities/:entity/:id', ensureEntity, (req, res) => {
  try {
    res.json(deleteRecord(req.params.entity, req.params.id));
  } catch (e) { handleError(res, e); }
});

app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Serve SPA with history fallback ──────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).send('Backend running. Build the frontend with `npm run build` to serve the SPA.');
  });
}

app.listen(PORT, () => {
  console.log(`MiniYo server listening on http://localhost:${PORT}`);
});
