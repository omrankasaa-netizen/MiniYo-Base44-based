import React from 'react';
import { Crown, Gift, Percent, TrendingUp } from 'lucide-react';

const tierInfo = {
  Bronze: { icon: '🥉', color: 'bg-amber-50 text-amber-700' },
  Silver: { icon: '🥈', color: 'bg-slate-50 text-slate-700' },
  Gold: { icon: '🥇', color: 'bg-yellow-50 text-yellow-700' }
};

export default function MembershipWidget({ customer, settings }) {
  if (!customer || !settings) return null;

  const currentTier = customer.current_tier || 'Bronze';
  const tierData = tierInfo[currentTier];
  
  // Get discount for current tier
  const discountMap = {
    Bronze: settings.bronze_discount_pct || 5,
    Silver: settings.silver_discount_pct || 10,
    Gold: settings.gold_discount_pct || 15
  };
  const discount = discountMap[currentTier];

  // Calculate progress to next tier
  const thresholds = {
    Bronze: 0,
    Silver: settings.silver_threshold_usd || 100,
    Gold: settings.gold_threshold_usd || 250
  };
  
  const nextTier = currentTier === 'Gold' ? null : (currentTier === 'Silver' ? 'Gold' : 'Silver');
  const nextThreshold = nextTier ? thresholds[nextTier] : null;
  const spend = customer.lifetime_spend_usd || 0;
  const progressPct = nextThreshold ? Math.min(100, (spend / nextThreshold) * 100) : 100;

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`text-4xl ${tierData.color} rounded-full w-12 h-12 flex items-center justify-center`}>
          {tierData.icon}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Current Tier</p>
          <h2 className="text-xl font-heading font-bold text-foreground">{currentTier} Member</h2>
        </div>
      </div>

      {/* Perks */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/60 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Percent className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-foreground">{discount}% Off</span>
          </div>
          <p className="text-xs text-muted-foreground">Every order subtotal</p>
        </div>
        <div className="bg-white/60 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-foreground">{customer.free_delivery_credits_remaining || 0} Credits</span>
          </div>
          <p className="text-xs text-muted-foreground">Free delivery</p>
        </div>
      </div>

      {/* Progress to next tier */}
      {nextTier && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Progress to {nextTier}</span>
            <span className="text-xs font-bold text-foreground">${spend.toFixed(0)} / ${nextThreshold}</span>
          </div>
          <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progressPct < 100 && (
            <p className="text-xs text-muted-foreground">
              Spend ${(nextThreshold - spend).toFixed(2)} more to unlock {nextTier}
            </p>
          )}
        </div>
      )}
    </div>
  );
}