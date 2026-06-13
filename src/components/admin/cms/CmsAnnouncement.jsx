import React, { useState, useEffect } from 'react';

export default function CmsAnnouncement({ section, onSave }) {
  const [form, setForm] = useState({ title: '', title_ar: '', is_active: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (section) setForm({ title: section.title || '', title_ar: section.title_ar || '', is_active: section.is_active !== false });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    await onSave({ ...form, sort_order: 0 });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-foreground">Announcement Bar</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{form.is_active ? 'Visible' : 'Hidden'}</span>
            <div onClick={() => setF('is_active', !form.is_active)}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.is_active ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Text (EN)</label>
          <input value={form.title} onChange={e => setF('title', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
            placeholder="Free delivery on orders over $50 this week!" />
        </div>
        <div dir="rtl">
          <label className="text-xs text-muted-foreground block mb-1">النص (AR)</label>
          <input value={form.title_ar} onChange={e => setF('title_ar', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
            placeholder="توصيل مجاني على الطلبات فوق $50 هذا الأسبوع!" />
        </div>

        {/* Live preview */}
        {form.is_active && form.title && (
          <div className="bg-primary text-primary-foreground text-center text-xs py-2 rounded-xl">
            {form.title}
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Announcement Bar'}
        </button>
      </div>
    </div>
  );
}