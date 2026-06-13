// Tier thresholds (USD spent). Admin can later override via SiteSettings.
export const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 500,
  gold: 1000,
  vip: 1500,
};

export const TIER_PERKS = {
  bronze: ['Free standard delivery on orders over $50', 'Exclusive newsletter deals'],
  silver: ['5% standing discount on all orders', 'Priority WhatsApp support', 'Early access to new arrivals'],
  gold:   ['10% standing discount on all orders', 'Free delivery on all orders', 'Birthday surprise gift'],
  vip:    ['15% standing discount on all orders', 'Free delivery always', 'Personal stylist via WhatsApp', 'First access to limited drops'],
};

export const TIER_LABELS = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', vip: 'VIP' };
export const TIER_COLORS = {
  bronze: 'bg-amber-100 text-amber-800 border-amber-200',
  silver: 'bg-slate-100 text-slate-700 border-slate-200',
  gold:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  vip:    'bg-primary/10 text-primary border-primary/20',
};
export const TIER_ORDER = ['bronze', 'silver', 'gold', 'vip'];

export function computeTier(totalSpent, thresholds = TIER_THRESHOLDS) {
  const spent = totalSpent || 0;
  if (spent >= thresholds.vip)    return 'vip';
  if (spent >= thresholds.gold)   return 'gold';
  if (spent >= thresholds.silver) return 'silver';
  return 'bronze';
}

export function nextTierInfo(currentTier, totalSpent, thresholds = TIER_THRESHOLDS) {
  const idx = TIER_ORDER.indexOf(currentTier);
  if (idx === TIER_ORDER.length - 1) return null; // already VIP
  const next = TIER_ORDER[idx + 1];
  const threshold = thresholds[next];
  const remaining = Math.max(0, threshold - (totalSpent || 0));
  const progress = Math.min(100, ((totalSpent || 0) / threshold) * 100);
  return { next, threshold, remaining, progress };
}