// Authorization + money-stripping tests for the customer/export functions added
// in the customers-exports upgrade. Verifies:
//   • new export + customer functions reject guests (401) and staff (403)
//   • money fields (total_spent, aov, per-order totals, cost columns) are
//     stripped SERVER-SIDE for a regular admin but present for a super_admin
//   • tag / notes / block mutations persist and write an AuditLog entry
//   • upsertCustomer creates and edits records
//
//   Run: npm test    (or: node --test tests/)

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(os.tmpdir(), `miniyo-customers-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_DB_PATH = tmpDb;

const db = await import('../server/db.js');
db.initSchema();
const { invokeFunction } = await import('../server/functions.js');

const superA = db.createRecord('User', { email: 'owner@miniyo.store', role: 'super_admin', full_name: 'Owner' });
const adminU = db.createRecord('User', { email: 'admin@miniyo.store', role: 'admin', full_name: 'Admin' });
const staffU = db.createRecord('User', { email: 'staff@miniyo.store', role: 'staff', full_name: 'Staff' });

// Seed a customer with two orders (one cancelled) + a product with a cost.
const cust = db.createRecord('Customer', { name: 'Jane Doe', email: 'jane@example.com', phone: '03123456', membership_tier: 'Silver' });
db.createRecord('Order', { customer_id: cust.id, customer_email: 'jane@example.com', order_status: 'Delivered', grand_total_usd: 80, order_date: '2026-06-01', order_number: 'A1', city: 'Beirut', district: 'Hamra' });
db.createRecord('Order', { customer_id: cust.id, customer_email: 'jane@example.com', order_status: 'Cancelled', grand_total_usd: 999, order_date: '2026-05-01', order_number: 'A2' });
db.createRecord('Product', { name: 'Tee', sku: 'TEE-1', price_usd: 20, cost_usd: 8, stock_quantity: 5, status: 'Active' });

test.after(() => { try { fs.rmSync(tmpDb, { force: true }); } catch { /* ignore */ } });

const isDenied = (res, status) => res && typeof res === 'object' && res._status === status;

const NEW_ADMIN_FNS = [
  'exportProductsCsv', 'exportInventoryCsv', 'exportCustomersCsv',
  'exportCustomerEmailsCsv', 'listCustomers', 'getCustomerDetail',
  'setCustomerTags', 'setCustomerNotes', 'setCustomerBlock', 'upsertCustomer',
];

for (const name of NEW_ADMIN_FNS) {
  test(`${name}: 401 guest, 403 staff, allowed for admin`, async () => {
    assert.ok(isDenied(await invokeFunction(name, {}, null), 401), `${name} should 401 for guest`);
    assert.ok(isDenied(await invokeFunction(name, {}, staffU), 403), `${name} should 403 for staff`);
    assert.equal(isDenied(await invokeFunction(name, { customer_id: cust.id }, adminU), 403), false, `${name} should allow admin`);
  });
}

test('listCustomers: strips money for admin, includes for super_admin', async () => {
  const asAdmin = await invokeFunction('listCustomers', {}, adminU);
  assert.equal(asAdmin.show_money, false);
  const a = asAdmin.customers.find(c => c.id === cust.id);
  assert.equal('total_spent' in a, false);
  assert.equal('aov' in a, false);
  // Operational fields still present.
  assert.equal(a.order_count, 2);

  const asSuper = await invokeFunction('listCustomers', {}, superA);
  assert.equal(asSuper.show_money, true);
  const s = asSuper.customers.find(c => c.id === cust.id);
  assert.equal('total_spent' in s, true);
  assert.equal(s.total_spent, 80); // cancelled order excluded
});

test('getCustomerDetail: per-order + lifetime money gated', async () => {
  const asAdmin = await invokeFunction('getCustomerDetail', { customer_id: cust.id }, adminU);
  assert.equal(asAdmin.show_money, false);
  assert.equal('total_spent' in asAdmin.metrics, false);
  for (const o of asAdmin.orders) assert.equal('grand_total_usd' in o, false);

  const asSuper = await invokeFunction('getCustomerDetail', { customer_id: cust.id }, superA);
  assert.equal('total_spent' in asSuper.metrics, true);
  assert.ok(asSuper.orders.some(o => 'grand_total_usd' in o));
});

test('getCustomerDetail: 404 unknown, 400 missing id', async () => {
  assert.equal((await invokeFunction('getCustomerDetail', { customer_id: 'nope' }, adminU))._status, 404);
  assert.equal((await invokeFunction('getCustomerDetail', {}, adminU))._status, 400);
});

test('exportCustomersCsv: omits Total Spent column for admin, includes for super', async () => {
  const asAdmin = await invokeFunction('exportCustomersCsv', {}, adminU);
  assert.equal(asAdmin.csv.includes('Total Spent (USD)'), false);
  const asSuper = await invokeFunction('exportCustomersCsv', {}, superA);
  assert.equal(asSuper.csv.includes('Total Spent (USD)'), true);
});

test('exportProductsCsv: cost columns gated; selling price always present', async () => {
  const asAdmin = await invokeFunction('exportProductsCsv', {}, adminU);
  assert.equal(asAdmin.csv.includes('Cost (USD)'), false);
  assert.equal(asAdmin.csv.includes('Selling Price (USD)'), true);
  const asSuper = await invokeFunction('exportProductsCsv', {}, superA);
  assert.equal(asSuper.csv.includes('Cost (USD)'), true);
});

test('exportInventoryCsv: cost/value columns gated', async () => {
  const asAdmin = await invokeFunction('exportInventoryCsv', {}, adminU);
  assert.equal(asAdmin.csv.includes('Unit Cost (USD)'), false);
  const asSuper = await invokeFunction('exportInventoryCsv', {}, superA);
  assert.equal(asSuper.csv.includes('Unit Cost (USD)'), true);
});

test('exportCustomerEmailsCsv: name+email only, excludes blocked', async () => {
  const res = await invokeFunction('exportCustomerEmailsCsv', {}, adminU);
  assert.equal(res.csv.split('\n')[0], 'Name,Email');
  assert.ok(res.csv.includes('jane@example.com'));
});

test('setCustomerTags: persists + writes audit', async () => {
  const before = db.queryRecords('AuditLog', {}).length;
  const res = await invokeFunction('setCustomerTags', { customer_id: cust.id, tags: ['VIP', 'wholesale', 'VIP'] }, adminU);
  assert.equal(res.ok, true);
  assert.deepEqual(res.tags, ['VIP', 'wholesale']); // de-duped
  assert.deepEqual(db.getRecord('Customer', cust.id).tags, ['VIP', 'wholesale']);
  assert.equal(db.queryRecords('AuditLog', {}).length, before + 1);
});

test('setCustomerNotes: persists', async () => {
  const res = await invokeFunction('setCustomerNotes', { customer_id: cust.id, notes: 'Prefers pickup' }, adminU);
  assert.equal(res.ok, true);
  assert.equal(db.getRecord('Customer', cust.id).notes, 'Prefers pickup');
});

test('setCustomerBlock: block then unblock with audit', async () => {
  const blocked = await invokeFunction('setCustomerBlock', { customer_id: cust.id, blocked: true, reason: 'fraud' }, adminU);
  assert.equal(blocked.is_blocked, true);
  assert.equal(db.getRecord('Customer', cust.id).block_reason, 'fraud');
  const unblocked = await invokeFunction('setCustomerBlock', { customer_id: cust.id, blocked: false }, adminU);
  assert.equal(unblocked.is_blocked, false);
  assert.equal(db.getRecord('Customer', cust.id).block_reason, '');
});

test('upsertCustomer: creates and edits', async () => {
  const created = await invokeFunction('upsertCustomer', { name: 'New Guy', email: 'new@example.com' }, adminU);
  assert.equal(created.ok, true);
  assert.ok(created.customer.id);
  const edited = await invokeFunction('upsertCustomer', { customer_id: created.customer.id, phone: '0700' }, adminU);
  assert.equal(edited.customer.phone, '0700');
  // create with neither name nor email → 400
  assert.equal((await invokeFunction('upsertCustomer', { phone: 'x' }, adminU))._status, 400);
});
