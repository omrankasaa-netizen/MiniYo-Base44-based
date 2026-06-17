// Standalone test for the Resend Automation event integration.
// Run with: RESEND_API_KEY=test node server/test-resend-events.mjs
//
// It stubs global.fetch, exercises all 4 lifecycle paths, and asserts:
//   - each path POSTs to https://api.resend.com/events with the right event name
//     and a payload containing the required camelCase keys with non-empty values;
//   - the 4 customer flows produce NO direct /emails customer send (events only);
//   - sendEmail (OTP/reset/admin) still POSTs to /emails.
// Uses an isolated temp DB so it never touches real data.

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.MINIYO_DB_PATH = path.join(os.tmpdir(), `miniyo-test-${Date.now()}.db`);
process.env.MINIYO_JOURNAL_MODE = 'DELETE';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test_key';

const { initSchema, createRecord, queryRecords } = await import('./db.js');
const { invokeFunction } = await import('./functions.js');
const { sendEmail } = await import('./email.js');

initSchema();

// ── fetch stub ──────────────────────────────────────────────────────────────
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  let body = {};
  try { body = JSON.parse(opts.body || '{}'); } catch { /* ignore */ }
  calls.push({ url, body });
  return { ok: true, status: 200, text: async () => 'ok' };
};

const eventsCalls = () => calls.filter((c) => c.url === 'https://api.resend.com/events');
const emailsCalls = () => calls.filter((c) => c.url === 'https://api.resend.com/emails');
const lastEvent = (name) => [...eventsCalls()].reverse().find((c) => c.body.event === name);

function assertPayloadKeys(payload, keys) {
  for (const k of keys) {
    assert.ok(k in payload, `missing payload key: ${k}`);
    assert.ok(
      payload[k] !== '' && payload[k] !== null && payload[k] !== undefined,
      `payload key "${k}" must be non-empty (got ${JSON.stringify(payload[k])})`
    );
  }
}

const results = {};

// ── 1. order.submitted ───────────────────────────────────────────────────────
const order = createRecord('Order', {
  order_number: 'MY-1001',
  customer_name: 'Sara Khoury',
  customer_email: 'sara@example.com',
  customer_id: 'cust-1',
  grand_total_usd: 42.5,
  order_date: '2026-06-17T10:00:00.000Z',
  payment_method: 'Cash',
  order_status: 'New',
});
createRecord('OrderItem', {
  order_id: order.id, product_name: 'Toy Car', size: 'M', color: 'Red',
  quantity: 2, unit_price_usd: 10, line_total_usd: 20,
});

await invokeFunction('sendOrderConfirmation', { order_id: order.id });
{
  const c = lastEvent('order.submitted');
  assert.ok(c, 'order.submitted event not sent');
  assert.equal(c.body.email, 'sara@example.com');
  assertPayloadKeys(c.body.payload, [
    'customerFirstName', 'orderNumber', 'orderDate', 'orderTotal',
    'orderItemsHtml', 'orderStatusUrl', 'storeName', 'supportEmail',
  ]);
  assert.equal(c.body.payload.customerFirstName, 'Sara');
  assert.equal(c.body.payload.orderNumber, 'MY-1001');
  assert.equal(c.body.payload.orderTotal, '$42.50');
  assert.ok(c.body.payload.orderStatusUrl.startsWith('https://miniyokids.com/account/orders/'));
  assert.ok(c.body.payload.orderItemsHtml.includes('<table'));
  results.order_submitted = c.body;
}

// ── 2. order.confirmed (Confirmed only) ──────────────────────────────────────
await invokeFunction('sendOrderStatusUpdate', { order_id: order.id, new_status: 'Confirmed' });
{
  const c = lastEvent('order.confirmed');
  assert.ok(c, 'order.confirmed event not sent');
  assertPayloadKeys(c.body.payload, [
    'customerFirstName', 'orderNumber', 'orderDate', 'orderTotal',
    'orderItemsHtml', 'orderStatusUrl', 'storeName', 'supportEmail',
  ]);
  results.order_confirmed = c.body;
}

// Control: a NON-confirmed status still uses the direct /emails path.
const emailsBefore = emailsCalls().length;
await invokeFunction('sendOrderStatusUpdate', { order_id: order.id, new_status: 'Packed' });
assert.equal(emailsCalls().length, emailsBefore + 1, 'Packed status should send a direct /emails email');
assert.ok(!lastEvent('order.packed'), 'no event should fire for Packed');

