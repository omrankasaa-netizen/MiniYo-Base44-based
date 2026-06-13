import { createRecord, getRecord, updateRecord, queryRecords, bulkCreate, nowIso } from './db.js';
import { sendEmail } from './email.js';

// All functions return a plain object. The HTTP layer wraps it as { data, status }.
// `user` is the authenticated user (or null for public-invokable functions).

// ─── Inventory Engine ───────────────────────────────────────────────────────
async function getProductById(productId) {
  const r = queryRecords('Product', { query: { id: productId }, limit: 1 });
  return r[0] || null;
}

async function getVariant(productId, size, color) {
  const all = queryRecords('ProductVariant', { query: { product_id: productId } });
  return all.find((v) =>
    (size ? v.size === size : true) && (color ? v.color === color : true)
  ) || null;
}

function checkStock({ order_id }) {
  const items = queryRecords('OrderItem', { query: { order_id } });
  const shortages = [];
  for (const item of items) {
    const product = queryRecords('Product', { query: { id: item.product_id }, limit: 1 })[0];
    if (!product) continue;
    if ((product.has_variants && item.size) || item.color) {
      const variant = queryRecords('ProductVariant', { query: { product_id: item.product_id } })
        .find((v) => (item.size ? v.size === item.size : true) && (item.color ? v.color === item.color : true));
      if (!variant) {
        shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Variant not found' });
        continue;
      }
      const available = (variant.qty_on_hand || 0) - (variant.qty_reserved || 0);
      if (available < item.quantity) {
        shortages.push({ name: `${item.product_name} (${[item.size, item.color].filter(Boolean).join(', ')})`, available, needed: item.quantity });
      }
    } else {
      const available = product.stock_quantity || 0;
      if (available < item.quantity) {
        shortages.push({ name: item.product_name, available, needed: item.quantity });
      }
    }
  }
  return { ok: shortages.length === 0, shortages };
}

