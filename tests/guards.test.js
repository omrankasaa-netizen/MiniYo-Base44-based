// Authorization tests for the centralized function guard (server/functions.js).
//
// Verifies that finance + user-management functions REJECT non-super-admin
// callers with HTTP 403 (and unauthenticated callers with 401) and ALLOW
// super-admins, and that admin-level functions (dashboard/CSV) reject non-admins
// but allow admin + super_admin. Runs hermetically against a throwaway SQLite
// file — no network or external services.
//
//   Run: npm test         (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the DB at a fresh temp file BEFORE importing modules that open it.
const tmpDb = path.join(os.tmpdir(), `miniyo-guards-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_DB_PATH = tmpDb;

const db = await import('../server/db.js');
db.initSchema();
const { invokeFunction, authorizeFunction } = await import('../server/functions.js');

// Seed two super-admins (so a demotion is allowed by the last-super-admin guard),
// one admin, one staff, one customer.
const superA = db.createRecord('User', { email: 'owner@miniyo.store', role: 'super_admin', full_name: 'Owner A' });
const superB = db.createRecord('User', { email: 'owner2@miniyo.store', role: 'super_admin', full_name: 'Owner B' });
const adminU = db.createRecord('User', { email: 'admin@miniyo.store', role: 'admin', full_name: 'Reg Admin' });
const staffU = db.createRecord('User', { email: 'staff@miniyo.store', role: 'staff', full_name: 'Staff' });
const targetU = db.createRecord('User', { email: 'target@miniyo.store', role: 'staff', full_name: 'Target' });

test.after(() => { try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ } });

const SUPER_ONLY = ['getFinancialsConfig', 'saveFinancialsConfig', 'listUsers', 'setUserRole'];
const ADMIN_LEVEL = ['getDashboardMetrics', 'exportOrdersCsv'];

function isDenied(res, status) {
  return res && typeof res === 'object' && res._status === status;
}

// ── authorizeFunction unit checks ────────────────────────────────────────────
test('authorizeFunction: super_admin level', () => {
  assert.equal(authorizeFunction('super_admin', superA), null);
  assert.equal(authorizeFunction('super_admin', adminU)._status, 403);
  assert.equal(authorizeFunction('super_admin', staffU)._status, 403);
  assert.equal(authorizeFunction('super_admin', null)._status, 401);
});

test('authorizeFunction: admin level', () => {
  assert.equal(authorizeFunction('admin', superA), null);
  assert.equal(authorizeFunction('admin', adminU), null);
  assert.equal(authorizeFunction('admin', staffU)._status, 403);
  assert.equal(authorizeFunction('admin', null)._status, 401);
});

// ── Super-admin-only functions reject non-super callers ──────────────────────
for (const name of SUPER_ONLY) {
  test(`${name}: 401 unauthenticated, 403 admin, 403 staff`, async () => {
    assert.ok(isDenied(await invokeFunction(name, {}, null), 401), `${name} should 401 for guest`);
    assert.ok(isDenied(await invokeFunction(name, {}, adminU), 403), `${name} should 403 for admin`);
    assert.ok(isDenied(await invokeFunction(name, {}, staffU), 403), `${name} should 403 for staff`);
  });
}

test('listUsers: allowed for super_admin', async () => {
  const res = await invokeFunction('listUsers', {}, superA);
  assert.ok(Array.isArray(res.users));
  assert.ok(res.users.length >= 5);
  // Credential fields must never be returned.
  for (const u of res.users) {
    assert.equal('password_hash' in u, false);
    assert.equal('otp_hash' in u, false);
  }
});

test('getFinancialsConfig: allowed for super_admin (no 403)', async () => {
  const res = await invokeFunction('getFinancialsConfig', {}, superA);
  assert.equal(isDenied(res, 403), false);
});

// ── Admin-level functions: reject non-admins, allow admin + super_admin ──────
for (const name of ADMIN_LEVEL) {
  test(`${name}: 401 guest, 403 staff, allowed for admin & super_admin`, async () => {
    assert.ok(isDenied(await invokeFunction(name, {}, null), 401));
    assert.ok(isDenied(await invokeFunction(name, {}, staffU), 403));
    assert.equal(isDenied(await invokeFunction(name, {}, adminU), 403), false);
    assert.equal(isDenied(await invokeFunction(name, {}, superA), 403), false);
  });
}

// ── Dashboard money-stripping (Task 7) ───────────────────────────────────────
test('getDashboardMetrics: strips money for admin, includes for super_admin', async () => {
  const asAdmin = await invokeFunction('getDashboardMetrics', {}, adminU);
  assert.equal(asAdmin.show_money, false);
  assert.equal('revenue' in asAdmin.orders.last30, false);
  assert.equal('inventory_cost' in asAdmin.products, false);
  assert.equal('aov30' in asAdmin.orders, false);

  const asSuper = await invokeFunction('getDashboardMetrics', {}, superA);
  assert.equal(asSuper.show_money, true);
  assert.equal('revenue' in asSuper.orders.last30, true);
});

test('exportOrdersCsv: omits money columns for admin, includes for super_admin', async () => {
  const asAdmin = await invokeFunction('exportOrdersCsv', {}, adminU);
  assert.equal(asAdmin.csv.includes('Grand Total (USD)'), false);
  const asSuper = await invokeFunction('exportOrdersCsv', {}, superA);
  assert.equal(asSuper.csv.includes('Grand Total (USD)'), true);
});

// ── setUserRole behavior (Tasks 1 + 3) ───────────────────────────────────────
test('setUserRole: validates role value', async () => {
  const res = await invokeFunction('setUserRole', { user_id: targetU.id, role: 'wizard' }, superA);
  assert.equal(res._status, 400);
});

test('setUserRole: promotes a staff user to admin and writes audit', async () => {
  const before = db.queryRecords('AuditLog', {}).length;
  const res = await invokeFunction('setUserRole', { user_id: targetU.id, role: 'admin' }, superA);
  assert.equal(res.ok, true);
  assert.equal(res.new_role, 'admin');
  assert.equal(db.getRecord('User', targetU.id).role, 'admin');
  const after = db.queryRecords('AuditLog', {}).length;
  assert.equal(after, before + 1);
});

test('setUserRole: refuses to demote the last super admin', async () => {
  // Demote superB first — allowed because superA still remains.
  const ok = await invokeFunction('setUserRole', { user_id: superB.id, role: 'admin' }, superA);
  assert.equal(ok.ok, true);
  // Now superA is the only super admin; demoting it must be blocked (409).
  const blocked = await invokeFunction('setUserRole', { user_id: superA.id, role: 'admin' }, superA);
  assert.equal(blocked._status, 409);
  assert.equal(db.getRecord('User', superA.id).role, 'super_admin');
});

test('setUserRole: 404 for unknown user', async () => {
  const res = await invokeFunction('setUserRole', { user_id: 'nope-123', role: 'admin' }, superA);
  assert.equal(res._status, 404);
});
