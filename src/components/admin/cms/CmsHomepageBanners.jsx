import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/auditLog';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash2, Upload, GripVertical, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

/* ─── Shared helpers ─────────────────────────────────── */
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-primary' : 'bg-muted'}`}>
      <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </div>
  );
}

async function uploadImage(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

function UploadBtn({ url, onUpload, loading }) {
  return (
    <div className="flex items-center gap-2">
      {url && <img src={url} alt="" className="w-16 h-10 object-cover rounded-lg border border-border" />}
      <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:bg-muted">
        <Upload className="w-3 h-3" /> {loading ? 'Uploading…' : 'Image'}
        <input type="file" accept="image/*" className="hidden" disabled={loading}
          onChange={async e => { const f = e.target.files?.[0]; if (f) { const u = await uploadImage(f); onUpload(u); } }} />
      </label>
    </div>
  );
}

function BilingualInputs({ formEN, formAR, onChange, labelEN = 'Title (EN)', labelAR = 'العنوان (AR)', multiline = false }) {
  const C = multiline ? 'textarea' : 'input';
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">{labelEN}</label>
        <C value={formEN} onChange={e => onChange('en', e.target.value)} rows={2}
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-none" />
      </div>
      <div dir="rtl">
        <label className="text-xs text-muted-foreground block mb-1">{labelAR}</label>
        <C value={formAR} onChange={e => onChange('ar', e.target.value)} rows={2}
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-none" />
      </div>
    </div>
  );
}

function SaveBtn({ saving, saved, onClick }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
      {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
    </button>
  );
}

/* ─── SLOT COMPONENTS ─────────────────────────────────── */

