/**
 * Shared discount resolution logic used by storefront and checkout.
 * discounts: array of Discount records from DB
 * product: a Product record
 * cartItems (optional): for promo code scope checks
 */

export function isDiscountLive(d) {
  if (!d.is_active) return false;
  const now = Date.now();
  if (d.starts_at && new Date(d.starts_at).getTime() > now) return false;
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return false;
  return true;
}

export function isCampaignLive(c) {
  if (!c.is_active) return false;
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return false;
  return true;
}

/** Returns the best matching auto-discount for a product (or null). */
export function getBestDiscount(discounts, product) {
  const live = discounts.filter(isDiscountLive);
  const matching = live.filter(d => discountMatchesProduct(d, product));
  if (!matching.length) return null;
  // Pick largest saving
  return matching.reduce((best, d) => {
    const saving = calcSaving(d, product.price_usd);
    const bestSaving = best ? calcSaving(best, product.price_usd) : -1;
    return saving > bestSaving ? d : best;
  }, null);
}

function discountMatchesProduct(d, product) {
  switch (d.applies_to) {
    case 'all_products': return true;
    case 'category': return d.target === product.category_id || product.category_id?.toLowerCase() === d.target?.toLowerCase();
    case 'collection': return d.target === product.collection_id;
    case 'tag': {
      const tags = (product.tags || '').split(',').map(t => t.trim().toLowerCase());
      return tags.includes((d.target || '').toLowerCase());
    }
    case 'specific_products': {
      const targets = (d.target || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const id = String(product.id || '').toLowerCase();
      const sku = String(product.sku || '').trim().toLowerCase();
      return (id && targets.includes(id)) || (sku && targets.includes(sku));
    }
    default: return false;
  }
}

function calcSaving(discount, price) {
  if (discount.type === 'percentage') return (price * discount.value) / 100;
  if (discount.type === 'fixed_amount') return discount.value;
  return 0;
}

/**
 * Effective unit price for a product after applying its best live auto-discount.
 * basePrice defaults to product.price_usd but callers may pass a variant price.
 */
export function getEffectiveUnitPrice(discounts, product, basePrice) {
  const base = parseFloat(basePrice != null ? basePrice : product?.price_usd) || 0;
  const best = getBestDiscount(discounts, product);
  return best ? applyDiscountToPrice(best, base) : base;
}

export function applyDiscountToPrice(discount, price) {
  if (!discount) return price;
  if (discount.type === 'percentage') {
    const discounted = price - (price * discount.value) / 100;
    return Math.max(discounted, 0.01);
  }
  if (discount.type === 'fixed_amount') {
    return Math.max(price - discount.value, 0.01);
  }
  return price;
}

// ── Promo Code validation ─────────────────────────────────────────────────────

export function validatePromoCode(code, cartItems, subtotal, lang = 'en') {
  const t = (en, ar) => lang === 'ar' ? ar : en;
  if (!code) return { valid: false, reason: t('No promo code entered.', 'لم يتم إدخال رمز ترويجي.') };
  if (!code.is_active) return { valid: false, reason: t('This code is inactive.', 'هذا الرمز غير فعّال.') };

  const now = Date.now();
  if (code.valid_from && new Date(code.valid_from).getTime() > now)
    return { valid: false, reason: t('This code is not valid yet.', 'هذا الرمز غير صالح بعد.') };
  if (code.valid_until && new Date(code.valid_until).getTime() < now)
    return { valid: false, reason: t('This code has expired.', 'انتهت صلاحية هذا الرمز.') };

  if (code.min_order_usd && subtotal < code.min_order_usd)
    return { valid: false, reason: t(`Minimum order is $${code.min_order_usd}.`, `الحد الأدنى للطلب هو $${code.min_order_usd}.`) };

  if (code.usage_limit && code.times_used >= code.usage_limit)
    return { valid: false, reason: t('This code has reached its usage limit.', 'وصل هذا الرمز إلى حد استخدامه.') };

  return { valid: true };
}

export function calcPromoDiscount(code, cartItems, subtotal) {
  if (!code) return 0;
  if (code.type === 'free_shipping') return 0; // handled separately
  if (code.type === 'percentage') return parseFloat(((subtotal * code.value) / 100).toFixed(2));
  if (code.type === 'fixed_amount') return Math.min(code.value, subtotal);
  return 0;
}