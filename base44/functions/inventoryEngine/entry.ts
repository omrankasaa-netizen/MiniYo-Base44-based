import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Inventory Engine
 *
 * NOTE: This Base44-hosted Deno mirror is kept IN SYNC with the executed
 * implementation in server/functions.js (the self-hosted Express server is the
 * one actually running). Because the Base44 document store exposes no
 * transaction primitive here, reserve_stock does a re-read immediately before
 * write — the tightest compare-and-set the platform allows. The authoritative
 * atomicity guarantee (a synchronous better-sqlite3 db.transaction) lives in
 * server/functions.js.
 *
 * Actions:
 *   - check_stock    : report shortages (available = on_hand - reserved)
 *   - reserve_stock  : hold inventory at order PLACEMENT (increment qty_reserved)
 *   - commit_stock   : reservation → sale at Confirmation (on_hand-=, reserved-=)
 *   - release_stock  : free stock at Cancellation (reserved-= or on_hand+=)
 *   - manual_adjust  : admin manual stock adjustment
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    const body = await req.json();
    const { action } = body;

    // check_stock / reserve_stock are reachable during guest checkout.
    if (action === 'check_stock') {
      return await checkStock(base44, body);
    }
    if (action === 'reserve_stock') {
      return await reserveStock(base44, body, user);
    }
    // Mutating admin actions require an authenticated admin.
    if (action === 'commit_stock' || action === 'release_stock' || action === 'manual_adjust') {
      if (!user || !(user.role === 'admin' || user.role === 'super_admin')) {
        return Response.json({ error: 'Forbidden' }, { status: user ? 403 : 401 });
      }
      if (action === 'commit_stock') return await commitStock(base44, body, user);
      if (action === 'release_stock') return await releaseStock(base44, body, user);
      return await manualAdjust(base44, body, user);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Check stock availability before confirming ───────────────────────────────
async function checkStock(base44, { order_id }) {
  const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });
  const shortages = [];

  for (const item of items) {
    const product = await getProductById(base44, item.product_id);
    if (!product) continue;

    if (product.has_variants && item.size || item.color) {
      const variant = await getVariant(base44, item.product_id, item.size, item.color);
      if (!variant) {
        shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Variant not found' });
        continue;
      }
      const available = variant.qty_on_hand - (variant.qty_reserved || 0);
      if (available < item.quantity) {
        shortages.push({ name: `${item.product_name} (${[item.size, item.color].filter(Boolean).join(', ')})`, available, needed: item.quantity });
      }
    } else {
      const available = (product.stock_quantity || 0) - (product.qty_reserved || 0);
      if (available < item.quantity) {
        shortages.push({ name: item.product_name, available, needed: item.quantity });
      }
    }
  }

  return Response.json({ ok: shortages.length === 0, shortages });
}

