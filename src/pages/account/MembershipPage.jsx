import React from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Star, Check, TrendingUp } from 'lucide-react';
import { computeTier, nextTierInfo, TIER_THRESHOLDS, TIER_PERKS, TIER_LABELS, TIER_COLORS, TIER_ORDER } from '@/lib/membership';
import { motion } from 'framer-motion';

const TIER_AR = { bronze: 'برونز', silver: 'فضي', gold: 'ذهبي', vip: 'VIP' };

export default function MembershipPage() {
  const { currentUser } = useAuthUser();
  const { t, lang } = useLang();

  const { data: customers = [] } = useQuery({
    queryKey: ['my-customer', currentUser?.id],
    queryFn: () => base44.entities.Customer.filter({ user_id: currentUser.id }, 'name', 1),
    enabled: !!currentUser?.id,
  });
  const customer = customers[0];

  const totalSpent = customer?.total_spent_usd || 0;
  const totalOrders = customer?.total_orders || 0;
  const tier = customer?.membership_tier?.toLowerCase() || computeTier(totalSpent);
  const nextInfo = nextTierInfo(tier, totalSpent);

  const { data: history = [] } = useQuery({
    queryKey: ['membership-history', customer?.id],
    queryFn: () => base44.entities.MembershipHistory.filter({ customer_id: customer.id }, '-changed_at', 10),
    enabled: !!customer?.id,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
        <Star className="w-5 h-5 text-primary" /> {t('My Membership', 'عضويتي')}
      </h1>

      {/* Current tier card */}
      <div className={`rounded-2xl border-2 p-6 shadow-sm ${TIER_COLORS[tier]}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{t('Current Tier', 'المستوى الحالي')}</p>
            <p className="text-2xl font-heading font-bold mt-0.5">
              {lang === 'ar' ? TIER_AR[tier] : TIER_LABELS[tier]}
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/50 flex items-center justify-center text-2xl">
            {tier === 'vip' ? '👑' : tier === 'gold' ? '🥇' : tier === 'silver' ? '🥈' : '🥉'}
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="opacity-70 text-xs">{t('Total Spent', 'إجمالي الإنفاق')}</p>
            <p className="font-bold text-lg">${totalSpent.toFixed(2)}</p>
          </div>
          <div>
            <p className="opacity-70 text-xs">{t('Total Orders', 'إجمالي الطلبات')}</p>
            <p className="font-bold text-lg">{totalOrders}</p>
          </div>
        </div>
      </div>

      {/* Progress to next tier */}
      {nextInfo && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="font-semibold text-foreground text-sm">
              {t(`$${nextInfo.remaining.toFixed(2)} away from ${TIER_LABELS[nextInfo.next]}!`,
                 `${nextInfo.remaining.toFixed(2)}$ لتصل إلى ${TIER_AR[nextInfo.next]}!`)}
            </p>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div className="h-full bg-primary rounded-full"
              initial={{ width: 0 }} animate={{ width: `${nextInfo.progress}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">${totalSpent.toFixed(2)} / ${nextInfo.threshold}</p>
        </div>
      )}

      {/* All tiers + perks */}
      <div className="space-y-3">
        <h2 className="font-heading font-semibold text-foreground text-sm">{t('Tier Perks', 'مزايا كل مستوى')}</h2>
        {TIER_ORDER.map(tierKey => {
          const isCurrent = tierKey === tier;
          const isUnlocked = TIER_ORDER.indexOf(tierKey) <= TIER_ORDER.indexOf(tier);
          return (
            <div key={tierKey} className={`rounded-2xl border p-4 transition-all ${isCurrent ? TIER_COLORS[tierKey] + ' border-current' : isUnlocked ? 'bg-card border-border' : 'bg-muted/30 border-border opacity-60'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">
                  {lang === 'ar' ? TIER_AR[tierKey] : TIER_LABELS[tierKey]}
                  {isCurrent && <span className="ml-2 text-xs opacity-70">← {t('You', 'أنت')}</span>}
                </p>
                <p className="text-xs opacity-70">${TIER_THRESHOLDS[tierKey]}+</p>
              </div>
              <ul className="space-y-1">
                {TIER_PERKS[tierKey].map(perk => (
                  <li key={perk} className="flex items-start gap-2 text-xs">
                    <Check className="w-3 h-3 mt-0.5 shrink-0" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Membership history */}
      {history.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-foreground text-sm mb-3">{t('Tier History', 'سجل المستويات')}</h2>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {lang === 'ar' ? TIER_AR[h.old_tier?.toLowerCase()] : TIER_LABELS[h.old_tier?.toLowerCase()]} →{' '}
                  <span className="font-semibold text-foreground">{lang === 'ar' ? TIER_AR[h.new_tier?.toLowerCase()] : TIER_LABELS[h.new_tier?.toLowerCase()]}</span>
                </span>
                <span className="text-xs text-muted-foreground">{h.changed_at ? new Date(h.changed_at).toLocaleDateString() : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}