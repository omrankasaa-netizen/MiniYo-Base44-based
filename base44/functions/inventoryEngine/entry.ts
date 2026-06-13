import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Inventory Engine
 * 
 * Actions:
 *   - commit_stock   : deduct stock when order → Confirmed
 *   - release_stock  : return stock when order → Cancelled (from committed state)
 *   - manual_adjust  : admin manual stock adjustment
 *   - check_stock    : validate if an order can be confirmed (returns shortages)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (action === 'check_stock') {
      return await checkStock(base44, body);
    }
    if (action === 'commit_stock') {
      return await commitStock(base44, body, user);
    }
    if (action === 'release_stock') {
      return await releaseStock(base44, body, user);
    }
    if (action === 'manual_adjust') {
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
      const available = product.stock_quantity || 0;
      if (available < item.quantity) {
        shortages.push({ name: item.product_name, available, needed: item.quantity });
      }
    }
  }

  return Response.json({ ok: shortages.length === 0, shortages });
}

// ─── Commit stock (order → Confirmed) ────────────────────────────────────────
async function commitStock(base44, { order_id }, user) {
  const order = await base44.asServiceRole.entities.Order.filter({ id: order_id });
  const o = order[0];
  if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
  if (o.stock_committed) return Response.json({ ok: true, message: 'Stock already committed' });

  const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });

  // Check availability first
  const checkRes = await checkStock(base44, { order_id });
  const checkData = await checkRes.json();
  if (!checkData.ok) {
    return Response.json({ ok: false, shortages: checkData.shortages }, { status: 409 });
  }

  const movements = [];
  const reason = `Order ${o.order_number || order_id} confirmed`;

  for (const item of items) {
    const product = await getProductById(base44, item.product_id);
    if (!product) continue;

    if (product.has_variants && (item.size || item.color)) {
      const variant = await getVariant(base44, item.product_id, item.size, item.color);
      if (!variant) continue;

      const prev = variant.qty_on_hand;
      const next = prev - item.quantity;
      await base44.asServiceRole.entities.ProductVariant.update(variant.id, { qty_on_hand: next });
      movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    } else {
      const prev = product.stock_quantity || 0;
      const next = prev - item.quantity;
      await base44.asServiceRole.entities.Product.update(item.product_id, { stock_quantity: next });
      movements.push({ product_id: item.product_id, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    }
  }

  // Bulk create movements
  if (movements.length > 0) {
    await base44.asServiceRole.entities.InventoryMovement.bulkCreate(movements);
  }

  // Mark stock as committed
  await base44.asServiceRole.entities.Order.update(order_id, { stock_committed: true });

  return Response.json({ ok: true, movements_created: movements.length });
}

// ─── Release stock (order → Cancelled from committed state) ──────────────────
async function releaseStock(base44, { order_id }, user) {
  const order = await base44.asServiceRole.entities.Order.filter({ id: order_id });
  const o = order[0];
  if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
  if (!o.stock_committed) return Response.json({ ok: true, message: 'Stock was never committed, nothing to release' });

  const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });
  const movements = [];
  const reason = `Order ${o.order_number || order_id} cancelled`;

  for (const item of items) {
    const product = await getProductById(base44, item.product_id);
    if (!product) continue;

    if (product.has_variants && (item.size || item.color)) {
      const variant = await getVariant(base44, item.product_id, item.size, item.color);
      if (!variant) continue;
      const prev = variant.qty_on_hand;
      const next = prev + item.quantity;
      await base44.asServiceRole.entities.ProductVariant.update(variant.id, { qty_on_hand: next });
      movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    } else {
      const prev = product.stock_quantity || 0;
      const next = prev + item.quantity;
      await base44.asServiceRole.entities.Product.update(item.product_id, { stock_quantity: next });
      movements.push({ product_id: item.product_id, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: new Date().toISOString(), created_by: user.email });
    }
  }

  if (movements.length > 0) {
    await base44.asServiceRole.entities.InventoryMovement.bulkCreate(movements);
  }

  await base44.asServiceRole.entities.Order.update(order_id, { stock_committed: false });

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