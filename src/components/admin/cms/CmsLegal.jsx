import React, { useState } from 'react';
import { Scale, Save, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const LEGAL_PAGES = [
  { key: 'legal_shipping', label: 'Shipping Policy',      labelAr: 'سياسة الشحن',        slug: 'shipping' },
  { key: 'legal_returns',  label: 'Returns & Exchanges',  labelAr: 'الإرجاع والاستبدال', slug: 'returns' },
  { key: 'legal_privacy',  label: 'Privacy Policy',       labelAr: 'سياسة الخصوصية',    slug: 'privacy' },
  { key: 'legal_terms',    label: 'Terms & Conditions',   labelAr: 'الشروط والأحكام',    slug: 'terms' },
  { key: 'legal_contact',  label: 'Contact Us',           labelAr: 'تواصل معنا',          slug: 'contact' },
  { key: 'page_about',     label: 'About / Our Story',    labelAr: 'قصتنا',               slug: 'about-preview' },
];

export default function CmsLegal({ sectionMap, onSave }) {
  const [activePage, setActivePage] = useState(LEGAL_PAGES[0].key);
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const page = LEGAL_PAGES.find(p => p.key === activePage);
  const existing = sectionMap[activePage];

  function getForm() {
    if (forms[activePage] !== undefined) return forms[activePage];
    return {
      body:    existing?.body    || '',
      body_ar: existing?.body_ar || '',
      is_active: existing?.is_active !== false,
    };
  }

  function setF(k, v) {
    setForms(prev => ({ ...prev, [activePage]: { ...getForm(), [k]: v } }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave(activePage, { ...getForm(), section_key: activePage, title: page.label, title_ar: page.labelAr });
    setSaving(false);
    setSaved(activePage);
    setTimeout(() => setSaved(''), 2500);
  }

  const form = getForm();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Scale className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-heading font-semibold text-foreground">Legal Pages</h2>
          <p className="text-xs text-muted-foreground">Edit bilingual content for Privacy, Terms, Shipping, and Returns. Uses Markdown.</p>
        </div>
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 flex-wrap bg-muted p-1 rounded-xl w-fit">
        {LEGAL_PAGES.map(p => (
          <button key={p.key} onClick={() => setActivePage(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
              ${activePage === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">{page.label} / {page.labelAr}</h3>
          <a href={page.slug === 'about-preview' ? '/about' : `/legal/${page.slug}`} target="_blank" rel="noopener"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            Preview <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">English Content (Markdown)</label>
            <textarea value={form.body} onChange={e => setF('body', e.target.value)}
              rows={18} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-xs font-mono resize-none" />
          </div>
          <div dir="rtl">
            <label className="text-xs font-medium text-muted-foreground block mb-1 text-right">المحتوى العربي (Markdown)</label>
            <textarea value={form.body_ar} onChange={e => setF('body_ar', e.target.value)}
              rows={18} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-xs font-mono resize-none text-right"
              style={{ fontFamily: "'Tajawal', sans-serif" }} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
            <span className="text-sm text-muted-foreground">Active (show custom content)</span>
          </label>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saved === activePage ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}