// ── 3. user.registered ───────────────────────────────────────────────────────
await invokeFunction('sendWelcomeEmailNew', {
  customer_id: 'cust-1', email: 'sara@example.com', full_name: 'Sara Khoury',
});
{
  const c = lastEvent('user.registered');
  assert.ok(c, 'user.registered event not sent');
  assert.equal(c.body.email, 'sara@example.com');
  assertPayloadKeys(c.body.payload, [
    'customerFirstName', 'accountDashboardUrl', 'storeName', 'supportEmail',
  ]);
  assert.equal(c.body.payload.accountDashboardUrl, 'https://miniyokids.com/account');
  results.user_registered = c.body;
}

// ── 4. membership.tier.updated ───────────────────────────────────────────────
createRecord('MembershipSettings', {
  silver_threshold_usd: 100, silver_credits: 4, gold_threshold_usd: 250, gold_credits: 6,
});
createRecord('Customer', {
  id: 'cust-2', name: 'Lina Aziz', email: 'lina@example.com',
  current_tier: 'Bronze', lifetime_spend_usd: 120,
  free_delivery_credits_remaining: 0,
}, { id: 'cust-2' });

await invokeFunction('membershipEngine', { action: 'check_tier_upgrade', customer_id: 'cust-2' });
// membershipEngine fires the event fire-and-forget; give the microtask a tick.
await new Promise((r) => setTimeout(r, 50));
{
  const c = lastEvent('membership.tier.updated');
  assert.ok(c, 'membership.tier.updated event not sent');
  assert.equal(c.body.email, 'lina@example.com');
  assertPayloadKeys(c.body.payload, [
    'customerFirstName', 'oldTier', 'newTier', 'membershipBenefitsUrl', 'storeName', 'supportEmail',
  ]);
  assert.equal(c.body.payload.oldTier, 'Bronze');
  assert.equal(c.body.payload.newTier, 'Silver');
  assert.equal(c.body.payload.membershipBenefitsUrl, 'https://miniyokids.com/account/membership');
  results.membership_tier_updated = c.body;
}

// ── Control: sendEmail (OTP/reset/admin) still hits /emails ───────────────────
const emailsBefore2 = emailsCalls().length;
await sendEmail({ to: 'x@example.com', subject: 'OTP', html: '<p>123</p>', email_type: 'otp_verification' });
assert.equal(emailsCalls().length, emailsBefore2 + 1, 'sendEmail must still POST to /emails');

// ── No duplicate customer /emails for the 4 event flows ──────────────────────
// The only /emails sends should be: the Packed status (control) + the OTP (control).
// i.e. NONE of order.submitted/order.confirmed/user.registered/tier.updated added one.
const customerEmailSends = emailsCalls().filter(
  (c) => c.body.to === 'sara@example.com' || c.body.to === 'lina@example.com'
);
const dupForEventFlows = customerEmailSends.filter((c) => c.body.subject !== 'Order Packed');
assert.equal(dupForEventFlows.length, 0,
  `expected no direct customer emails for the 4 event flows, found: ${JSON.stringify(dupForEventFlows.map((c) => c.body.subject))}`);

// ── EmailLog rows written for the events ──────────────────────────────────────
// Each event subject is recorded as `event:<name>` by sendResendEvent. (Note:
// order.confirmed keeps its status idempotency trigger `status_changed_to_Confirmed`.)
await new Promise((r) => setTimeout(r, 50));
const eventSubjects = queryRecords('EmailLog', {})
  .map((l) => l.subject)
  .filter((s) => typeof s === 'string' && s.startsWith('event:'));
for (const name of ['order.submitted', 'order.confirmed', 'user.registered', 'membership.tier.updated']) {
  assert.ok(eventSubjects.includes(`event:${name}`), `expected EmailLog row for event ${name}`);
}

console.log('ALL TESTS PASSED');
console.log('Events POSTed to api.resend.com/events:', eventsCalls().map((c) => c.body.event));
console.log('Captured payloads:');
console.log(JSON.stringify(results, null, 2));

// Cleanup temp DB.
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  try { fs.rmSync(process.env.MINIYO_DB_PATH + suffix, { force: true }); } catch { /* ignore */ }
}
