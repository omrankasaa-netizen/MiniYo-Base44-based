import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Eye } from 'lucide-react';

export default function CmsHero({ section, mediaAssets, onSave }) {
  const [form, setForm] = useState({
    title: '', title_ar: '', body: '', body_ar: '',
    link_url: '', image_url: '', is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (section) {
      setForm({
        title: section.title || '',
        title_ar: section.title_ar || '',
        body: section.body || '',
        body_ar: section.body_ar || '',
        link_url: section.link_url || '',
        image_url: section.image_url || '',
        is_active: section.is_active !== false,
      });
    }
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setF('image_url', file_url);
    setUploading(false);
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ ...form, sort_order: 0 });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Form */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-semibold text-foreground">Hero Section</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-muted-foreground">Visible</span>
              <div onClick={() => setF('is_active', !form.is_active)}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.is_active ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Headline (EN)</label>
              <input value={form.title} onChange={e => setF('title', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="Welcome to MiniYo" />
            </div>
            <div dir="rtl">
              <label className="text-xs text-muted-foreground block mb-1">العنوان (AR)</label>
              <input value={form.title_ar} onChange={e => setF('title_ar', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm font-body" placeholder="أهلاً في ميني يو" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Subtext (EN)</label>
              <textarea value={form.body} onChange={e => setF('body', e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none" />
            </div>
            <div dir="rtl">
              <label className="text-xs text-muted-foreground block mb-1">النص الفرعي (AR)</label>
              <textarea value={form.body_ar} onChange={e => setF('body_ar', e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Button / Link URL</label>
            <input value={form.link_url} onChange={e => setF('link_url', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="/shop" />
          </div>

          {/* Image upload */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Hero Image</label>
            <div className="flex items-center gap-3">
              {form.image_url && <img src={form.image_url} alt="hero" className="w-20 h-14 object-cover rounded-xl border border-border" />}
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border bg-muted hover:bg-muted/70 cursor-pointer text-sm text-muted-foreground">
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Upload Image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setPreview(p => !p)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted">
              <Eye className="w-4 h-4" /> {preview ? 'Hide' : 'Preview'}
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Hero'}
            </button>
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium">Storefront Preview</div>
            <div className="relative h-56 bg-muted overflow-hidden">
              {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center text-white text-center px-4">
                <h2 className="text-2xl font-heading font-bold drop-shadow">{form.title || 'Hero Headline'}</h2>
                <p className="text-sm mt-1 opacity-90">{form.body || 'Hero subtext goes here'}</p>
                {form.link_url && (
                  <div className="mt-3 px-5 py-1.5 bg-white/20 border border-white/40 rounded-full text-xs backdrop-blur-sm">
                    Shop Now →
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}