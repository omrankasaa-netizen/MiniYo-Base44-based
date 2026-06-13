import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Plus, Copy, ToggleLeft, ToggleRight, Pencil, Trash2, Tag } from 'lucide-react';

const EMPTY = { code: '', name: '', name_ar: '', type: 'percentage', value: '', min_order_usd: '', scope: 'entire_order', target: '', valid_from: '', valid_until: '', usage_limit: '', per_customer_limit: '', is_active: true };

function PromoModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || EMPTY);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h2 className="font-heading font-bold text-lg">{initial?.id ? 'Edit Promo Code' : 'New Promo Code'}</h2>
        <div className="grid grid-cols-2 gap-3">
          {[['code','Code (unique) *'],['name','Name (EN)'],['name_ar','Name (AR)']].map(([k,l])=>(
            <div key={k} className={k==='code'?'col-span-2':''}>
              <label className="text-xs text-muted-foreground mb-1 block">{l}</label>
              <input value={form[k]||''} onChange={e=>f(k,e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <select value={form.type} onChange={e=>f('type',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="percentage">Percentage %</option>
              <option value="fixed_amount">Fixed Amount $</option>
              <option value="free_shipping">Free Shipping</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Value {form.type === 'percentage' ? '(%)' : form.type === 'fixed_amount' ? '($)' : '(n/a)'}</label>
            <input type="number" value={form.value||''} onChange={e=>f('value',e.target.value)} disabled={form.type==='free_shipping'} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm disabled:opacity-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Min Order ($)</label>
            <input type="number" value={form.min_order_usd||''} onChange={e=>f('min_order_usd',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Scope</label>
            <select value={form.scope} onChange={e=>f('scope',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="entire_order">Entire Order</option>
              <option value="category">Category</option>
              <option value="product">Product</option>
              <option value="collection">Collection</option>
            </select>
          </div>
          {form.scope !== 'entire_order' && (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Target (category/product/collection name or ID)</label>
              <input value={form.target||''} onChange={e=>f('target',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Valid From</label>
            <input type="date" value={form.valid_from||''} onChange={e=>f('valid_from',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Valid Until</label>
            <input type="date" value={form.valid_until||''} onChange={e=>f('valid_until',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Usage Limit (total)</label>
            <input type="number" value={form.usage_limit||''} onChange={e=>f('usage_limit',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="∞ unlimited" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Per-Customer Limit</label>
            <input type="number" value={form.per_customer_limit||''} onChange={e=>f('per_customer_limit',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="∞ unlimited" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="promo_active" checked={!!form.is_active} onChange={e=>f('is_active',e.target.checked)} className="rounded" />
            <label htmlFor="promo_active" className="text-sm text-foreground">Active</label>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm">Cancel</button>
          <button onClick={()=>onSave(form)} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">Save</button>
        </div>
      </div>
    </div>
  );
}

export default function PromoCodesPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: () => base44.entities.PromoCode.list('-created_date', 200),
  });

  if (!canAccess('manage_discounts')) return <AdminLayout><AccessDenied /></AdminLayout>;

  async function handleSave(form) {
    const data = {
      ...form,
      value: Number(form.value) || 0,
      min_order_usd: Number(form.min_order_usd) || 0,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : null,
      code: (form.code || '').toUpperCase().trim(),
    };
    if (form.id) {
      await base44.entities.PromoCode.update(form.id, data);
      await logAction({ action: 'updated', entity: 'PromoCode', entity_id: form.id, details: form.code, userName: currentUser?.email });
    } else {
      await base44.entities.PromoCode.create({ ...data, times_used: 0 });
      await logAction({ action: 'created', entity: 'PromoCode', details: form.code, userName: currentUser?.email });
    }
    qc.invalidateQueries({ queryKey: ['promo-codes'] });
    setModal(null);
  }

  async function toggleActive(code) {
    await base44.entities.PromoCode.update(code.id, { is_active: !code.is_active });
    qc.invalidateQueries({ queryKey: ['promo-codes'] });
  }

  async function handleDelete(code) {
    if (!confirm(`Delete code "${code.code}"?`)) return;
    await base44.entities.PromoCode.delete(code.id);
    await logAction({ action: 'deleted', entity: 'PromoCode', details: code.code, userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['promo-codes'] });
  }

  const now = new Date();
  function codeStatus(c) {
    if (!c.is_active) return { label: 'Inactive', cls: 'bg-muted text-muted-foreground' };
    if (c.valid_from && new Date(c.valid_from) > now) return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700' };
    if (c.valid_until && new Date(c.valid_until) < now) return { label: 'Expired', cls: 'bg-destructive/10 text-destructive' };
    if (c.usage_limit && c.times_used >= c.usage_limit) return { label: 'Limit Reached', cls: 'bg-amber-50 text-amber-700' };
    return { label: 'Active', cls: 'bg-green-50 text-green-700' };
  }

  return (
    <AdminLayout>
      {modal && <PromoModal initial={modal} onClose={() => setModal(null)} onSave={handleSave} />}
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Promo Codes</h1>
              <p className="text-sm text-muted-foreground">Create and manage discount codes for customers</p>
            </div>
          </div>
          <button onClick={() => setModal(EMPTY)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Code
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Name</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Scope</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Validity</th>
                  <th className="px-4 py-3 text-center">Usage</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</td></tr>}
                {!isLoading && codes.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No promo codes yet.</td></tr>}
                {codes.map(c => {
                  const st = codeStatus(c);
                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-foreground tracking-widest">{c.code}</span>
                          <button onClick={() => { navigator.clipboard.writeText(c.code); }} title="Copy" className="text-muted-foreground hover:text-foreground">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{c.name}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {c.type === 'free_shipping' ? '🚚 Free Shipping' : c.type === 'percentage' ? `${c.value}%` : `$${c.value}`}
                        {c.min_order_usd > 0 && <span className="text-xs text-muted-foreground ml-1">min ${c.min_order_usd}</span>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground capitalize">{c.scope?.replace('_',' ')}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {c.valid_from && <span>{c.valid_from}</span>}
                        {c.valid_from && c.valid_until && ' → '}
                        {c.valid_until && <span>{c.valid_until}</span>}
                        {!c.valid_from && !c.valid_until && '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <span className="font-semibold">{c.times_used || 0}</span>
                        {c.usage_limit && <span className="text-muted-foreground">/{c.usage_limit}</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal(c)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => toggleActive(c)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                            {c.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}