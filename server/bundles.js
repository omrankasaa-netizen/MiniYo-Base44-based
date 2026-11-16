// Gift bundles: a Product with `is_bundle: true` and a `bundle_items` list.
//
//   bundle_items: [{ product_id, quantity = 1, size = '', color = '' }]
//
// A bundle has NO stock of its own. Selling one bundle reserves / sells /
// releases the stock of every item inside it, and its availability is the
// smallest number of complete bundles the component stock can still make.
// The bundle's own OrderItem line (name, price) is kept as-is for the order
// record, emails and analytics; only the stock maths is expanded.
//
// v1 rule: a component that has variants must pin its `size` (and `color` when
// the product has more than one colour) in the bundle definition. Make one
// bundle per size range (e.g. "Hospital Visit Box 0-3M").
//
// Everything here is pure: callers inject the record lookups, so it is unit
// testable without a database.

export function isBundle(product) {
  return !!(product && product.is_bundle && Array.isArray(product.bundle_items) && product.bundle_items.length > 0);
}

function componentQty(c) {
  const q = Number(c?.quantity);
  return Number.isInteger(q) && q > 0 ? q : 1;
}

/**
 * Expand order lines so every bundle line becomes one line per component.
 * Non-bundle lines pass through untouched. Component lines carry
 * `bundle_product_id` / `bundle_name` so inventory movements stay traceable.
 *
 * @param {Array} items        OrderItem-like rows ({ product_id, quantity, size, color, product_name })
 * @param {(id:string)=>object|null} getProduct
 */
export function expandBundleLines(items, getProduct) {
  const out = [];
  for (const item of items || []) {
    const product = item?.product_id ? getProduct(item.product_id) : null;
    if (!isBundle(product)) { out.push(item); continue; }
    const qty = Number(item.quantity) || 0;
    for (const c of product.bundle_items) {
      if (!c?.product_id) continue;
      const comp = getProduct(c.product_id);
      out.push({
        product_id: c.product_id,
        product_name: `${comp?.name || c.product_name || c.product_id} (in ${product.name || item.product_name || 'bundle'})`,
        size: c.size || '',
        color: c.color || '',
        quantity: qty * componentQty(c),
        bundle_product_id: product.id,
        bundle_name: product.name || item.product_name || '',
      });
    }
  }
  return out;
}

/** Units of a product/variant a new customer can order: on-hand − reserved. */
function available(rec) {
  if (!rec) return 0;
  const onHand = rec.qty_on_hand ?? rec.stock_quantity ?? 0;
  return Math.max(0, onHand - (rec.qty_reserved ?? 0));
}

/**
 * How many complete bundles can still be sold. 0 when any component is
 * missing, inactive or short.
 *
 * @param {object} bundle
 * @param {(id:string)=>object|null} getProduct
 * @param {(productId:string, size:string, color:string)=>object|null} findVariant
 */
export function bundleAvailableQty(bundle, getProduct, findVariant) {
  if (!isBundle(bundle)) return 0;
  let min = Infinity;
  for (const c of bundle.bundle_items) {
    const comp = c?.product_id ? getProduct(c.product_id) : null;
    if (!comp || (comp.status && comp.status !== 'Active')) return 0;
    let target = comp;
    if (comp.has_variants && (c.size || c.color)) {
      target = findVariant(comp.id, c.size || '', c.color || '');
      if (!target) return 0;
    }
    min = Math.min(min, Math.floor(available(target) / componentQty(c)));
  }
  return Number.isFinite(min) ? min : 0;
}

/**
 * Read-side decoration for a bundle Product: expose the computed availability
 * as its stock so the storefront, cart and catalog feeds treat it like any
 * simple product. Non-bundles are returned unchanged.
 */
export function decorateBundle(product, getProduct, findVariant) {
  if (!isBundle(product)) return product;
  return {
    ...product,
    has_variants: false,
    stock_quantity: bundleAvailableQty(product, getProduct, findVariant),
    qty_reserved: 0,
  };
}
