// Product-page delivery copy must reflect the same active ShippingZone records
// used at checkout, not the legacy inside/outside SiteSetting fallback values.
export function deliveryFeeRange(zones, { inside = 3, outside = 5 } = {}) {
  const fees = (Array.isArray(zones) ? zones : [])
    .map((zone) => zone?.fee_usd)
    .filter((fee) => fee !== null && fee !== undefined && String(fee).trim() !== '')
    .map(Number)
    .filter((fee) => Number.isFinite(fee) && fee >= 0);
  if (fees.length === 0) return { min: inside, max: outside };
  return { min: Math.min(...fees), max: Math.max(...fees) };
}

export function formatDeliveryFeeRange(range) {
  if (range.min === range.max) return `$${range.min.toFixed(2)}`;
  return `$${range.min.toFixed(2)}–$${range.max.toFixed(2)}`;
}