// ─── Reserve stock at order PLACEMENT ────────────────────────────────────────
// Holds inventory (qty_reserved += qty) so a placed-but-unconfirmed order makes
// its units unavailable to everyone else. On any shortage nothing is reserved
// and the order is cancelled. qty_on_hand is never touched here.
async function reserveStock(base44, { order_id }, user) {
  const order = await base44.asServiceRole.entities.Order.filter({ id: order_id });
  const o = order[0];
  if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
  if (o.stock_committed) return Response.json({ ok: true, message: 'Stock already committed' });
  if (o.stock_reserved) return Response.json({ ok: true, message: 'Stock already reserved' });

  const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });
  const reason = `Order ${o.order_number || order_id} placed`;
  const by = user?.email || 'system';

  // Pass 1: validate every line against fresh availability.
  const plan = [];
  const shortages = [];
  for (const item of items) {
    const product = await getProductById(base44, item.product_id);
    if (!product) { shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Product not found' }); continue; }
    if (product.has_variants && (item.size || item.color)) {
      const variant = await getVariant(base44, item.product_id, item.size, item.color);
      if (!variant) { shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Variant not found' }); continue; }
      const reservedBefore = variant.qty_reserved || 0;
      const available = (variant.qty_on_hand || 0) - reservedBefore;
      if (available < item.quantity) shortages.push({ name: `${item.product_name} (${[item.size, item.color].filter(Boolean).join(', ')})`, available, needed: item.quantity });
      else plan.push({ kind: 'variant', id: variant.id, product_id: item.product_id, variant_sku: variant.variant_sku, qty: item.quantity, reservedBefore, available });
    } else {
      const reservedBefore = product.qty_reserved || 0;
      const available = (product.stock_quantity || 0) - reservedBefore;
      if (available < item.quantity) shortages.push({ name: item.product_name, available, needed: item.quantity });
      else plan.push({ kind: 'product', id: item.product_id, product_id: item.product_id, qty: item.quantity, reservedBefore, available });
    }
  }
  if (shortages.length) {
    await base44.asServiceRole.entities.Order.update(order_id, { order_status: 'Cancelled', stock_reserved: false });
    return Response.json({ ok: false, shortages }, { status: 409 });
  }

  // Pass 2: apply holds.
  const movements = [];
  for (const p of plan) {
    const reservedAfter = p.reservedBefore + p.qty;
    if (p.kind === 'variant') {
      await base44.asServiceRole.entities.ProductVariant.update(p.id, { qty_reserved: reservedAfter });
      movements.push({ product_id: p.product_id, variant_sku: p.variant_sku, type: 'Reserved', quantity: -p.qty, previous_stock: p.available, new_stock: p.available - p.qty, reason, created_at: new Date().toISOString(), created_by: by });
    } else {
      await base44.asServiceRole.entities.Product.update(p.id, { qty_reserved: reservedAfter });
      movements.push({ product_id: p.product_id, type: 'Reserved', quantity: -p.qty, previous_stock: p.available, new_stock: p.available - p.qty, reason, created_at: new Date().toISOString(), created_by: by });
    }
  }
  if (movements.length > 0) await base44.asServiceRole.entities.InventoryMovement.bulkCreate(movements);
  await base44.asServiceRole.entities.Order.update(order_id, { stock_reserved: true });
  return Response.json({ ok: true, movements_created: movements.length });
}

// ─── Commit stock (order → Confirmed): reservation → sale ────────────────────
// Reserved orders: qty_on_hand-= AND qty_reserved-= (net availability zero).
// Legacy (unreserved) orders: validate then just decrement qty_on_hand.
async function commitStock(base44, { order_id }, user) {
  const order = await base44.asServiceRole.entities.Order.filter({ id: order_id });
  const o = order[0];
  if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
  if (o.stock_committed) return Response.json({ ok: true, message: 'Stock already committed' });

  const wasReserved = !!o.stock_reserved;
  const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });

  // Only re-check legacy orders; a reserved order's hold is counted against itself.
  if (!wasReserved) {
    const checkRes = await checkStock(base44, { order_id });
    const checkData = await checkRes.json();
    if (!checkData.ok) {
      return Response.json({ ok: false, shortages: checkData.shortages }, { status: 409 });
    }
  }

  const movements = [];
  const reason = `Order ${o.order_number || order_id} confirmed`;

  for (const item of items) {
    const product = await getProductById(base44, item.product_id);
    if (!product) continue;

    if (product.has_variants && (item.size || item.color)) {
      const variant = await getVariant(base44, item.product_id, item.size, item.color);
      if (!variant) continue;

      const prev = variant.qty_on_hand || 0;
      const next = Math.max(0, prev - item.quantity);
      const patch: Record<string, number> = { qty_on_hand: next };
      if (wasReserved) patch.qty_reserved = Math.max(0, (variant.qty_reserved || 0) - item.quantity);
      await base44.asServiceRole.entities.ProductVariant.update(variant.id, patch);
      movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    } else {
      const prev = product.stock_quantity || 0;
      const next = Math.max(0, prev - item.quantity);
      const patch: Record<string, number> = { stock_quantity: next };
      if (wasReserved) patch.qty_reserved = Math.max(0, (product.qty_reserved || 0) - item.quantity);
      await base44.asServiceRole.entities.Product.update(item.product_id, patch);
      movements.push({ product_id: item.product_id, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    }
  }

  if (movements.length > 0) {
    await base44.asServiceRole.entities.InventoryMovement.bulkCreate(movements);
  }

  await base44.asServiceRole.entities.Order.update(order_id, { stock_committed: true, stock_reserved: false });

  return Response.json({ ok: true, movements_created: movements.length });
}

// ─── Release stock (order → Cancelled) ───────────────────────────────────────
// committed → restore qty_on_hand; reserved-only → drop qty_reserved; legacy
// (neither) → no-op.
async function releaseStock(base44, { order_id }, user) {
  const order = await base44.asServiceRole.entities.Order.filter({ id: order_id });
  const o = order[0];
  if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
  if (!o.stock_committed && !o.stock_reserved) {
    return Response.json({ ok: true, message: 'Stock was never reserved or committed, nothing to release' });
  }

  const committed = !!o.stock_committed;
  const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });
  const movements = [];
  const reason = `Order ${o.order_number || order_id} cancelled`;

  for (const item of items) {
    const product = await getProductById(base44, item.product_id);
    if (!product) continue;
    const isVariant = !!(product.has_variants && (item.size || item.color));
    const target = isVariant ? await getVariant(base44, item.product_id, item.size, item.color) : product;
    if (!target) continue;

    if (committed) {
      const prev = isVariant ? (target.qty_on_hand || 0) : (target.stock_quantity || 0);
      const next = prev + item.quantity;
      const patch = isVariant ? { qty_on_hand: next } : { stock_quantity: next };
      if (isVariant) await base44.asServiceRole.entities.ProductVariant.update(target.id, patch);
      else await base44.asServiceRole.entities.Product.update(item.product_id, patch);
      movements.push({ product_id: item.product_id, variant_sku: isVariant ? target.variant_sku : undefined, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    } else {
      const reservedPrev = target.qty_reserved || 0;
      const reservedNext = Math.max(0, reservedPrev - item.quantity);
      const patch = { qty_reserved: reservedNext };
      if (isVariant) await base44.asServiceRole.entities.ProductVariant.update(target.id, patch);
      else await base44.asServiceRole.entities.Product.update(item.product_id, patch);
      const availPrev = (isVariant ? (target.qty_on_hand || 0) : (target.stock_quantity || 0)) - reservedPrev;
      movements.push({ product_id: item.product_id, variant_sku: isVariant ? target.variant_sku : undefined, type: 'Released', quantity: item.quantity, previous_stock: availPrev, new_stock: availPrev + item.quantity, reason, created_at: new Date().toISOString(), created_by: user.email });
    }
  }

  if (movements.length > 0) {
    await base44.asServiceRole.entities.InventoryMovement.bulkCreate(movements);
  }

  await base44.asServiceRole.entities.Order.update(order_id, { stock_committed: false, stock_reserved: false });

  return Response.json({ ok: true, movements_created: movements.length });
}

// ─── Manual stock adjustment ──────────────────────────────────────────────────
async function manualAdjust(base44, { product_id, variant_sku, new_qty, movement_type, reason }, user) {
  if (!['Received', 'Correction', 'Damaged'].includes(movement_type)) {
    return Response.json({ error: 'Invalid movement_type. Use Received, Correction, or Damaged.' }, { status: 400 });
  }

  let prev, delta;

  if (variant_sku) {
    const variants = await base44.asServiceRole.entities.ProductVariant.filter({ variant_sku });
    const v = variants[0];
    if (!v) return Response.json({ error: 'Variant not found' }, { status: 404 });
    prev = v.qty_on_hand;
    delta = new_qty - prev;
    await base44.asServiceRole.entities.ProductVariant.update(v.id, { qty_on_hand: new_qty });
  } else {
    const products = await base44.asServiceRole.entities.Product.filter({ id: product_id });
    const p = products[0];
    if (!p) return Response.json({ error: 'Product not found' }, { status: 404 });
    prev = p.stock_quantity || 0;
    delta = new_qty - prev;
    await base44.asServiceRole.entities.Product.update(product_id, { stock_quantity: new_qty });
  }

  await base44.asServiceRole.entities.InventoryMovement.create({
    product_id,
    variant_sku: variant_sku || null,
    type: movement_type,
    quantity: delta,
    previous_stock: prev,
    new_stock: new_qty,
    reason: reason || `Manual ${movement_type.toLowerCase()} adjustment`,
    created_at: new Date().toISOString(),
    created_by: user.email,
  });

  return Response.json({ ok: true, previous_stock: prev, new_stock: new_qty, delta });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getProductById(base44, product_id) {
  const results = await base44.asServiceRole.entities.Product.filter({ id: product_id });
  return results[0] || null;
}

async function getVariant(base44, product_id, size, color) {
  const all = await base44.asServiceRole.entities.ProductVariant.filter({ product_id });
  return all.find(v =>
    (size ? v.size === size : true) && (color ? v.color === color : true)
  ) || null;
}