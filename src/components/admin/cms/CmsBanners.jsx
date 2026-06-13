import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/auditLog';
import { Plus, Trash2, Upload, GripVertical } from 'lucide-react';

function BannerCard({ section, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    title: section.title || '',
    title_ar: section.title_ar || '',
    link_url: section.link_url || '',
    image_url: section.image_url || '',
    is_active: section.is_active !== false,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setF('image_url', file_url);
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    await onUpdate(section.section_key, form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">{section.section_key}</span>
        </div>
        <div className="flex items-center gap-2">
          <div onClick={() => setF('is_active', !form.is_active)}
            className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${form.is_active ? 'bg-primary' : 'bg-muted'}`}>
            <div className={`w-3 h-3 m-0.5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
          </div>
          <button onClick={onDelete} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input value={form.title} onChange={e => setF('title', e.target.value)}
          placeholder="Title (EN)" className="px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
        <input value={form.title_ar} onChange={e => setF('title_ar', e.target.value)} dir="rtl"
          placeholder="العنوان (AR)" className="px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
      </div>
      <input value={form.link_url} onChange={e => setF('link_url', e.target.value)}
        placeholder="Link URL" className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />

      <div className="flex items-center gap-2">
        {form.image_url && <img src={form.image_url} alt="" className="w-16 h-10 object-cover rounded-lg border border-border" />}
        <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:bg-muted">
          <Upload className="w-3 h-3" /> {uploading ? 'Uploading…' : 'Image'}
          <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
        </label>
        <button onClick={save} disabled={saving}
          className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          {saved ? '✓' : saving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function CmsBanners({ sections, onSave, onRefresh, currentUser }) {
  async function addBanner() {
    const key = `banner_${Date.now()}`;
    await base44.entities.CmsSection.create({ section_key: key, title: 'New Banner', is_active: true, sort_order: sections.length });
    await logAction({ action: 'cms_created', entity: 'CmsSection', details: key, userName: currentUser?.email });
    onRefresh();
  }

  async function deleteBanner(id, key) {
    await base44.entities.CmsSection.delete(id);
    await logAction({ action: 'cms_deleted', entity: 'CmsSection', details: key, userName: currentUser?.email });
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{sections.length} promo banner{sections.length !== 1 ? 's' : ''}</p>
        <button onClick={addBanner}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add Banner
        </button>
      </div>
      {sections.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-2xl">
          No banners yet. Add one above.
        </div>
      )}
      <div className="space-y-3">
        {sections.map(s => (
          <BannerCard key={s.id} section={s}
            onUpdate={onSave}
            onDelete={() => deleteBanner(s.id, s.section_key)} />
        ))}
      </div>
    </div>
  );
}