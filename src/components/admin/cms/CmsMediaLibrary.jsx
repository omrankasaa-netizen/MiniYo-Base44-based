import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/auditLog';
import { Upload, Trash2, Edit2, Check, X } from 'lucide-react';

const TYPE_OPTIONS = ['logo', 'favicon', 'hero', 'banner', 'footer', 'category', 'product', 'other'];
const TYPE_COLORS = {
  logo: 'bg-primary/10 text-primary', favicon: 'bg-blue-50 text-blue-700',
  hero: 'bg-violet-50 text-violet-700', banner: 'bg-amber-50 text-amber-700',
  footer: 'bg-muted text-muted-foreground', category: 'bg-secondary/20 text-foreground',
  product: 'bg-accent/40 text-accent-foreground', other: 'bg-muted text-muted-foreground',
};

function AssetCard({ asset, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: asset.name || '', alt_en: asset.alt_en || '', alt_ar: asset.alt_ar || '', type: asset.type || 'other' });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onUpdate(asset.id, form);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="aspect-video bg-muted relative overflow-hidden">
        <img src={asset.url} alt={asset.alt_en || ''} className="w-full h-full object-contain" />
        <span className={`absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[asset.type] || 'bg-muted'}`}>
          {asset.type}
        </span>
      </div>
      {editing ? (
        <div className="p-3 space-y-2">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Asset name" className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
          <input value={form.alt_en} onChange={e => setForm(f => ({ ...f, alt_en: e.target.value }))}
            placeholder="Alt text (EN)" className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
          <input value={form.alt_ar} onChange={e => setForm(f => ({ ...f, alt_ar: e.target.value }))} dir="rtl"
            placeholder="النص البديل (AR)" className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs">
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex gap-1">
            <button onClick={save} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
              <Check className="w-3 h-3 mx-auto" />
            </button>
            <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs">
              <X className="w-3 h-3 mx-auto" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 flex items-center justify-between gap-2">
          <p className="text-xs text-foreground truncate flex-1">{asset.name || asset.alt_en || 'Unnamed'}</p>
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <Edit2 className="w-3 h-3" />
            </button>
            <button onClick={() => onDelete(asset.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CmsMediaLibrary({ assets, onRefresh, currentUser }) {
  const [uploading, setUploading] = useState(false);
  const [newType, setNewType] = useState('other');
  const [filterType, setFilterType] = useState('');

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.MediaAsset.create({ url: file_url, type: newType, name: file.name, is_active: true });
    }
    await logAction({ action: 'media_uploaded', entity: 'MediaAsset', userName: currentUser?.email });
    onRefresh();
    setUploading(false);
  }

  async function handleDelete(id) {
    await base44.entities.MediaAsset.delete(id);
    await logAction({ action: 'media_deleted', entity: 'MediaAsset', entityId: id, userName: currentUser?.email });
    onRefresh();
  }

  async function handleUpdate(id, data) {
    await base44.entities.MediaAsset.update(id, data);
    onRefresh();
  }

  const filtered = filterType ? assets.filter(a => a.type === filterType) : assets;

  return (
    <div className="space-y-4">
      {/* Upload bar */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-sm">
        <select value={newType} onChange={e => setNewType(e.target.value)}
          className="px-3 py-2 rounded-xl border border-input bg-background text-sm">
          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold cursor-pointer hover:bg-primary/90">
          <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload Files'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-xl border border-input bg-background text-sm">
            <option value="">All types</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">{filtered.length} assets</span>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 bg-card border border-dashed border-border rounded-2xl text-muted-foreground">
          No media assets yet. Upload files above.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map(a => (
          <AssetCard key={a.id} asset={a} onDelete={handleDelete} onUpdate={handleUpdate} />
        ))}
      </div>
    </div>
  );
}