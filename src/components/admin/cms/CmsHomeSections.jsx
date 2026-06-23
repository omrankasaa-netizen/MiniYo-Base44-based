import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { LayoutTemplate, Save, ExternalLink, Upload } from 'lucide-react';

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
    fields: { title: true, body: true, link: true },
    titleHint: 'Section heading',
    bodyHint: 'Handle label (e.g. @miniyo.lb)',
    linkHint: 'Instagram profile URL',
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
    return {
      title: existing?.title || '',
      title_ar: existing?.title_ar || '',
      body: existing?.body || '',
      body_ar: existing?.body_ar || '',
      image_url: existing?.image_url || '',
      link_url: existing?.link_url || '',
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

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(activeKey, { ...getForm(), section_key: activeKey });
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
