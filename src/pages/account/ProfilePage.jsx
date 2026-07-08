import React, { useState, useEffect } from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { User, Save, Lock, Eye, EyeOff } from 'lucide-react';
import { useCustomerTier } from '@/hooks/useCustomerTier';
import { useQuery } from '@tanstack/react-query';

export default function ProfilePage() {
  const { currentUser, refreshUser } = useAuthUser();
  const { t } = useLang();
  const { customer } = useCustomerTier(currentUser?.email);
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [showPw, setShowPw] = useState(false);

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

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (pwForm.newPassword.length < 8) {
      setPwErr(t('New password must be at least 8 characters.', 'يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.'));
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErr(t('New passwords do not match.', 'كلمتا المرور غير متطابقتين.'));
      return;
    }
    setPwSaving(true);
    try {
      await base44.auth.changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg(t('Password changed successfully.', 'تم تغيير كلمة المرور بنجاح.'));
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwMsg(''), 4000);
    } catch (err) {
      const map = {
        'Current password is incorrect': t('Current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.'),
        'New password must be different from the current password': t('New password must be different from the current one.', 'يجب أن تختلف كلمة المرور الجديدة عن الحالية.'),
      };
      setPwErr(map[err?.message] || err?.message || t('Could not change password.', 'تعذّر تغيير كلمة المرور.'));
    } finally {
      setPwSaving(false);
    }
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
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t('Change Password', 'تغيير كلمة المرور')}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t('Enter your current password and choose a new one.', 'أدخل كلمة المرور الحالية واختر كلمة مرور جديدة.')}</p>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('Current Password', 'كلمة المرور الحالية')}</label>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('New Password', 'كلمة المرور الجديدة')}</label>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('Confirm New Password', 'تأكيد كلمة المرور الجديدة')}</label>
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
              className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              minLength={8}
              required
            />
          </div>
          <button type="button" onClick={() => setShowPw((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPw ? t('Hide passwords', 'إخفاء كلمات المرور') : t('Show passwords', 'إظهار كلمات المرور')}
          </button>
          {pwErr && <p className="text-xs text-destructive">{pwErr}</p>}
          {pwMsg && <p className="text-xs text-emerald-600">{pwMsg}</p>}
          <button type="submit" disabled={pwSaving}
            className="btn-primary h-11 px-5 text-sm disabled:opacity-60">
            {pwSaving ? t('Saving...', 'جارٍ الحفظ...') : t('Update Password', 'تحديث كلمة المرور')}
          </button>
        </form>
      </div>
    </div>
  );
}