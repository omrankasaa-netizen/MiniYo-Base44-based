import React, { useState, useEffect } from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { User, Save } from 'lucide-react';
import { useCustomerTier } from '@/hooks/useCustomerTier';
import MembershipWidget from '@/components/account/MembershipWidget';
import { useQuery } from '@tanstack/react-query';

export default function ProfilePage() {
  const { currentUser, refreshUser } = useAuthUser();
  const { t } = useLang();
  const { customer } = useCustomerTier(currentUser?.email);
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const { data: memSettings = [] } = useQuery({
    queryKey: ['membership-settings'],
    queryFn: () => base44.entities.MembershipSettings.list(),
  });

  useEffect(() => {
    if (currentUser) {
      setForm({ full_name: currentUser.full_name || '', phone: currentUser.phone || '' });
    }
  }, [currentUser]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await base44.auth.updateMe({ full_name: form.full_name, phone: form.phone });
      await refreshUser();
      setMsg(t('Profile updated!', 'تم تحديث الملف الشخصي!'));
    } catch {
      setMsg(t('Failed to save.', 'فشل الحفظ.'));
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  async function handlePasswordReset() {
    await base44.auth.resetPasswordRequest(currentUser.email);
    setMsg(t('Password reset email sent!', 'تم إرسال بريد إعادة تعيين كلمة المرور!'));
    setTimeout(() => setMsg(''), 4000);
  }

  return (
    <div className="space-y-5">
      {/* Membership tier prominently at top */}
      {customer && memSettings.length > 0 && (
        <div className={`rounded-2xl p-6 border-2 ${
          customer.current_tier === 'Gold' ? 'bg-yellow-50 border-yellow-200' :
          customer.current_tier === 'Silver' ? 'bg-slate-50 border-slate-200' :
          'bg-orange-50 border-orange-200'
        }`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('Current Tier', 'المستوى الحالي')}</p>
              <h2 className={`text-3xl font-heading font-bold ${
                customer.current_tier === 'Gold' ? 'text-yellow-700' :
                customer.current_tier === 'Silver' ? 'text-slate-700' :
                'text-orange-700'
              }`}>
                {customer.current_tier} {t('Member', 'العضو')}
              </h2>
            </div>
            <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              customer.current_tier === 'Gold' ? 'bg-yellow-200 text-yellow-900' :
              customer.current_tier === 'Silver' ? 'bg-slate-200 text-slate-900' :
              'bg-orange-200 text-orange-900'
            }`}>
              {memSettings[0][`${customer.current_tier.toLowerCase()}_discount_pct`]}% {t('Discount', 'خصم')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">{t('Free Deliveries', 'توصيلات مجانية')}</p>
              <p className="text-xl font-bold text-foreground">{customer.free_delivery_credits_remaining || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('Available', 'متاحة')}</p>
            </div>
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">{t('Lifetime Spend', 'الإنفاق الإجمالي')}</p>
              <p className="text-xl font-bold text-foreground">${(customer.lifetime_spend_usd || 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">USD</p>
            </div>
          </div>

          {/* Progress to next tier */}
          {customer.current_tier !== 'Gold' && (
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-2">
                {customer.current_tier === 'Bronze' ? t('Progress to Silver', 'التقدم نحو الفضي') : t('Progress to Gold', 'التقدم نحو الذهبي')}
              </p>
              <div className="w-full h-2 bg-white rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full transition-all ${
                    customer.current_tier === 'Bronze' ? 'bg-slate-400' : 'bg-yellow-400'
                  }`}
                  style={{
                    width: `${Math.min((customer.lifetime_spend_usd / (customer.current_tier === 'Bronze' ? memSettings[0].silver_threshold_usd : memSettings[0].gold_threshold_usd)) * 100, 100)}%`
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ${(customer.current_tier === 'Bronze' ? memSettings[0].silver_threshold_usd : memSettings[0].gold_threshold_usd - customer.lifetime_spend_usd).toFixed(2)} {t('more', 'أكثر')}
              </p>
            </div>
          )}
        </div>
      )}

      <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2 pt-2">
        <User className="w-5 h-5 text-primary" /> {t('My Profile', 'ملفي الشخصي')}
      </h1>
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('Full Name', 'الاسم الكامل')}</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('Phone', 'الهاتف')}</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              type="tel" className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('Email', 'البريد الإلكتروني')}</label>
            <input value={currentUser?.email || ''} disabled
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-muted text-sm text-muted-foreground" />
          </div>
          {msg && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{msg}</p>}
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? t('Saving…', 'جارٍ الحفظ…') : t('Save Changes', 'حفظ التغييرات')}
          </button>
        </form>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground mb-3">{t('Password', 'كلمة المرور')}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t('We\'ll send a reset link to your email.', 'سنرسل رابط إعادة التعيين إلى بريدك الإلكتروني.')}</p>
        <button onClick={handlePasswordReset}
          className="px-4 py-2 border border-border rounded-xl text-sm hover:bg-muted transition-colors">
          {t('Send Reset Email', 'إرسال رابط التعيين')}
        </button>
      </div>
    </div>
  );
}