/* 1 — Announcement Bar */
function SlotAnnouncement({ section, onSave }) {
  const COLORS = [
    { label: 'Sage Teal', value: 'bg-primary text-primary-foreground' },
    { label: 'Blush', value: 'bg-accent text-accent-foreground' },
    { label: 'Charcoal', value: 'bg-foreground text-background' },
    { label: 'Sage', value: 'bg-secondary text-secondary-foreground' },
  ];
  const [form, setForm] = useState({ title: '', title_ar: '', link_url: '', is_active: true, body: 'bg-primary text-primary-foreground' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (section) setForm({
      title: section.title || '', title_ar: section.title_ar || '',
      link_url: section.link_url || '', is_active: section.is_active !== false,
      body: section.body || 'bg-primary text-primary-foreground',
    });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    await onSave('announcement_bar', { ...form, sort_order: 0 });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const colorClass = form.body || 'bg-primary text-primary-foreground';

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-foreground">Announcement Bar</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{form.is_active ? 'Visible' : 'Hidden'}</span>
          <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
        </div>
      </div>

      <BilingualInputs formEN={form.title} formAR={form.title_ar}
        labelEN="Text (EN)" labelAR="النص (AR)"
        onChange={(lang, v) => setF(lang === 'en' ? 'title' : 'title_ar', v)} />

      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Link URL (optional)</label>
        <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="/shop"
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Background Color</label>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button key={c.value} onClick={() => setF('body', c.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border-2 ${c.value} ${form.body === c.value ? 'border-foreground' : 'border-transparent'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      {form.is_active && form.title && (
        <div className={`text-center text-xs py-2 px-4 rounded-xl ${colorClass}`}>
          {form.link_url ? <a href={form.link_url} className="underline underline-offset-2">{form.title}</a> : form.title}
        </div>
      )}

      <div className="flex justify-end">
        <SaveBtn saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

/* 2 — Hero (simplified wrapper, full edit in Hero tab) */
function SlotHero({ section, onSave }) {
  const [form, setForm] = useState({ title: '', title_ar: '', body: '', body_ar: '', image_url: '', link_url: '', is_active: true });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (section) setForm({
      title: section.title || '', title_ar: section.title_ar || '',
      body: section.body || '', body_ar: section.body_ar || '',
      image_url: section.image_url || '', link_url: section.link_url || '',
      is_active: section.is_active !== false,
    });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    await onSave('home_hero', { ...form, sort_order: 0 });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-foreground">Main Hero</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{form.is_active ? 'Visible' : 'Hidden'}</span>
          <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
        </div>
      </div>

      <BilingualInputs formEN={form.title} formAR={form.title_ar}
        labelEN="Headline (EN)" labelAR="العنوان (AR)"
        onChange={(lang, v) => setF(lang === 'en' ? 'title' : 'title_ar', v)} />
      <BilingualInputs formEN={form.body} formAR={form.body_ar}
        labelEN="Subtext (EN)" labelAR="النص الفرعي (AR)" multiline
        onChange={(lang, v) => setF(lang === 'en' ? 'body' : 'body_ar', v)} />

      <div>
        <label className="text-xs text-muted-foreground block mb-1">CTA Link URL</label>
        <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="/shop"
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
      </div>

      <UploadBtn url={form.image_url} loading={uploading}
        onUpload={async url => { setF('image_url', url); }} />

      {/* Mini preview */}
      <div className="relative rounded-xl overflow-hidden h-28 bg-muted">
        {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center text-white text-center px-3">
          <p className="text-sm font-bold drop-shadow">{form.title || 'Hero Headline'}</p>
          {form.body && <p className="text-xs mt-0.5 opacity-80">{form.body}</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBtn saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

/* 3 — Promo Strip Primary (wide banner below new arrivals) */
function SlotPromoStrip({ sections, onCreate, onUpdate, onDelete, onReorder }) {
  const [uploading, setUploading] = useState({});

  async function addNew() {
    await onCreate({ section_key: `promo_strip_${Date.now()}`, title: 'New Banner', is_active: true, sort_order: sections.length });
  }

  function BannerItem({ section, index }) {
    const [form, setForm] = useState({
      title: section.title || '', title_ar: section.title_ar || '',
      body: section.body || '', body_ar: section.body_ar || '',
      link_url: section.link_url || '', image_url: section.image_url || '',
      is_active: section.is_active !== false,
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [open, setOpen] = useState(index === 0);

    function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

    async function save() {
      setSaving(true);
      await onUpdate(section.section_key, form);
      setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    }

    return (
      <div className="bg-background border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
          <span className="flex-1 text-xs font-medium text-foreground truncate">{form.title || 'Untitled banner'}</span>
          <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
          <button onClick={() => setOpen(o => !o)} className="p-1 rounded hover:bg-muted text-muted-foreground">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => onDelete(section)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {open && (
          <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
            <BilingualInputs formEN={form.title} formAR={form.title_ar}
              onChange={(lang, v) => setF(lang === 'en' ? 'title' : 'title_ar', v)} />
            <BilingualInputs formEN={form.body} formAR={form.body_ar}
              labelEN="Subtitle (EN)" labelAR="الوصف (AR)" multiline
              onChange={(lang, v) => setF(lang === 'en' ? 'body' : 'body_ar', v)} />
            <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="Link URL"
              className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
            <div className="flex items-center justify-between gap-2">
              <UploadBtn url={form.image_url} loading={uploading[section.id]}
                onUpload={url => setF('image_url', url)} />
              <SaveBtn saving={saving} saved={saved} onClick={save} />
            </div>
            {/* Preview */}
            {(form.image_url || form.title) && (
              <div className="relative rounded-xl overflow-hidden h-20 bg-muted mt-1">
                {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center text-white text-center px-2">
                  {form.title && <p className="text-sm font-bold drop-shadow">{form.title}</p>}
                  {form.body && <p className="text-xs opacity-80">{form.body}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function handleDragEnd(result) {
    if (!result.destination) return;
    const reordered = Array.from(sections);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorder(reordered);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Promo Banners</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Wide banners shown between product rows. Drag to reorder.</p>
        </div>
        <button onClick={addNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold">
          <Plus className="w-3.5 h-3.5" /> Add Banner
        </button>
      </div>
      {sections.length === 0 && (
        <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
          No promo banners yet.
        </div>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="promo-strips">
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {sections.map((s, i) => (
                <Draggable key={s.id} draggableId={s.id} index={i}>
                  {prov => (
                    <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                      <BannerItem section={s} index={i} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

/* 4 — Dual Banners (side by side) */
function SlotDualBanners({ left, right, onSave }) {
  function DualCard({ section, slotKey, label }) {
    const [form, setForm] = useState({ title: '', title_ar: '', link_url: '', image_url: '', is_active: true });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
      if (section) setForm({
        title: section.title || '', title_ar: section.title_ar || '',
        link_url: section.link_url || '', image_url: section.image_url || '',
        is_active: section.is_active !== false,
      });
    }, [section]);

    function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
    async function save() {
      setSaving(true);
      await onSave(slotKey, { ...form });
      setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    }

    return (
      <div className="flex-1 bg-background border border-border rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
          <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
        </div>
        <BilingualInputs formEN={form.title} formAR={form.title_ar}
          onChange={(lang, v) => setF(lang === 'en' ? 'title' : 'title_ar', v)} />
        <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="Link URL"
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
        <div className="flex items-center justify-between gap-2">
          <UploadBtn url={form.image_url} onUpload={url => setF('image_url', url)} />
          <SaveBtn saving={saving} saved={saved} onClick={save} />
        </div>
        {/* Preview */}
        <div className="relative rounded-xl overflow-hidden h-20 bg-muted">
          {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/30 flex items-end p-2">
            <p className="text-white text-xs font-bold drop-shadow">{form.title || slotKey}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold text-sm text-foreground">Dual Banners (side-by-side)</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Two equal-width banners shown together (e.g. "Shop Girls" / "Shop Boys").</p>
      </div>
      <div className="flex gap-3">
        <DualCard section={left} slotKey="dual_banner_left" label="Left" />
        <DualCard section={right} slotKey="dual_banner_right" label="Right" />
      </div>
    </div>
  );
}

/* 5 — Mid-Page CTA */
function SlotMidPageCta({ section, onSave }) {
  const [form, setForm] = useState({ title: '', title_ar: '', body: '', body_ar: '', link_url: '', image_url: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (section) setForm({
      title: section.title || '', title_ar: section.title_ar || '',
      body: section.body || '', body_ar: section.body_ar || '',
      link_url: section.link_url || '', image_url: section.image_url || '',
      is_active: section.is_active !== false,
    });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function save() {
    setSaving(true);
    await onSave('mid_page_cta', { ...form });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Mid-Page CTA Band</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Full-width story/seasonal banner with image and text.</p>
        </div>
        <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
      </div>
      <BilingualInputs formEN={form.title} formAR={form.title_ar}
        onChange={(lang, v) => setF(lang === 'en' ? 'title' : 'title_ar', v)} />
      <BilingualInputs formEN={form.body} formAR={form.body_ar}
        labelEN="Body / Button Label (EN)" labelAR="النص / زر (AR)" multiline
        onChange={(lang, v) => setF(lang === 'en' ? 'body' : 'body_ar', v)} />
      <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="Button Link URL"
        className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
      <UploadBtn url={form.image_url} onUpload={url => setF('image_url', url)} />
      {/* Preview */}
      {(form.image_url || form.title) && (
        <div className="relative rounded-2xl overflow-hidden h-28 bg-muted">
          {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center px-4">
            {form.title && <p className="text-base font-bold drop-shadow">{form.title}</p>}
            {form.body && <p className="text-xs opacity-80 mt-1">{form.body}</p>}
            {form.link_url && <div className="mt-2 px-4 py-1 bg-white/20 border border-white/40 rounded-full text-xs">Shop Now →</div>}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <SaveBtn saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

/* 6 — Countdown / Sale Banner */
function SlotCountdownBanner({ section, campaigns, onSave }) {
  const [form, setForm] = useState({ title: '', title_ar: '', body: '', body_ar: '', image_url: '', link_url: '', is_active: true, body_ar: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (section) setForm({
      title: section.title || '', title_ar: section.title_ar || '',
      body: section.body || '', body_ar: section.body_ar || '',
      image_url: section.image_url || '', link_url: section.link_url || '',
      is_active: section.is_active !== false,
    });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function save() {
    setSaving(true);
    await onSave('countdown_sale_banner', { ...form });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const liveCampaigns = campaigns.filter(c => {
    const now = new Date();
    return c.is_active && new Date(c.starts_at) <= now && new Date(c.ends_at) >= now;
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Sale / Campaign Banner</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Only renders when a campaign is currently live.</p>
        </div>
        <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
      </div>
      {liveCampaigns.length > 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-800">
          ✓ {liveCampaigns.length} active campaign{liveCampaigns.length > 1 ? 's' : ''}: {liveCampaigns.map(c => c.name).join(', ')}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
          No campaigns currently live — this slot won't render on the storefront.
        </div>
      )}
      <BilingualInputs formEN={form.title} formAR={form.title_ar}
        onChange={(lang, v) => setF(lang === 'en' ? 'title' : 'title_ar', v)} />
      <BilingualInputs formEN={form.body} formAR={form.body_ar}
        labelEN="Subtext (EN)" labelAR="النص (AR)" multiline
        onChange={(lang, v) => setF(lang === 'en' ? 'body' : 'body_ar', v)} />
      <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="Link URL"
        className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
      <UploadBtn url={form.image_url} onUpload={url => setF('image_url', url)} />
      {/* Preview */}
      {(form.image_url || form.title) && (
        <div className="relative rounded-2xl overflow-hidden h-24 bg-muted">
          {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center px-4">
            {form.title && <p className="text-base font-bold drop-shadow">{form.title}</p>}
            {form.body && <p className="text-xs opacity-80">{form.body}</p>}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <SaveBtn saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

/* ─── MAIN EXPORT ─────────────────────────────────────── */
export default function CmsHomepageBanners({ sections, onSave, onRefresh, currentUser, campaigns = [] }) {
  const sectionMap = {};
  for (const s of sections) sectionMap[s.section_key] = s;

  const promoSections = sections
    .filter(s => s.section_key.startsWith('promo_strip_'))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  async function handleCreate(data) {
    await base44.entities.CmsSection.create(data);
    await logAction({ action: 'cms_created', entity: 'CmsSection', details: data.section_key, userName: currentUser?.email });
    onRefresh();
  }

  async function handleDelete(section) {
    await base44.entities.CmsSection.delete(section.id);
    await logAction({ action: 'cms_deleted', entity: 'CmsSection', details: section.section_key, userName: currentUser?.email });
    onRefresh();
  }

  async function handleReorder(reordered) {
    await Promise.all(reordered.map((s, i) => base44.entities.CmsSection.update(s.id, { sort_order: i })));
    onRefresh();
  }

  const SLOTS = [
    { id: 'announcement', label: 'Announcement Bar', visible: true },
    { id: 'hero', label: 'Main Hero', visible: true },
    { id: 'promo', label: 'Promo Banners', visible: true },
    { id: 'dual', label: 'Dual Banners', visible: true },
    { id: 'midcta', label: 'Mid-Page CTA', visible: true },
    { id: 'sale', label: 'Sale Banner', visible: true },
  ];
  const [activeSlot, setActiveSlot] = useState('announcement');

  return (
    <div className="space-y-4">
      {/* Slot selector */}
      <div className="flex gap-1.5 flex-wrap">
        {SLOTS.map(slot => (
          <button key={slot.id} onClick={() => setActiveSlot(slot.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border
              ${activeSlot === slot.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'}`}>
            {slot.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {activeSlot === 'announcement' && (
          <SlotAnnouncement section={sectionMap['announcement_bar']} onSave={onSave} />
        )}
        {activeSlot === 'hero' && (
          <SlotHero section={sectionMap['home_hero']} onSave={onSave} />
        )}
        {activeSlot === 'promo' && (
          <SlotPromoStrip sections={promoSections} onCreate={handleCreate} onUpdate={onSave} onDelete={handleDelete} onReorder={handleReorder} />
        )}
        {activeSlot === 'dual' && (
          <SlotDualBanners left={sectionMap['dual_banner_left']} right={sectionMap['dual_banner_right']} onSave={onSave} />
        )}
        {activeSlot === 'midcta' && (
          <SlotMidPageCta section={sectionMap['mid_page_cta']} onSave={onSave} />
        )}
        {activeSlot === 'sale' && (
          <SlotCountdownBanner section={sectionMap['countdown_sale_banner']} campaigns={campaigns} onSave={onSave} />
        )}
      </div>
    </div>
  );
}