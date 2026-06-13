import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Settings, Save } from 'lucide-react';

const DEFAULT_SETTINGS = {
  store_name: 'MiniYo',
  currency: 'USD',
  whatsapp_number: '',
  instagram_url: '',
  facebook_url: '',
  delivery_fee_inside: '3',
  delivery_fee_outside: '5',
  free_shipping_threshold: '50',
  default_language: 'en',
};

export default function SiteSettingsPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => base44.entities.SiteSetting.list('setting_key', 100),
  });

  useEffect(() => {
    if (settings.length > 0) {
      const map = {};
      for (const s of settings) map[s.setting_key] = s.setting_value;
      setForm(f => ({ ...f, ...map }));
    }
  }, [settings]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const settingsMap = Object.fromEntries(settings.map(s => [s.setting_key, s]));
    for (const [key, value] of Object.entries(form)) {
      if (settingsMap[key]) {
        await base44.entities.SiteSetting.update(settingsMap[key].id, { setting_value: String(value) });
      } else {
        await base44.entities.SiteSetting.create({ setting_key: key, setting_value: String(value) });
      }
    }
    await logAction({ action: 'site_settings_updated', entity: 'SiteSetting', userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['site-settings'] });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!canAccess('manage_settings')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const Field = ({ label, k, type = 'text', placeholder = '', hint = '' }) => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input type={type} value={form[k] || ''} onChange={e => setF(k, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Site Settings</h1>
            <p className="text-sm text-muted-foreground">Admin & Super Admin only</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Store */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
            <h2 className="font-heading font-semibold text-foreground text-sm">Store</h2>
            <Field label="Store Name" k="store_name" placeholder="MiniYo" />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Currency</label>
              <select value={form.currency || 'USD'} onChange={e => setF('currency', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                <option value="USD">USD — US Dollar</option>
                <option value="LBP">LBP — Lebanese Pound</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Default Language</label>
              <select value={form.default_language || 'en'} onChange={e => setF('default_language', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                <option value="en">English</option>
                <option value="ar">Arabic (عربي)</option>
              </select>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
            <h2 className="font-heading font-semibold text-foreground text-sm">Contact & Social</h2>
            <Field label="WhatsApp Number" k="whatsapp_number" placeholder="+961 71 000 000" hint="Include country code. Used for order notifications." />
            <Field label="Instagram URL" k="instagram_url" placeholder="https://instagram.com/miniyo" />
            <Field label="Facebook URL" k="facebook_url" placeholder="https://facebook.com/miniyo" />
          </div>

          {/* Delivery */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
            <h2 className="font-heading font-semibold text-foreground text-sm">Delivery Fees (USD)</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Inside Tripoli ($)" k="delivery_fee_inside" type="number" placeholder="3" />
              <Field label="Outside Tripoli ($)" k="delivery_fee_outside" type="number" placeholder="5" />
            </div>
            <Field label="Free Shipping Threshold ($)" k="free_shipping_threshold" type="number" placeholder="50"
              hint="Orders above this amount qualify for free shipping." />
          </div>

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 w-full justify-center py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 shadow-sm">
            <Save className="w-4 h-4" />
            {saved ? 'Settings Saved ✓' : saving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}