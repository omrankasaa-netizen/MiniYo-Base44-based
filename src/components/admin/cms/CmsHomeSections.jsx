import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { LayoutTemplate, Save, ExternalLink, Upload, X } from 'lucide-react';

// Each storefront homepage block is backed by a CmsSection row keyed by
// section_key. The matching home components read these keys and fall back to
// their built-in copy when a row is absent, so editing here is purely additive.
const SECTIONS = [
  {
    key: 'home_gifting',
    label: 'Gift Sets Callout',
    fields: { title: true, body: true, image: true, link: true },
    titleHint: 'Heading (e.g. "The perfect newborn gift.")',
    bodyHint: 'Supporting paragraph',
    linkHint: 'Button link (e.g. /shop?category=sets)',
    preview: '/',
  },
  {
    key: 'home_reviews',
    label: 'Reviews — "Loved by parents"',
    fields: { title: true, body: true },
    titleHint: 'Section heading',
    bodyHint: 'Empty-state message (shown when there are no reviews yet)',
    preview: '/',
  },
  {
    key: 'home_instagram',
    label: 'Instagram Strip — "Our community"',
    fields: { title: true, body: true, link: true, gallery: true },
    titleHint: 'Section heading',
    bodyHint: 'Handle label (e.g. @miniyo.lb)',
    linkHint: 'Instagram profile URL',
    galleryHint: 'Photos shown in the strip (up to 6). These do NOT sync from Instagram — upload the images you want to show here.',
    preview: '/',
  },
  {
    key: 'home_newsletter',
    label: 'Newsletter — "Join the MiniYo family"',
    fields: { title: true, body: true },
    titleHint: 'Section heading',
    bodyHint: 'Subtext under the heading',
    preview: '/',
  },
];

export default function CmsHomeSections({ sectionMap, onSave }) {
  const [activeKey, setActiveKey] = useState(SECTIONS[0].key);
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [uploading, setUploading] = useState(false);

  const def = SECTIONS.find(s => s.key === activeKey);
  const existing = sectionMap[activeKey];

  function getForm() {
    if (forms[activeKey] !== undefined) return forms[activeKey];
    // gallery is persisted as a JSON string array of image URLs in gallery_json.
    let gallery = [];
    try { gallery = existing?.gallery_json ? JSON.parse(existing.gallery_json) : []; } catch { gallery = []; }
    return {
      title: existing?.title || '',
      title_ar: existing?.title_ar || '',
      body: existing?.body || '',
      body_ar: existing?.body_ar || '',
      image_url: existing?.image_url || '',
      link_url: existing?.link_url || '',
      gallery: Array.isArray(gallery) ? gallery : [],
      is_active: existing?.is_active !== false,
    };
  }

  function setF(k, v) {
    setForms(prev => ({ ...prev, [activeKey]: { ...getForm(), [k]: v } }));
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setF('image_url', file_url);
    } finally {
      setUploading(false);
    }
  }

  // Upload one or more photos into the gallery (capped at 6). Each file is
  // uploaded sequentially; the resulting URLs are appended to form.gallery.
  async function handleGalleryUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const current = getForm().gallery || [];
      const room = Math.max(0, 6 - current.length);
      const next = [...current];
      for (const file of files.slice(0, room)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (file_url) next.push(file_url);
      }
      setF('gallery', next);
    } finally {
      setUploading(false);
      e.target.value = ''; // allow re-selecting the same file later
    }
  }

  function removeGalleryImage(idx) {
    const next = (getForm().gallery || []).filter((_, i) => i !== idx);
    setF('gallery', next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Serialize the gallery array back to gallery_json for storage; drop the
      // transient `gallery` array so we don't persist a duplicate field.
      const { gallery, ...rest } = getForm();
      const payload = { ...rest, section_key: activeKey };
      if (def.fields.gallery) payload.gallery_json = JSON.stringify(gallery || []);
      await onSave(activeKey, payload);
      setSaved(activeKey);
      setTimeout(() => setSaved(''), 2500);
    } finally {
      setSaving(false);
    }
  }

  const form = getForm();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <LayoutTemplate className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-heading font-semibold text-foreground">Homepage Sections</h2>
          <p className="text-xs text-muted-foreground">Edit the gifting callout, reviews, Instagram, and newsletter blocks. Toggle visibility per section. Leave fields blank to use the built-in defaults.</p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 flex-wrap bg-muted p-1 rounded-xl w-fit">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActiveKey(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
              ${activeKey === s.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">{def.label}</h3>
          <a href={def.preview} target="_blank" rel="noopener"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            Preview <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {def.fields.title && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{def.titleHint || 'Heading'} (EN)</label>
              <input value={form.title} onChange={e => setF('title', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
            <div dir="rtl">
              <label className="text-xs font-medium text-muted-foreground block mb-1 text-right">العنوان (AR)</label>
              <input value={form.title_ar} onChange={e => setF('title_ar', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm text-right"
                style={{ fontFamily: "'Tajawal', sans-serif" }} />
            </div>
          </div>
        )}

        {def.fields.body && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{def.bodyHint || 'Text'} (EN)</label>
              <textarea value={form.body} onChange={e => setF('body', e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none" />
            </div>
            <div dir="rtl">
              <label className="text-xs font-medium text-muted-foreground block mb-1 text-right">النص (AR)</label>
              <textarea value={form.body_ar} onChange={e => setF('body_ar', e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none text-right"
                style={{ fontFamily: "'Tajawal', sans-serif" }} />
            </div>
          </div>
        )}

        {def.fields.link && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{def.linkHint || 'Link URL'}</label>
            <input value={form.link_url} onChange={e => setF('link_url', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
        )}

        {def.fields.image && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Image</label>
            <div className="flex items-center gap-3">
              {form.image_url && (
                <img src={form.image_url} alt="" className="w-16 h-16 rounded-xl object-cover border border-border" />
              )}
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-input bg-background text-sm cursor-pointer hover:bg-muted">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading…' : 'Upload image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
              {form.image_url && (
                <button onClick={() => setF('image_url', '')} className="text-xs text-destructive hover:underline">Remove</button>
              )}
            </div>
          </div>
        )}

        {def.fields.gallery && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Strip photos</label>
            {def.galleryHint && (
              <p className="text-xs text-muted-foreground mb-2">{def.galleryHint}</p>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
              {(form.gallery || []).map((url, i) => (
                <div key={i} className="relative group aspect-square">
                  <img src={url} alt="" className="w-full h-full rounded-xl object-cover border border-border" />
                  <button type="button" onClick={() => removeGalleryImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                    aria-label="Remove photo">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {(form.gallery || []).length === 0 && (
                <p className="col-span-full text-xs text-muted-foreground italic">No photos yet — the strip shows placeholders until you add some.</p>
              )}
            </div>
            {(form.gallery || []).length < 6 && (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-input bg-background text-sm cursor-pointer hover:bg-muted">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading…' : `Add photos (${(form.gallery || []).length}/6)`}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={uploading} />
              </label>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
            <span className="text-sm text-muted-foreground">Visible on storefront</span>
          </label>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saved === activeKey ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
