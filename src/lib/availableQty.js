// Storefront availability math — kept dependency-free so it can be unit-tested
// with `node --test` (no vite `@/` alias resolution needed). Re-exported from
// `@/lib/inventory` so callers import it alongside the other inventory helpers.

/**
 * Units a NEW customer can actually order right now: on-hand minus the quantity
 * already held for other pending orders (qty_reserved). Works for both a simple
 * product (stock_quantity) and a variant row (qty_on_hand). Never negative.
 */
export function availableQty(productOrVariant) {
  if (!productOrVariant) return 0;
  const onHand = productOrVariant.qty_on_hand ?? productOrVariant.stock_quantity ?? 0;
  const reserved = productOrVariant.qty_reserved ?? 0;
  return Math.max(0, onHand - reserved);
}

/**
 * Overall availability for a product. For a variant product it is the SUM of
 * availableQty over its variants (so the product is out of stock only when ALL
 * variants are unavailable); otherwise it falls back to the product's own
 * available quantity. Pass the product's variant rows when known.
 */
export function productAvailableQty(product, variants) {
  if (!product) return 0;
  if (product.has_variants && Array.isArray(variants) && variants.length > 0) {
    return variants.reduce((sum, v) => sum + availableQty(v), 0);
  }
  return availableQty(product);
}
