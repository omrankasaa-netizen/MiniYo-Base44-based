import React, { useState, useMemo, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { BarChart2, Plus, Pencil, Trash2, X, Receipt, TrendingUp, Tag } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const TABS = ['Summary', 'Purchases', 'Overhead', 'Promo Codes'];
const PURCHASE_CATS = ['Stock', 'Shipping', 'Packaging', 'Marketing', 'Other'];
const PIE_COLORS = ['#2F5D57', '#7FA99B', '#E8C7C4', '#f59e0b', '#6366f1'];
const CHANNELS = ['Website', 'Instagram', 'Facebook', 'WhatsApp', 'Other'];

function monthKey(d) { return d ? d.slice(0, 7) : ''; }

// ── Purchase Form Modal ────────────────────────────────────────────────────────
function PurchaseModal({ purchase, onClose, onSaved, currentUser }) {
  const isEdit = !!purchase?.id;
  const [form, setForm] = useState({
    purchase_date: purchase?.purchase_date || new Date().toISOString().slice(0, 10),
    supplier_name: purchase?.supplier_name || '',
    description: purchase?.description || '',
    category: purchase?.category || 'Stock',
    amount_usd: purchase?.amount_usd ?? '',
    notes: purchase?.notes || '',
    receipt_url: purchase?.receipt_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.purchase_date || !form.amount_usd) { setError('Date and amount are required.'); return; }
    setSaving(true);
    try {
      const data = { ...form, amount_usd: Number(form.amount_usd) };
      if (isEdit) await base44.entities.Purchase.update(purchase.id, data);
      else await base44.entities.Purchase.create(data);
      await logAction({ action: isEdit ? 'updated' : 'created', entity: 'Purchase', userName: currentUser?.email });
      onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setF('receipt_url', file_url);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">{isEdit ? 'Edit' : 'Add'} Purchase</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date *</label>
              <input type="date" value={form.purchase_date} onChange={e => setF('purchase_date', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select value={form.category} onChange={e => setF('category', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                {PURCHASE_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Supplier / Source</label>
            <input value={form.supplier_name} onChange={e => setF('supplier_name', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="e.g. Ali supplier" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <input value={form.description} onChange={e => setF('description', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="What was purchased?" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Amount (USD) *</label>
            <input type="number" min="0" step="0.01" value={form.amount_usd} onChange={e => setF('amount_usd', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Receipt Image</label>
            <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm file:mr-2 file:border-0 file:bg-muted file:rounded-lg file:px-2 file:py-1 file:text-xs" />
            {form.receipt_url && <a href={form.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 block">View receipt</a>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <input value={form.notes} onChange={e => setF('notes', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Promo Code Form Modal ──────────────────────────────────────────────────────
function PromoModal({ promo, onClose, onSaved, currentUser }) {
  const isEdit = !!promo?.id;
  const [form, setForm] = useState({
    code: promo?.code || '',
    name: promo?.name || '',
    type: promo?.type || 'percentage',
    value: promo?.value ?? '',
    min_order_usd: promo?.min_order_usd ?? 0,
    scope: promo?.scope || 'entire_order',
    valid_from: promo?.valid_from || '',
    valid_until: promo?.valid_until || '',
    usage_limit: promo?.usage_limit ?? '',
    is_active: promo?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.code || !form.value) { setError('Code and value are required.'); return; }
    setSaving(true);
    try {
      const data = { ...form, value: Number(form.value), min_order_usd: Number(form.min_order_usd), usage_limit: form.usage_limit ? Number(form.usage_limit) : null };
      if (isEdit) await base44.entities.PromoCode.update(promo.id, data);
      else await base44.entities.PromoCode.create(data);
      await logAction({ action: isEdit ? 'updated' : 'created', entity: 'PromoCode', userName: currentUser?.email });
      onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">{isEdit ? 'Edit' : 'New'} Promo Code</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Code *</label>
              <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm font-mono uppercase" placeholder="SUMMER20" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name / Label</label>
              <input value={form.name} onChange={e => setF('name', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <select value={form.type} onChange={e => setF('type', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                <option value="percentage">% Discount</option>
                <option value="fixed_amount">Fixed $ Off</option>
                <option value="free_shipping">Free Shipping</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Value *</label>
              <input type="number" min="0" value={form.value} onChange={e => setF('value', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
                placeholder={form.type === 'percentage' ? '20 (%)' : '5.00 ($)'} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Min Order ($)</label>
              <input type="number" min="0" value={form.min_order_usd} onChange={e => setF('min_order_usd', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Usage Limit</label>
              <input type="number" min="0" value={form.usage_limit} onChange={e => setF('usage_limit', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="Unlimited" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Valid From</label>
              <input type="date" value={form.valid_from} onChange={e => setF('valid_from', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={e => setF('valid_until', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
            <label htmlFor="is_active" className="text-sm text-foreground">Active</label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Finances Page ─────────────────────────────────────────────────────────
export default function FinancesPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Summary');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [editPurchase, setEditPurchase] = useState(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editPromo, setEditPromo] = useState(null);
  const [showPromoModal, setShowPromoModal] = useState(false);

  const { data: orders = [] } = useQuery({ queryKey: ['fin-orders'], queryFn: () => base44.entities.Order.list('-order_date', 500) });
  const { data: purchases = [] } = useQuery({ queryKey: ['fin-purchases'], queryFn: () => base44.entities.Purchase.list('-purchase_date', 300) });
  const { data: overheads = [] } = useQuery({ queryKey: ['fin-overhead'], queryFn: () => base44.entities.Overhead.list('-month', 24) });
  const { data: promos = [] } = useQuery({ queryKey: ['fin-promos'], queryFn: () => base44.entities.PromoCode.list('-created_date', 200) });

  const [overheadForm, setOverheadForm] = useState({ rent_usd: 0, utilities_usd: 0, marketing_usd: 0, other_usd: 0 });
  const [savingOverhead, setSavingOverhead] = useState(false);

  const currentOverhead = useMemo(() => overheads.find(o => o.month === selectedMonth), [overheads, selectedMonth]);

  React.useEffect(() => {
    if (currentOverhead) {
      setOverheadForm({
        rent_usd: currentOverhead.rent_usd || 0,
        utilities_usd: currentOverhead.utilities_usd || 0,
        marketing_usd: currentOverhead.marketing_usd || 0,
        other_usd: currentOverhead.other_usd || 0,
      });
    } else {
      setOverheadForm({ rent_usd: 0, utilities_usd: 0, marketing_usd: 0, other_usd: 0 });
    }
  }, [currentOverhead, selectedMonth]);

  async function saveOverhead() {
    setSavingOverhead(true);
    try {
      const data = { month: selectedMonth, ...overheadForm };
      if (currentOverhead) await base44.entities.Overhead.update(currentOverhead.id, data);
      else await base44.entities.Overhead.create(data);
      qc.invalidateQueries({ queryKey: ['fin-overhead'] });
    } finally { setSavingOverhead(false); }
  }

  // Summary calcs
  const monthOrders = useMemo(() => orders.filter(o => {
    const d = o.order_date || o.created_date;
    return d && d.slice(0, 7) === selectedMonth && ['Confirmed', 'Packed', 'Out for Delivery', 'Delivered'].includes(o.order_status);
  }), [orders, selectedMonth]);

  const monthRevenue = monthOrders.reduce((s, o) => s + (o.grand_total_usd || 0), 0);
  const monthPurchases = purchases.filter(p => (p.purchase_date || '').slice(0, 7) === selectedMonth).reduce((s, p) => s + (p.amount_usd || 0), 0);
  const overheadTotal = (currentOverhead?.rent_usd || 0) + (currentOverhead?.utilities_usd || 0) + (currentOverhead?.marketing_usd || 0) + (currentOverhead?.other_usd || 0);
  const netProfit = monthRevenue - monthPurchases - overheadTotal;

  // Chart data — last 6 months revenue
  const last6 = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const rev = orders.filter(o => (o.order_date || o.created_date || '').slice(0, 7) === key && ['Confirmed','Packed','Out for Delivery','Delivered'].includes(o.order_status)).reduce((s, o) => s + (o.grand_total_usd || 0), 0);
      months.push({ month: key.slice(5), revenue: parseFloat(rev.toFixed(2)) });
    }
    return months;
  }, [orders]);

  // Purchase by category donut
  const byCategory = useMemo(() => {
    const map = {};
    purchases.filter(p => (p.purchase_date || '').slice(0, 7) === selectedMonth).forEach(p => {
      map[p.category || 'Other'] = (map[p.category || 'Other'] || 0) + (p.amount_usd || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, [purchases, selectedMonth]);

  // Orders by channel
  const byChannel = useMemo(() => {
    const map = {};
    orders.filter(o => (o.order_date || o.created_date || '').slice(0, 7) === selectedMonth).forEach(o => {
      const ch = o.channel || 'Website';
      map[ch] = (map[ch] || 0) + 1;
    });
    return Object.entries(map).map(([channel, count]) => ({ channel, count }));
  }, [orders, selectedMonth]);

  if (!canAccess('view_finances')) return <AdminLayout><AccessDenied /></AdminLayout>;

  async function deletePurchase(id) {
    await base44.entities.Purchase.delete(id);
    qc.invalidateQueries({ queryKey: ['fin-purchases'] });
  }

  async function deletePromo(id) {
    await base44.entities.PromoCode.delete(id);
    qc.invalidateQueries({ queryKey: ['fin-promos'] });
  }

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BarChart2 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Finances</h1>
            <p className="text-sm text-muted-foreground">Admin & Super Admin only</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit flex-wrap">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Month picker (Summary, Purchases, Overhead) */}
        {tab !== 'Promo Codes' && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Month:</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
        )}

        {/* SUMMARY */}
        {tab === 'Summary' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Revenue', value: `$${monthRevenue.toFixed(2)}`, color: 'bg-green-50 text-green-700', icon: TrendingUp },
                { label: 'Purchases', value: `$${monthPurchases.toFixed(2)}`, color: 'bg-amber-50 text-amber-700', icon: Receipt },
                { label: 'Overhead', value: `$${overheadTotal.toFixed(2)}`, color: 'bg-blue-50 text-blue-700', icon: BarChart2 },
                { label: 'Est. Net Profit', value: `$${netProfit.toFixed(2)}`, color: netProfit >= 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive', icon: TrendingUp },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-5">
              {/* Revenue bar chart */}
              <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 shadow-sm">
                <h3 className="font-heading font-semibold text-foreground mb-4">Monthly Revenue (last 6 months)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={last6}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => `$${v}`} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Spend by category donut */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <h3 className="font-heading font-semibold text-foreground mb-4">Spend by Category</h3>
                {byCategory.length === 0
                  ? <p className="text-sm text-muted-foreground text-center pt-8">No purchases this month</p>
                  : <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                          {byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={v => `$${v}`} />
                      </PieChart>
                    </ResponsiveContainer>
                }
              </div>
            </div>

            {/* Orders by channel */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <h3 className="font-heading font-semibold text-foreground mb-4">Orders by Channel (this month)</h3>
              {byChannel.length === 0
                ? <p className="text-sm text-muted-foreground">No orders this month</p>
                : <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={byChannel} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--secondary))" radius={[0,6,6,0]} />
                    </BarChart>
                  </ResponsiveContainer>
              }
            </div>
          </div>
        )}

        {/* PURCHASES */}
        {tab === 'Purchases' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {purchases.filter(p => (p.purchase_date||'').slice(0,7) === selectedMonth).length} purchases — Total: ${purchases.filter(p => (p.purchase_date||'').slice(0,7) === selectedMonth).reduce((s,p) => s+(p.amount_usd||0), 0).toFixed(2)}
              </p>
              <button onClick={() => { setEditPurchase(null); setShowPurchaseModal(true); }}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
                <Plus className="w-4 h-4" /> Add Purchase
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Supplier</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchases.filter(p => (p.purchase_date||'').slice(0,7) === selectedMonth).map(p => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{p.purchase_date}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.category}</span></td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{p.supplier_name || '—'}</td>
                      <td className="px-4 py-3 text-foreground hidden md:table-cell max-w-[180px] truncate">{p.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">${(p.amount_usd||0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditPurchase(p); setShowPurchaseModal(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deletePurchase(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {purchases.filter(p => (p.purchase_date||'').slice(0,7) === selectedMonth).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No purchases for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* OVERHEAD */}
        {tab === 'Overhead' && (
          <div className="max-w-md space-y-4">
            <p className="text-sm text-muted-foreground">Monthly fixed costs for {selectedMonth}</p>
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
              {[['rent_usd','Rent'],['utilities_usd','Utilities (electricity, internet…)'],['marketing_usd','Marketing / Ads'],['other_usd','Other']].map(([k, label]) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1.5">{label} ($)</label>
                  <input type="number" min="0" step="0.01" value={overheadForm[k]}
                    onChange={e => setOverheadForm(f => ({ ...f, [k]: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
                </div>
              ))}
              <div className="flex justify-between font-semibold text-foreground border-t border-border pt-3">
                <span>Total Overhead</span>
                <span>${((overheadForm.rent_usd||0)+(overheadForm.utilities_usd||0)+(overheadForm.marketing_usd||0)+(overheadForm.other_usd||0)).toFixed(2)}</span>
              </div>
              <button onClick={saveOverhead} disabled={savingOverhead}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {savingOverhead ? 'Saving…' : `Save ${selectedMonth} Overhead`}
              </button>
            </div>
          </div>
        )}

        {/* PROMO CODES */}
        {tab === 'Promo Codes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{promos.length} promo codes</p>
              <button onClick={() => { setEditPromo(null); setShowPromoModal(true); }}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
                <Plus className="w-4 h-4" /> New Code
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Code</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Value</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Validity</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">Uses</th>
                    <th className="px-4 py-3 text-left">Active</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {promos.map(p => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{p.code}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{p.type?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{p.type === 'percentage' ? `${p.value}%` : p.type === 'fixed_amount' ? `$${p.value}` : 'Free ship'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{p.valid_from || '—'} → {p.valid_until || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{p.times_used || 0}{p.usage_limit ? `/${p.usage_limit}` : ''}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                          {p.is_active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditPromo(p); setShowPromoModal(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deletePromo(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {promos.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No promo codes yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showPurchaseModal && (
        <PurchaseModal
          purchase={editPurchase}
          onClose={() => setShowPurchaseModal(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['fin-purchases'] })}
          currentUser={currentUser}
        />
      )}
      {showPromoModal && (
        <PromoModal
          promo={editPromo}
          onClose={() => setShowPromoModal(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['fin-promos'] })}
          currentUser={currentUser}
        />
      )}
    </AdminLayout>
  );
}