// Return flow for COD orders that come back from the customer/courier.
// Registered as a dedicated admin route in server/index.js
// (POST /api/functions/returnOrder) — same surgical-route pattern as
// aiProductDraft, because functions.js exceeds the text-push limit.
//
// What it does, atomically (one db.transaction):
//   • Committed orders (Confirmed → Out for Delivery / Delivered): every line
//     is restocked (qty_on_hand += qty) with an InventoryMovement of type
//     'Returned' — the same shape releaseStock writes for committed cancels.
//   • Reserved-but-never-committed orders: the holds are dropped instead
//     (qty_reserved -= qty), movement type 'Released'.
//   • Legacy orders with neither flag: stock is untouched (nothing was ever
//     deducted/held — same behavior as releaseStock).
//   • Sets order_status 'Returned', clears stock flags, stamps returned_at.
//
// What it deliberately does NOT do: reverse membership lifetime-spend or tier.
// Tier credits may already be consumed, so spend/tier reversal is left to the
// operator on the Customers page. The response flags membership_untouched.
//
// Idempotent: a second call on an already-returned order is a no-op.

import { db, queryRecords, getRecord, updateRecord, bulkCreate, nowIso } from './db.js';

// Goods come back only once they're physically out the door.
const RETURNABLE_STATUSES = ['Out for Delivery', 'Delivered'];

// True when a line item targets a specific variant (variant products only).
// Mirrors server/functions.js (kept local so this module stays standalone).
function isVariantLine(product, item) {
  return !!(product.has_variants && (item.size || item.color));
}

function findVariant(product_id, size, color) {
  return queryRecords('ProductVariant', { query: { product_id } })
    .find((v) => (size ? v.size === size : true) && (color ? v.color === color : true)) || null;
}

export function returnOrder({ order_id } = {}, user) {
  if (!order_id) return { _status: 400, error: 'order_id required' };
  const o = getRecord('Order', order_id);
  if (!o) return { _status: 404, error: 'Order not found' };
  if (o.order_status === 'Returned' || o.stock_returned) {
    return { ok: true, message: 'Order already returned', already: true };
  }
  if (!RETURNABLE_STATUSES.includes(o.order_status)) {
    return { _status: 409, error: `Only Out for Delivery or Delivered orders can be marked returned (this order is ${o.order_status})` };
  }

  const items = queryRecords('OrderItem', { query: { order_id } });
  const reason = `Order ${o.order_number || order_id} returned`;
  const by = user?.email || 'system';
  const committed = !!o.stock_committed;
  const reserved = !!o.stock_reserved;

  const runReturn = db.transaction(() => {
    const movements = [];
    for (const item of items) {
      const product = getRecord('Product', item.product_id);
      if (!product) continue;
      const isVariant = isVariantLine(product, item);
      const target = isVariant ? findVariant(item.product_id, item.size, item.color) : product;
      if (!target) continue;
      if (committed) {
        // Sold units physically came back → restore on-hand.
        const prev = isVariant ? (target.qty_on_hand || 0) : (target.stock_quantity || 0);
        const next = prev + item.quantity;
        const patch = isVariant ? { qty_on_hand: next } : { stock_quantity: next };
        updateRecord(isVariant ? 'ProductVariant' : 'Product', target.id, patch);
        movements.push({ product_id: item.product_id, variant_sku: isVariant ? target.variant_sku : undefined, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
      } else if (reserved) {
        // Never sold — drop the hold so the unit is available again.
        const reservedPrev = target.qty_reserved || 0;
        const reservedNext = Math.max(0, reservedPrev - item.quantity);
        updateRecord(isVariant ? 'ProductVariant' : 'Product', target.id, { qty_reserved: reservedNext });
        const availPrev = (isVariant ? (target.qty_on_hand || 0) : (target.stock_quantity || 0)) - reservedPrev;
        movements.push({ product_id: item.product_id, variant_sku: isVariant ? target.variant_sku : undefined, type: 'Released', quantity: item.quantity, previous_stock: availPrev, new_stock: availPrev + item.quantity, reason, created_at: nowIso(), created_by: by });
      }
      // Legacy order with neither flag: stock was never touched → nothing to do.
    }
    if (movements.length) bulkCreate('InventoryMovement', movements);
    updateRecord('Order', order_id, {
      order_status: 'Returned',
      stock_committed: false,
      stock_reserved: false,
      stock_returned: true,
      returned_at: nowIso(),
    });
    return movements.length;
  });

  const moved = runReturn();
  return {
    ok: true,
    movements_created: moved,
    membership_untouched: true, // operator reverses spend/tier manually if needed
  };
}
