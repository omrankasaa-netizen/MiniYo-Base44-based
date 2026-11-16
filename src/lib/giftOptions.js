// Gift packaging + Whish payment helpers shared by checkout and admin.
// Dependency-free so they can be unit-tested with `node --test`.

export const GIFT_BOX_DEFAULT_FEE = 1;       // USD
export const GIFT_BOX_DEFAULT_FREE_OVER = 60; // USD, after discounts
export const WHISH_DEFAULT_NUMBER = '+961 71 787 205';

/**
 * Price of the premium gift box for this order.
 * Free once the (post-discount) item subtotal reaches `freeOver`.
 */
export function giftBoxFee({ selected, subtotal, fee = GIFT_BOX_DEFAULT_FEE, freeOver = GIFT_BOX_DEFAULT_FREE_OVER }) {
  if (!selected) return 0;
  const f = Number.isFinite(Number(fee)) && Number(fee) >= 0 ? Number(fee) : GIFT_BOX_DEFAULT_FEE;
  const over = Number.isFinite(Number(freeOver)) && Number(freeOver) > 0 ? Number(freeOver) : GIFT_BOX_DEFAULT_FREE_OVER;
  return Number(subtotal || 0) >= over ? 0 : f;
}

export const CARD_LINK_METHOD = 'Card payment link';

export function isWhish(order) {
  return String(order?.payment_method || '').toLowerCase() === 'whish';
}

/** Paid before delivery (Whish QR or a card payment link we send). */
export function isPrepaid(order) {
  return isWhish(order) || String(order?.payment_method || '') === CARD_LINK_METHOD;
}

/**
 * What the driver collects. COD collects the total; a confirmed Whish payment
 * collects nothing; an unconfirmed Whish order must not be dispatched.
 * Returns { kind: 'cod'|'paid'|'awaiting'|'other', amount }.
 */
export function collectionStatus(order) {
  const total = Number(order?.grand_total_usd || 0);
  if (String(order?.payment_method || '') === 'Cash on Delivery') return { kind: 'cod', amount: total };
  if (isPrepaid(order)) return order?.payment_status === 'paid' ? { kind: 'paid', amount: 0 } : { kind: 'awaiting', amount: 0 };
  return { kind: 'other', amount: 0 };
}

/** Pre-filled WhatsApp message a Whish customer sends after paying. */
export function whishWhatsappText({ orderNumber, total, lang = 'en' }) {
  const amount = `$${Number(total || 0).toFixed(2)}`;
  return lang === 'ar'
    ? `مرحبا MiniYo، دفعت الطلب ${orderNumber} (${amount}) عبر Whish. رح ابعتلك إثبات الدفع هون.`
    : `Hi MiniYo, I paid order ${orderNumber} (${amount}) by Whish. Forwarding the payment proof here.`;
}

/** Pre-filled WhatsApp message asking us for a card payment link. */
export function cardLinkWhatsappText({ orderNumber, total, lang = 'en' }) {
  const amount = `$${Number(total || 0).toFixed(2)}`;
  return lang === 'ar'
    ? `مرحبا MiniYo، طلبت ${orderNumber} (${amount}) وبدي إدفع بالبطاقة. فيكن تبعتولي رابط الدفع؟`
    : `Hi MiniYo, I placed order ${orderNumber} (${amount}) and would like to pay by card. Could you send me the payment link?`;
}

/** wa.me link for a phone number in any format. */
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text || '')}` : '';
}
