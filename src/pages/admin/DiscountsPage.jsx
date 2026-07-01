import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Plus, Pencil, Trash2, Percent, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { isDiscountLive } from '@/lib/discounts';

const EMPTY = { name: '', name_ar: '', type: 'percentage', value: '', applies_to: 'all_products', target: '', starts_at: '', ends_at: '', is_active: true, badge_label: 'SALE', badge_label_ar: 'تخفيض' };

// Convert a datetime-local input value to ISO, guarding against partial/invalid
// values (an unfinished pick would otherwise throw on toISOString and silently
// drop the field).
function datetimeLocalToIso(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function DiscountModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toDatetimeLocal = (iso) => iso ? iso.slice(0, 16) : '';

  async function submit() {
    if (!form.name?.trim()) { setError('Name (EN) is required.'); return; }
    if (!(Number(form.value) > 0)) { setError('Value must be a number greater than 0.'); return; }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) < new Date(form.starts_at)) {
      setError('End date must be after the start date.'); return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setError(e?.message || 'Could not save the discount. Please try again.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h2 className="font-heading font-bold text-lg">{(form.id || form._id) ? 'Edit Discount' : 'New Auto-Discount'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Name (EN) *</label>
            <input value={form.name||''} onChange={e=>f('name',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Name (AR)</label>
            <input value={form.name_ar||''} onChange={e=>f('name_ar',e.target.value)} dir="rtl" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <select value={form.type} onChange={e=>f('type',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="percentage">Percentage %</option>
              <option value="fixed_amount">Fixed Amount $</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Value {form.type==='percentage'?'(%)':'($)'} *</label>
            <input type="number" value={form.value||''} onChange={e=>f('value',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Badge Label (EN)</label>
            <input value={form.badge_label||''} onChange={e=>f('badge_label',e.target.value)} placeholder="e.g. SALE or -20%" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Badge Label (AR)</label>
            <input value={form.badge_label_ar||''} onChange={e=>f('badge_label_ar',e.target.value)} dir="rtl" placeholder="تخفيض" className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">Applies To</label>
            <select value={form.applies_to} onChange={e=>f('applies_to',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
              <option value="all_products">All Products</option>
              <option value="category">Specific Category</option>
              <option value="collection">Specific Collection</option>
              <option value="tag">Products with Tag</option>
              <option value="specific_products">Specific Products (IDs or SKUs)</option>
            </select>
          </div>
          {form.applies_to !== 'all_products' && (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">
                {form.applies_to === 'category' ? 'Category ID' : form.applies_to === 'collection' ? 'Collection ID' : form.applies_to === 'tag' ? 'Tag name (exact)' : 'Product IDs or SKUs (comma-separated)'}
              </label>
              <input value={form.target||''} onChange={e=>f('target',e.target.value)} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Starts At</label>
            <input type="datetime-local" value={toDatetimeLocal(form.starts_at)} onChange={e=>f('starts_at',datetimeLocalToIso(e.target.value))} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ends At</label>
            <input type="datetime-local" value={toDatetimeLocal(form.ends_at)} onChange={e=>f('ends_at',datetimeLocalToIso(e.target.value))} className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="disc_active" checked={!!form.is_active} onChange={e=>f('is_active',e.target.checked)} className="rounded" />
            <label htmlFor="disc_active" className="text-sm text-foreground">Active</label>
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-xl border border-border text-sm disabled:opacity-60">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function DiscountsPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['all-discounts'],
    queryFn: () => base44.entities.Discount.list('-created_date', 200),
  });

  if (!canAccess('manage_discounts')) return <AdminLayout><AccessDenied /></AdminLayout>;

  // Records carry both `id` and `_id` (legacy alias). Always resolve a usable
  // identifier so update/delete never hit /entities/Discount/undefined.
  const discountId = (d) => d?.id || d?._id;

  async function refreshDiscounts() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['all-discounts'] }),
      qc.invalidateQueries({ queryKey: ['active-discounts'] }),
    ]);
  }

  // Throws on failure so the modal can surface the error and stay open. The
  // modal is only closed once the write and the list refresh have succeeded.
  async function handleSave(form) {
    const id = discountId(form);
    const data = { ...form, value: Number(form.value) || 0 };
    if (id) {
      await base44.entities.Discount.update(id, data);
      await logAction({ action: 'updated', entity: 'Discount', entityId: id, userName: currentUser?.email });
    } else {
      await base44.entities.Discount.create(data);
      await logAction({ action: 'created', entity: 'Discount', userName: currentUser?.email });
    }
    await refreshDiscounts();
    setModal(null);
  }

  async function toggleActive(d) {
    const id = discountId(d);
    try {
      await base44.entities.Discount.update(id, { is_active: !d.is_active });
      await refreshDiscounts();
    } catch (e) {
      alert(`Could not update the discount: ${e?.message || e}`);
    }
  }

  async function handleDelete(d) {
    if (!confirm(`Delete discount "${d.name}"?`)) return;
    const id = discountId(d);
    try {
      await base44.entities.Discount.delete(id);
      await logAction({ action: 'deleted', entity: 'Discount', entityId: id, userName: currentUser?.email });
      await refreshDiscounts();
    } catch (e) {
      alert(`Could not delete the discount: ${e?.message || e}`);
    }
  }

  const now = new Date();
  function discStatus(d) {
    if (!d.is_active) return { label: 'Inactive', cls: 'bg-muted text-muted-foreground' };
    if (d.starts_at && new Date(d.starts_at) > now) return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700' };
    if (d.ends_at && new Date(d.ends_at) < now) return { label: 'Ended', cls: 'bg-destructive/10 text-destructive' };
    return { label: 'Live 🟢', cls: 'bg-green-50 text-green-700' };
  }

  return (
    <AdminLayout>
      {modal && <DiscountModal initial={modal} onClose={() => setModal(null)} onSave={handleSave} />}
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Percent className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Auto-Discounts</h1>
              <p className="text-sm text-muted-foreground">Automatic price reductions — no code needed by the customer</p>
            </div>
          </div>
          <button onClick={() => setModal(EMPTY)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Discount
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <Zap className="w-4 h-4 inline mr-1.5" />
          Auto-discounts automatically apply to matching products on the storefront — shown as struck-through original price + discounted price + badge.
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Applies To</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Schedule</th>
                  <th className="px-4 py-3 text-left">Badge</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</td></tr>}
                {!isLoading && discounts.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No auto-discounts yet.</td></tr>}
                {discounts.map(d => {
                  const st = discStatus(d);
                  return (
                    <tr key={discountId(d)} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{d.name}</p>
                        {d.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{d.name_ar}</p>}
                      </td>
                      <td className="px-4 py-3 font-bold text-primary">
                        {d.type === 'percentage' ? `${d.value}% OFF` : `-$${d.value}`}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground capitalize">
                        {d.applies_to?.replace(/_/g,' ')}
                        {d.target && <span className="ml-1 text-foreground font-medium">({d.target.slice(0,20)})</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {d.starts_at ? new Date(d.starts_at).toLocaleDateString() : '—'}
                        {d.ends_at ? ` → ${new Date(d.ends_at).toLocaleDateString()}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {d.badge_label && <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-0.5 rounded-full">{d.badge_label}</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setModal(d)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => toggleActive(d)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                            {d.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDelete(d)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
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