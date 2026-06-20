import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persist next to the project root so data survives redeploys.
const DB_PATH = process.env.MINIYO_DB_PATH || path.join(__dirname, '..', 'data.db');

// Ensure the parent directory exists (e.g. a mounted volume at /data).
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
} catch { /* dir may already exist */ }

const onMountedVolume = !!process.env.MINIYO_DB_PATH;
const journalMode = process.env.MINIYO_JOURNAL_MODE || (onMountedVolume ? 'DELETE' : 'WAL');

// Open the database. If a previous crash (e.g. WAL on an unsupported volume)
// left a corrupt or half-written file, opening / first integrity check throws.
// In that case, delete the damaged DB + sidecar files and recreate fresh so the
// app can boot and re-seed instead of crash-looping into a 502.
function openDatabase() {
  const candidate = new Database(DB_PATH);
  candidate.pragma('foreign_keys = ON');
  try {
    candidate.pragma(`journal_mode = ${journalMode}`);
  } catch {
    candidate.pragma('journal_mode = DELETE');
  }
  // Touch the file with a trivial query to surface corruption early.
  candidate.prepare('SELECT 1').get();
  return candidate;
}

let _db;
try {
  _db = openDatabase();
} catch (e) {
  console.error(`[db] failed to open ${DB_PATH}: ${e?.message}. Recreating fresh.`);
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { fs.rmSync(DB_PATH + suffix, { force: true }); } catch { /* ignore */ }
  }
  _db = openDatabase();
}
export const db = _db;

// All 28 entities the frontend talks to. Each is stored in a generic table:
//   id TEXT PK, created_date, updated_date, doc JSON
//
// Records store their full payload in the `doc` JSON column with no per-field
// allow-list, so adding new fields to an entity requires no schema/migration
// change here. For discoverability, ProductImage now also carries optional
// non-destructive framing metadata used by the storefront 3:4 card:
//   focal: { x, y }                normalized 0..1, default centre 0.5,0.5
//   crop:  { x, y, width, height } normalized 0..1, optional
// Absent metadata falls back to object-cover / object-center.
export const ENTITIES = [
  'AuditLog', 'Campaign', 'Category', 'CmsSection', 'Collection', 'Customer',
  'CustomerAddress', 'Discount', 'EmailLog', 'Faq', 'FreeDeliveryCredit',
  'InventoryMovement', 'MediaAsset', 'MembershipHistory', 'MembershipSettings',
  'Order', 'OrderItem', 'OrderStatusHistory', 'Overhead', 'Product',
  'ProductImage', 'ProductVariant', 'PromoCode', 'Purchase', 'Review',
  'ShippingZone', 'SiteSetting', 'User', 'WishlistItem',
];

function tableFor(entity) {
  if (!ENTITIES.includes(entity)) {
    const err = new Error(`Unknown entity: ${entity}`);
    err.status = 404;
    throw err;
  }
  return `e_${entity}`;
}

export function initSchema() {
  for (const entity of ENTITIES) {
    const table = `e_${entity}`;
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        created_date TEXT NOT NULL,
        updated_date TEXT NOT NULL,
        doc TEXT NOT NULL
      );
    `);
  }
  // Auth credentials live outside the generic doc model so password hashes
  // are never returned through the entity CRUD surface.
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_credentials (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      created_date TEXT NOT NULL
    );
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);`);
}

function rowToRecord(row) {
  if (!row) return null;
  const doc = JSON.parse(row.doc);
  return {
    ...doc,
    id: row.id,
    _id: row.id, // legacy alias used by a couple of frontend spots
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function createRecord(entity, data = {}, opts = {}) {
  const table = tableFor(entity);
  const id = data.id || opts.id || randomUUID();
  const created = data.created_date || nowIso();
  const updated = data.updated_date || created;
  const doc = { ...data };
  delete doc.id;
  delete doc._id;
  delete doc.created_date;
  delete doc.updated_date;
  db.prepare(
    `INSERT INTO ${table} (id, created_date, updated_date, doc) VALUES (?, ?, ?, ?)`
  ).run(id, created, updated, JSON.stringify(doc));
  return getRecord(entity, id);
}

export function bulkCreate(entity, items = []) {
  const tx = db.transaction((list) => list.map((it) => createRecord(entity, it)));
  return tx(items);
}

export function getRecord(entity, id) {
  const table = tableFor(entity);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  return rowToRecord(row);
}

export function updateRecord(entity, id, patch = {}) {
  const table = tableFor(entity);
  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!existing) {
    const err = new Error('Record not found');
    err.status = 404;
    throw err;
  }
  const doc = JSON.parse(existing.doc);
  const merged = { ...doc, ...patch };
  delete merged.id;
  delete merged._id;
  delete merged.created_date;
  delete merged.updated_date;
  const updated = nowIso();
  db.prepare(`UPDATE ${table} SET doc = ?, updated_date = ? WHERE id = ?`).run(
    JSON.stringify(merged), updated, id
  );
  return getRecord(entity, id);
}

export function deleteRecord(entity, id) {
  const table = tableFor(entity);
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return { ok: true, id };
}

function matchesFilter(record, query) {
  for (const [key, val] of Object.entries(query || {})) {
    if (val === undefined) continue;
    if (key === 'id' || key === '_id') {
      if (record.id !== val) return false;
      continue;
    }
    // Loose equality so '5' from the frontend matches a numeric 5 in the doc.
    const rv = record[key];
    if (Array.isArray(val)) {
      if (!val.includes(rv)) return false;
    } else if (rv !== val && String(rv ?? '') !== String(val ?? '')) {
      return false;
    }
  }
  return true;
}

function applySort(records, sort) {
  if (!sort || typeof sort !== 'string') return records;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const sorted = [...records].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv), undefined, { numeric: true });
  });
  return desc ? sorted.reverse() : sorted;
}

// Generic query used by both list() and filter(). Returns an array.
export function queryRecords(entity, { query = {}, sort = null, limit = null } = {}) {
  const table = tableFor(entity);
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  let records = rows.map(rowToRecord);
  if (query && Object.keys(query).length > 0) {
    records = records.filter((r) => matchesFilter(r, query));
  }
  if (sort) records = applySort(records, sort);
  if (limit != null && Number.isFinite(Number(limit))) {
    records = records.slice(0, Number(limit));
  }
  return records;
}

export function countRecords(entity) {
  const table = tableFor(entity);
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
}

export function kvGet(key) {
  const row = db.prepare(`SELECT v FROM kv WHERE k = ?`).get(key);
  return row ? row.v : null;
}

export function kvSet(key, value) {
  db.prepare(`INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(key, value);
}

// ── Auth credential helpers ────────────────────────────────────────────────
export function getCredentialByEmail(email) {
  return db.prepare(`SELECT * FROM auth_credentials WHERE email = ?`).get(String(email).toLowerCase());
}

export function getCredentialByUserId(userId) {
  return db.prepare(`SELECT * FROM auth_credentials WHERE user_id = ?`).get(userId);
}

export function createCredential(userId, email, passwordHash) {
  db.prepare(
    `INSERT INTO auth_credentials (user_id, email, password_hash, created_date) VALUES (?, ?, ?, ?)`
  ).run(userId, String(email).toLowerCase(), passwordHash, nowIso());
}

export function updateCredentialPassword(userId, passwordHash) {
  db.prepare(`UPDATE auth_credentials SET password_hash = ? WHERE user_id = ?`).run(passwordHash, userId);
}