function commitStock({ order_id }, user) {
  const o = queryRecords('Order', { query: { id: order_id }, limit: 1 })[0];
  if (!o) return { _status: 404, error: 'Order not found' };
  if (o.stock_committed) return { ok: true, message: 'Stock already committed' };

  const check = checkStock({ order_id });
  if (!check.ok) return { _status: 409, ok: false, shortages: check.shortages };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const movements = [];
  const reason = `Order ${o.order_number || order_id} confirmed`;
  const by = user?.email || 'system';

  for (const item of items) {
    const product = queryRecords('Product', { query: { id: item.product_id }, limit: 1 })[0];
    if (!product) continue;
    if (product.has_variants && (item.size || item.color)) {
      const variant = queryRecords('ProductVariant', { query: { product_id: item.product_id } })
        .find((v) => (item.size ? v.size === item.size : true) && (item.color ? v.color === item.color : true));
      if (!variant) continue;
      const prev = variant.qty_on_hand || 0;
      const next = prev - item.quantity;
      updateRecord('ProductVariant', variant.id, { qty_on_hand: next });
      movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
    } else {
      const prev = product.stock_quantity || 0;
      const next = prev - item.quantity;
      updateRecord('Product', item.product_id, { stock_quantity: next });
      movements.push({ product_id: item.product_id, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
    }
  }
  if (movements.length) bulkCreate('InventoryMovement', movements);
  updateRecord('Order', order_id, { stock_committed: true });
  return { ok: true, movements_created: movements.length };
}

function releaseStock({ order_id }, user) {
  const o = queryRecords('Order', { query: { id: order_id }, limit: 1 })[0];
  if (!o) return { _status: 404, error: 'Order not found' };
  if (!o.stock_committed) return { ok: true, message: 'Stock was never committed, nothing to release' };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const movements = [];
  const reason = `Order ${o.order_number || order_id} cancelled`;
  const by = user?.email || 'system';

  for (const item of items) {
    const product = queryRecords('Product', { query: { id: item.product_id }, limit: 1 })[0];
    if (!product) continue;
    if (product.has_variants && (item.size || item.color)) {
      const variant = queryRecords('ProductVariant', { query: { product_id: item.product_id } })
        .find((v) => (item.size ? v.size === item.size : true) && (item.color ? v.color === item.color : true));
      if (!variant) continue;
      const prev = variant.qty_on_hand || 0;
      const next = prev + item.quantity;
      updateRecord('ProductVariant', variant.id, { qty_on_hand: next });
      movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
    } else {
      const prev = product.stock_quantity || 0;
      const next = prev + item.quantity;
      updateRecord('Product', item.product_id, { stock_quantity: next });
      movements.push({ product_id: item.product_id, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
    }
  }
  if (movements.length) bulkCreate('InventoryMovement', movements);
  updateRecord('Order', order_id, { stock_committed: false });
  return { ok: true, movements_created: movements.length };
}

function manualAdjust({ product_id, variant_sku, new_qty, movement_type, reason }, user) {
  if (!['Received', 'Correction', 'Damaged'].includes(movement_type)) {
    return { _status: 400, error: 'Invalid movement_type. Use Received, Correction, or Damaged.' };
  }
  let prev, delta;
  if (variant_sku) {
    const v = queryRecords('ProductVariant', { query: { variant_sku }, limit: 1 })[0];
    if (!v) return { _status: 404, error: 'Variant not found' };
    prev = v.qty_on_hand || 0;
    delta = new_qty - prev;
    updateRecord('ProductVariant', v.id, { qty_on_hand: new_qty });
  } else {
    const p = queryRecords('Product', { query: { id: product_id }, limit: 1 })[0];
    if (!p) return { _status: 404, error: 'Product not found' };
    prev = p.stock_quantity || 0;
    delta = new_qty - prev;
    updateRecord('Product', product_id, { stock_quantity: new_qty });
  }
  createRecord('InventoryMovement', {
    product_id,
    variant_sku: variant_sku || null,
    type: movement_type,
    quantity: delta,
    previous_stock: prev,
    new_stock: new_qty,
    reason: reason || `Manual ${movement_type.toLowerCase()} adjustment`,
    created_at: nowIso(),
    created_by: user?.email || 'system',
  });
  return { ok: true, previous_stock: prev, new_stock: new_qty, delta };
}

function inventoryEngine(body, user) {
  if (!user) return { _status: 401, error: 'Unauthorized' };
  const { action } = body;
  if (action === 'check_stock') return checkStock(body);
  if (action === 'commit_stock') return commitStock(body, user);
  if (action === 'release_stock') return releaseStock(body, user);
  if (action === 'manual_adjust') return manualAdjust(body, user);
  return { _status: 400, error: 'Unknown action' };
}

// ─── Membership Engine ──────────────────────────────────────────────────────
function membershipEngine(body) {
  const { action, customer_id } = body;
  const settings = queryRecords('MembershipSettings', {})[0] || {};

  const expiresAt = settings.credit_expiry_days && settings.credit_expiry_days > 0
    ? new Date(Date.now() + settings.credit_expiry_days * 86400000).toISOString()
    : null;

  if (action === 'grant_bronze_credits') {
    const bronzeCredits = settings.bronze_credits ?? 2;
    for (let i = 0; i < bronzeCredits; i++) {
      createRecord('FreeDeliveryCredit', {
        customer_id, source_tier: 'Bronze', granted_at: nowIso(), expires_at: expiresAt, status: 'available',
      });
    }
    if (customer_id && getRecord('Customer', customer_id)) {
      updateRecord('Customer', customer_id, {
        current_tier: 'Bronze', free_delivery_credits_remaining: bronzeCredits,
      });
    }
    return { success: true, creditsGranted: bronzeCredits };
  }

  if (action === 'check_tier_upgrade') {
    const customer = getRecord('Customer', customer_id);
    if (!customer) return { _status: 404, error: 'Customer not found' };
    const silverThreshold = settings.silver_threshold_usd ?? 100;
    const silverCredits = settings.silver_credits ?? 4;
    const goldThreshold = settings.gold_threshold_usd ?? 250;
    const goldCredits = settings.gold_credits ?? 6;
    const spend = customer.lifetime_spend_usd || 0;
    const currentTier = customer.current_tier || 'Bronze';
    let upgraded = false;
    let newTier = currentTier;

    if (currentTier !== 'Gold' && spend >= silverThreshold && !customer.silver_granted) {
      for (let i = 0; i < silverCredits; i++) {
        createRecord('FreeDeliveryCredit', { customer_id, source_tier: 'Silver', granted_at: nowIso(), expires_at: expiresAt, status: 'available' });
      }
      updateRecord('Customer', customer_id, {
        current_tier: 'Silver', silver_granted: true,
        free_delivery_credits_remaining: (customer.free_delivery_credits_remaining || 0) + silverCredits,
      });
      newTier = 'Silver';
      upgraded = true;
    }
    if (spend >= goldThreshold && !customer.gold_granted) {
      const fresh = getRecord('Customer', customer_id);
      for (let i = 0; i < goldCredits; i++) {
        createRecord('FreeDeliveryCredit', { customer_id, source_tier: 'Gold', granted_at: nowIso(), expires_at: expiresAt, status: 'available' });
      }
      updateRecord('Customer', customer_id, {
        current_tier: 'Gold', gold_granted: true,
        free_delivery_credits_remaining: (fresh.free_delivery_credits_remaining || 0) + goldCredits,
      });
      newTier = 'Gold';
      upgraded = true;
    }
    return { upgraded, newTier };
  }

  if (action === 'consume_credit') {
    const credits = queryRecords('FreeDeliveryCredit', {
      query: { customer_id, status: 'available' }, sort: 'granted_at', limit: 1,
    });
    if (credits.length === 0) return { consumed: false, reason: 'No available credits' };
    const credit = credits[0];
    updateRecord('FreeDeliveryCredit', credit.id, { status: 'used', used_at: nowIso(), used_on_order: '' });
    const customer = getRecord('Customer', customer_id);
    const remaining = Math.max(0, (customer?.free_delivery_credits_remaining || 1) - 1);
    if (customer) updateRecord('Customer', customer_id, { free_delivery_credits_remaining: remaining });
    return { consumed: true, creditsRemaining: remaining };
  }

  if (action === 'expire_old_credits') {
    if (!settings.credit_expiry_days || settings.credit_expiry_days <= 0) return { expired: 0 };
    const credits = queryRecords('FreeDeliveryCredit', { query: { status: 'available' }, sort: '-granted_at', limit: 1000 });
    let expiredCount = 0;
    const now = new Date();
    for (const credit of credits) {
      if (credit.expires_at && new Date(credit.expires_at) < now) {
        updateRecord('FreeDeliveryCredit', credit.id, { status: 'expired' });
        const customer = getRecord('Customer', credit.customer_id);
        if (customer && customer.free_delivery_credits_remaining > 0) {
          updateRecord('Customer', credit.customer_id, { free_delivery_credits_remaining: customer.free_delivery_credits_remaining - 1 });
        }
        expiredCount++;
      }
    }
    return { expired: expiredCount };
  }

  return { _status: 400, error: 'Unknown action' };
}

// ─── Seed Shipping Zones ──────────────────────────────────────────────────────
export const DEFAULT_SHIPPING_ZONES = [
  { area_name: 'Tripoli', area_name_ar: 'طرابلس', fee_usd: 4, is_active: true, is_catchall: false, sort_order: 0 },
  { area_name: 'Koura', area_name_ar: 'الكورة', fee_usd: 4, is_active: true, is_catchall: false, sort_order: 1 },
  { area_name: 'Beirut', area_name_ar: 'بيروت', fee_usd: 5, is_active: true, is_catchall: false, sort_order: 2 },
  { area_name: 'Akkar', area_name_ar: 'عكار', fee_usd: 5, is_active: true, is_catchall: false, sort_order: 3 },
  { area_name: 'All other areas / districts', area_name_ar: 'جميع المناطق الأخرى', fee_usd: 6, is_active: true, is_catchall: true, sort_order: 99 },
];

function seedShippingZones(body, user) {
  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    return { _status: 403, error: 'Forbidden: Admin access required' };
  }
  const existing = queryRecords('ShippingZone', { sort: 'sort_order', limit: 100 });
  if (existing.length > 0) return { message: 'Zones already exist', count: existing.length };
  const created = bulkCreate('ShippingZone', DEFAULT_SHIPPING_ZONES);
  return { message: 'Default zones seeded', count: created.length };
}

// ─── Email functions ──────────────────────────────────────────────────────────
async function sendOrderConfirmation(body) {
  const { order_id } = body;
  if (!order_id) return { _status: 400, error: 'order_id required' };
  const order = getRecord('Order', order_id);
  if (!order) return { _status: 404, error: 'Order not found' };

  const already = queryRecords('EmailLog', {
    query: { email_type: 'order_confirmation', order_id, status: 'sent' }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: 'Confirmation email already sent for this order' };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const itemsHtml = items.map((it) =>
    `<tr><td>${it.product_name} ${[it.size, it.color].filter(Boolean).join(' / ')}</td><td>×${it.quantity}</td><td>$${Number(it.unit_price_usd || 0).toFixed(2)}</td><td>$${Number(it.line_total_usd || 0).toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><body><h2>Order Confirmation</h2>
    <p>Order #: <strong>${order.order_number}</strong></p>
    <table border="1" cellpadding="6"><tbody>${itemsHtml}</tbody></table>
    <p>Subtotal: $${Number(order.subtotal_usd || 0).toFixed(2)}<br/>
    Discount: $${Number(order.discount_usd || 0).toFixed(2)}<br/>
    Delivery: $${Number(order.delivery_fee_usd || 0).toFixed(2)}<br/>
    <strong>Total: $${Number(order.grand_total_usd || 0).toFixed(2)}</strong></p>
    <p>Payment: ${order.payment_method}</p></body></html>`;

  const result = await sendEmail({
    to: order.customer_email, subject: 'Order Confirmation', html,
    email_type: 'order_confirmation', order_id, trigger_event: 'order_created',
  });
  return { status: result.status, log_id: result.log_id };
}

const STATUS_TEMPLATES = {
  Confirmed: { subject: 'Order Confirmed', message: "Your order has been confirmed and we're preparing it for shipment." },
  Packed: { subject: 'Order Packed', message: 'Your order has been packed and is ready to ship.' },
  'Out for Delivery': { subject: 'Out for Delivery', message: 'Your order is on its way to you.' },
  Delivered: { subject: 'Order Delivered', message: 'Your order has been delivered. We hope you enjoy!' },
  Cancelled: { subject: 'Order Cancelled', message: 'Your order has been cancelled. If you have any questions, please contact us.' },
};

async function sendOrderStatusUpdate(body) {
  const { order_id, new_status } = body;
  if (!order_id || !new_status) return { _status: 400, error: 'order_id and new_status required' };
  if (!STATUS_TEMPLATES[new_status]) return { _status: 400, error: 'Invalid status' };
  const order = getRecord('Order', order_id);
  if (!order) return { _status: 404, error: 'Order not found' };

  const trigger = `status_changed_to_${new_status}`;
  const already = queryRecords('EmailLog', {
    query: { email_type: 'order_status_update', order_id, status: 'sent', trigger_event: trigger }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: `${new_status} email already sent` };

  const tpl = STATUS_TEMPLATES[new_status];
  const html = `<!DOCTYPE html><html><body><h2>${tpl.subject}</h2><p>${tpl.message}</p>
    <p>Order #: <strong>${order.order_number}</strong><br/>Status: ${new_status}<br/>
    Total: $${Number(order.grand_total_usd || 0).toFixed(2)}</p></body></html>`;

  const result = await sendEmail({
    to: order.customer_email, subject: tpl.subject, html,
    email_type: 'order_status_update', order_id, trigger_event: trigger,
  });
  return { status: result.status, log_id: result.log_id };
}

async function sendWelcomeEmailNew(body) {
  const { customer_id, email } = body;
  if (!customer_id || !email) return { _status: 400, error: 'customer_id and email required' };
  const already = queryRecords('EmailLog', {
    query: { email_type: 'welcome', customer_id, status: 'sent' }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: 'Welcome email already sent' };

  const html = `<!DOCTYPE html><html><body><h1>Welcome to MiniYo! 🎉</h1>
    <p>You're now a Bronze member with exclusive benefits!</p>
    <ul><li>2 Free Deliveries on your first orders</li><li>5% off all purchases</li>
    <li>Auto-upgrade to Silver & Gold tiers</li></ul></body></html>`;

  const result = await sendEmail({
    to: email, subject: 'Welcome to MiniYo', html,
    email_type: 'welcome', customer_id, trigger_event: 'account_created',
  });
  return { status: result.status, log_id: result.log_id };
}

const REGISTRY = {
  inventoryEngine,
  membershipEngine,
  seedShippingZones,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendWelcomeEmailNew,
};

export async function invokeFunction(name, body, user) {
  const fn = REGISTRY[name];
  if (!fn) {
    const err = new Error(`Unknown function: ${name}`);
    err.status = 404;
    throw err;
  }
  return await fn(body || {}, user);
}
