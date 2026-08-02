import { base44 } from '@/api/base44Client';

/**
 * Inventory helper — wraps the inventoryEngine backend function.
 */

// Shared storefront availability helpers (on-hand minus qty_reserved). Defined
// in a dependency-free module so they stay unit-testable; re-exported here so
// storefront code imports them from the single inventory lib.
export { availableQty, productAvailableQty } from './availableQty';

export async function checkOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'check_stock', order_id: orderId });
  return res.data;
}

/**
 * Reserve stock at order placement (atomic check + hold). Call right after the
 * Order + OrderItems are created. Returns { ok, shortages } — on ok:false the
 * server has already cancelled the order.
 */
export async function reserveOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'reserve_stock', order_id: orderId });
  return res.data;
}

export async function commitOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'commit_stock', order_id: orderId });
  return res.data;
}

export async function releaseOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'release_stock', order_id: orderId });
  return res.data;
}

export async function manualStockAdjust({ productId, variantSku, newQty, movementType, reason }) {
  const res = await base44.functions.invoke('inventoryEngine', {
    action: 'manual_adjust',
    product_id: productId,
    variant_sku: variantSku || null,
    new_qty: newQty,
    movement_type: movementType,
    reason,
  });
  return res.data;
}

/** Commit stock when order is confirmed */
export async function commitStock({ orderId }) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'commit_stock', order_id: orderId });
  return res.data;
}

/** Release stock when order is cancelled */
export async function releaseStock({ orderId }) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'release_stock', order_id: orderId });
  return res.data;
}

/**
 * Edit an order's line items (admin). The server atomically releases the old
 * lines, validates + applies the new ones, rewrites OrderItems, and
 * recalculates totals — or rolls everything back and returns
 * { ok: false, shortages } on insufficient stock.
 * items: [{ product_id, size, color, quantity, unit_price_usd? }]
 */
export async function editOrderItems(orderId, items, note, totals = {}) {
  const res = await base44.functions.invoke('inventoryEngine', {
    action: 'edit_order_items',
    order_id: orderId,
    items,
    note: note || '',
    ...(totals.delivery_fee_usd != null ? { delivery_fee_usd: totals.delivery_fee_usd } : {}),
    ...(totals.discount_usd != null ? { discount_usd: totals.discount_usd } : {}),
    ...(totals.grand_total_usd != null ? { grand_total_usd: totals.grand_total_usd } : {}),
    ...(totals.total_overridden ? { total_overridden: true } : {}),
  });
  return res.data;
}

/** Stock status label for display */
export function stockStatus(qty, reorderLevel = 3) {
  if (qty <= 0) return { label: 'Out of stock', color: 'text-destructive bg-destructive/10' };
  if (qty <= reorderLevel) return { label: 'Low stock', color: 'text-amber-600 bg-amber-50' };
  return { label: 'In stock', color: 'text-green-700 bg-green-50' };
}