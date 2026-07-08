import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import { CreditCard, Banknote, Smartphone, Check } from 'lucide-react';

const PAYMENT_METHODS = [
  {
    key: 'payment_cod_enabled',
    label: 'Cash on Delivery',
    labelAr: 'الدفع عند الاستلام',
    description: 'Customer pays cash when the order arrives.',
    icon: Banknote,
    default: true,
  },
  {
    key: 'payment_whish_enabled',
    label: 'Whish Money',
    labelAr: 'ويش موني',
    description: 'Customer pays via the Whish digital wallet.',
    icon: Smartphone,
    default: true,
  },
  {
    key: 'payment_card_enabled',
    label: 'Credit / Debit Card',
    labelAr: 'بطاقة ائتمان / خصم',
    description: 'Online card payment (requires Stripe or other gateway setup).',
    icon: CreditCard,
    default: false,
  },
];

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-primary' : 'bg-muted'}`}>
      <div className={`w-5 h-5 m-0.5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </div>
  );
}

export default function CmsPaymentMethods({ currentUser }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  const { data: settings = [] } = useQuery({
    queryKey: ['site-settings-admin'],
    queryFn: () => base44.entities.SiteSetting.list('setting_key', 100),
  });

  const settingMap = {};
  for (const s of settings) settingMap[s.setting_key] = s;

  function isEnabled(key, def) {
    const s = settingMap[key];
    if (!s) return def;
    return s.setting_value === 'true';
  }

  async function toggle(key, currentVal) {
    setSaving(p => ({ ...p, [key]: true }));
    const newVal = String(!currentVal);
    const existing = settingMap[key];
    if (existing) {
      await base44.entities.SiteSetting.update(existing.id, { setting_value: newVal });
    } else {
      await base44.entities.SiteSetting.create({ setting_key: key, setting_value: newVal });
    }
    await logAction({ action: 'settings_updated', entity: 'SiteSetting', details: `${key}=${newVal}`, userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['site-settings-admin'] });
    qc.invalidateQueries({ queryKey: ['site-settings-public'] });
    setSaving(p => ({ ...p, [key]: false }));
    setSaved(p => ({ ...p, [key]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 2000);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm text-foreground">Payment Methods</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Enable or disable payment options shown at checkout.</p>
      </div>

      <div className="space-y-3">
        {PAYMENT_METHODS.map(method => {
          const enabled = isEnabled(method.key, method.default);
          const Icon = method.icon;
          return (
            <div key={method.key} className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{method.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{method.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {saved[method.key] && <Check className="w-4 h-4 text-green-500" />}
                    <Toggle value={enabled} onChange={() => toggle(method.key, enabled)} />
                  </div>
                </div>
                <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${enabled ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {enabled ? '● Active at checkout' : '○ Hidden from checkout'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
        <strong>Note:</strong> At least one payment method must remain enabled. Card payments require a payment gateway (Stripe) configured separately.
      </div>
    </div>
  );
}