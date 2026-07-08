import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Plus, Pencil, Trash2, Megaphone, ToggleLeft, ToggleRight, Image } from 'lucide-react';

const EMPTY = { name: '', name_ar: '', description: '', hero_headline: '', hero_headline_ar: '', banner_image: '', banner_link: '', linked_discount_id: '', starts_at: '', ends_at: '', is_active: true, placement: 'homepage_hero' };

function CampaignModal({ initial, discounts, onClose, onSave }) {
  const [form, setForm] = useState(initial || EMPTY);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toDatetimeLocal = (iso) => iso ? iso.slice(0, 16) : '';
  const [uploading, setUploading] = useState(false);

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    f('banner_image', file_url);
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h2 className="font-heading font-bold text-lg">{form.id ? 'Edit Campaign' : 'New Campaign'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Campaign Name (EN) *</label>
            <input value={form.name||''} onChange={e=>f('name',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Campaign Name (AR)</label>
            <input value={form.name_ar||''} onChange={e=>f('name_ar',e.target.value)} dir="rtl" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Hero Headline (EN)</label>
            <input value={form.hero_headline||''} onChange={e=>f('hero_headline',e.target.value)} placeholder="e.g. Newborn Week — 20% Off Everything" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Hero Headline (AR)</label>
            <input value={form.hero_headline_ar||''} onChange={e=>f('hero_headline_ar',e.target.value)} dir="rtl" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Banner Image</label>
            {form.banner_image && <img src={form.banner_image} alt="" className="w-full h-24 object-cover rounded-xl mb-2" />}
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border cursor-pointer hover:bg-muted/30 text-sm text-muted-foreground">
              <Image className="w-4 h-4" />
              {uploading ? 'Uploading…' : 'Click to upload banner image'}
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            {form.banner_image && <input value={form.banner_image} onChange={e=>f('banner_image',e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-input bg-background text-xs text-muted-foreground" />}
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Banner Link (URL)</label>
            <input value={form.banner_link||''} onChange={e=>f('banner_link',e.target.value)} placeholder="/shop or https://…" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Placement</label>
            <select value={form.placement} onChange={e=>f('placement',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="homepage_hero">Homepage Hero</option>
              <option value="announcement_bar">Announcement Bar</option>
              <option value="promo_strip">Promo Strip (below hero)</option>
              <option value="category_top">Category Page Top</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Linked Auto-Discount (optional)</label>
            <select value={form.linked_discount_id||''} onChange={e=>f('linked_discount_id',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="">— None —</option>
              {discounts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type==='percentage'?`${d.value}%`:`$${d.value}`})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Starts At *</label>
            <input type="datetime-local" value={toDatetimeLocal(form.starts_at)} onChange={e=>f('starts_at',e.target.value?new Date(e.target.value).toISOString():'')} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ends At *</label>
            <input type="datetime-local" value={toDatetimeLocal(form.ends_at)} onChange={e=>f('ends_at',e.target.value?new Date(e.target.value).toISOString():'')} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="camp_active" checked={!!form.is_active} onChange={e=>f('is_active',e.target.checked)} className="rounded" />
            <label htmlFor="camp_active" className="text-sm text-foreground">Active</label>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm">Cancel</button>
          <button onClick={()=>onSave(form)} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">Save Campaign</button>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['all-campaigns'],
    queryFn: () => base44.entities.Campaign.list('-starts_at', 100),
  });

  const { data: discounts = [] } = useQuery({
    queryKey: ['all-discounts'],
    queryFn: () => base44.entities.Discount.list('name', 100),
  });

  if (!canAccess('manage_discounts')) return <AdminLayout><AccessDenied /></AdminLayout>;

  async function handleSave(form) {
    const data = { ...form };
    if (!data.linked_discount_id) delete data.linked_discount_id;
    if (form.id) {
      await base44.entities.Campaign.update(form.id, data);
      await logAction({ action: 'updated', entity: 'Campaign', entity_id: form.id, details: form.name, userName: currentUser?.email });
    } else {
      await base44.entities.Campaign.create(data);
      await logAction({ action: 'created', entity: 'Campaign', details: form.name, userName: currentUser?.email });
    }
    qc.invalidateQueries({ queryKey: ['all-campaigns'] });
    qc.invalidateQueries({ queryKey: ['active-campaigns'] });
    setModal(null);
  }

  async function toggleActive(c) {
    await base44.entities.Campaign.update(c.id, { is_active: !c.is_active });
    qc.invalidateQueries({ queryKey: ['all-campaigns'] });
    qc.invalidateQueries({ queryKey: ['active-campaigns'] });
  }

  async function handleDelete(c) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    await base44.entities.Campaign.delete(c.id);
    qc.invalidateQueries({ queryKey: ['all-campaigns'] });
    qc.invalidateQueries({ queryKey: ['active-campaigns'] });
  }

  const now = new Date();
  function campStatus(c) {
    if (!c.is_active) return { label: 'Inactive', cls: 'bg-muted text-muted-foreground' };
    if (c.starts_at && new Date(c.starts_at) > now) return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700' };
    if (c.ends_at && new Date(c.ends_at) < now) return { label: 'Ended', cls: 'bg-destructive/10 text-destructive' };
    return { label: 'Active 🟢', cls: 'bg-green-50 text-green-700' };
  }

  const discountMap = Object.fromEntries(discounts.map(d => [d.id, d]));

  return (
    <AdminLayout>
      {modal && <CampaignModal initial={modal} discounts={discounts} onClose={() => setModal(null)} onSave={handleSave} />}
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Megaphone className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Campaigns</h1>
              <p className="text-sm text-muted-foreground">Schedule banners + discounts that auto-activate and auto-end</p>
            </div>
          </div>
          <button onClick={() => setModal(EMPTY)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>

        <div className="grid gap-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && campaigns.length === 0 && (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No campaigns yet. Create your first campaign!</p>
            </div>
          )}
          {campaigns.map(c => {
            const st = campStatus(c);
            const linkedDiscount = c.linked_discount_id ? discountMap[c.linked_discount_id] : null;
            return (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-5 flex gap-4 items-start">
                {c.banner_image ? (
                  <img src={c.banner_image} alt={c.name} className="w-24 h-16 object-cover rounded-xl shrink-0 hidden sm:block" />
                ) : (
                  <div className="w-24 h-16 bg-muted rounded-xl shrink-0 hidden sm:flex items-center justify-center">
                    <Image className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="font-heading font-bold text-foreground">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{c.placement?.replace(/_/g,' ')}</span>
                  </div>
                  {c.hero_headline && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{c.hero_headline}</p>}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span>📅 {c.starts_at ? new Date(c.starts_at).toLocaleString() : '—'} → {c.ends_at ? new Date(c.ends_at).toLocaleString() : '—'}</span>
                    {linkedDiscount && <span className="text-primary font-medium">🏷 {linkedDiscount.name} ({linkedDiscount.type==='percentage'?`${linkedDiscount.value}%`:`$${linkedDiscount.value}`})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setModal(c)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => toggleActive(c)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                    {c.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}