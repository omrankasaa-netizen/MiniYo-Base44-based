import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied from './AccessDenied';
import { Users, Search, Download, Printer, Mail, MessageCircle, Plus, X, Ban, CheckCircle2 } from 'lucide-react';
import { downloadCsv, printTable, whatsappLink, whatsappGreeting } from '@/lib/adminExport';

const TIER_COLORS = {
  Bronze: 'bg-amber-50 text-amber-700 border-amber-200',
  Silver: 'bg-slate-50 text-slate-700 border-slate-200',
  Gold: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  VIP: 'bg-purple-50 text-purple-700 border-purple-200',
};
const TIER_ICONS = { Bronze: '⭐', Silver: '⭐⭐', Gold: '⭐⭐⭐', VIP: '👑' };
const TIERS = ['Bronze', 'Silver', 'Gold', 'VIP'];

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(dateStr).getTime();
  if (!t) return Infinity;
  return (Date.now() - t) / 86400000;
}

// ── Customer detail drawer (profile, metrics, orders, tags, notes, block) ─────
function CustomerDetail({ customerId, showMoney, onClose, onChanged }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-customer-detail', customerId],
    queryFn: async () => (await base44.functions.invoke('getCustomerDetail', { customer_id: customerId })).data,
  });
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const profile = data?.profile;
  const metrics = data?.metrics;
  const orders = data?.orders || [];
  const tags = profile?.tags || [];

  React.useEffect(() => {
    if (profile) { setNotes(profile.notes || ''); setNotesDirty(false); }
  }, [profile?.id]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ['admin-customer-detail', customerId] });
    onChanged?.();
  }

  async function call(fn, body, optimistic) {
    setBusy(true); setErr('');
    try {
      await base44.functions.invoke(fn, body);
      if (optimistic) optimistic();
      refresh();
    } catch (e) {
      setErr(e?.data?.data?.error || e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    await call('setCustomerTags', { customer_id: customerId, tags: [...tags, t] });
    setTagInput('');
  }
  async function removeTag(t) {
    await call('setCustomerTags', { customer_id: customerId, tags: tags.filter(x => x !== t) });
  }
  async function saveNotes() {
    await call('setCustomerNotes', { customer_id: customerId, notes }, () => setNotesDirty(false));
  }
  async function toggleBlock() {
    if (!profile.is_blocked) {
      const reason = window.prompt('Reason for blocking this customer? (optional)') ?? '';
      await call('setCustomerBlock', { customer_id: customerId, blocked: true, reason });
    } else {
      await call('setCustomerBlock', { customer_id: customerId, blocked: false });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-card w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-heading font-semibold text-foreground">Customer Detail</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
        {data?.error && <p className="p-6 text-sm text-destructive">{data.error}</p>}

        {profile && (
          <div className="p-5 space-y-5">
            {err && <p className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{err}</p>}

            {profile.is_blocked && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 text-sm text-destructive">
                <strong>Blocked.</strong> {profile.block_reason || 'No reason given.'}
              </div>
            )}

            {/* Profile */}
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {(profile.name?.[0] || profile.email?.[0] || 'C').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{profile.name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email || 'No email'}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Phone</dt><dd className="text-foreground">{profile.phone || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="text-foreground">{profile.is_account ? 'Account' : 'Guest'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Tier</dt><dd className="text-foreground">{TIER_ICONS[profile.tier] || ''} {profile.tier}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Joined</dt><dd className="text-foreground">{(profile.created_date || '').slice(0, 10) || '—'}</dd></div>
              </dl>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/40 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{metrics?.order_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Orders</p>
              </div>
              {showMoney && (
                <>
                  <div className="rounded-xl bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold text-primary">${(metrics?.total_spent || 0).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Total Spent</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold text-foreground">${(metrics?.aov || 0).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">AOV</p>
                  </div>
                </>
              )}
            </div>

            {/* Tags */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs bg-secondary/20 text-foreground px-2 py-1 rounded-full">
                    {t}
                    <button onClick={() => removeTag(t)} disabled={busy} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
              </div>
              <div className="flex gap-2">
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag (e.g. VIP, wholesale)"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm" />
                <button onClick={addTag} disabled={busy} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Add</button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Private Notes</p>
              <textarea value={notes} onChange={e => { setNotes(e.target.value); setNotesDirty(true); }} rows={3}
                placeholder="Internal admin notes (not visible to customer)…"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              {notesDirty && (
                <button onClick={saveNotes} disabled={busy} className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save notes</button>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {profile.phone && (
                <a href={whatsappLink(profile.phone, whatsappGreeting(profile.name))} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              )}
              <button onClick={toggleBlock} disabled={busy}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${profile.is_blocked ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`}>
                {profile.is_blocked ? <><CheckCircle2 className="w-4 h-4" /> Unblock</> : <><Ban className="w-4 h-4" /> Block</>}
              </button>
            </div>

            {/* Order history */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Order History ({orders.length})</p>
              <div className="space-y-2">
                {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
                {orders.map(o => (
                  <div key={o.id} className="border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">#{o.order_number}</p>
                        <p className="text-xs text-muted-foreground">{(o.order_date || '').slice(0, 10)} · {o.order_status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{o.item_count} item(s)</p>
                        {showMoney && <p className="text-sm font-semibold text-primary">${(o.grand_total_usd || 0).toFixed(2)}</p>}
                      </div>
                    </div>
                    {o.items?.length > 0 && (
                      <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                        {o.items.map((it, i) => (
                          <li key={i}>{it.quantity}× {it.product_name}{[it.size, it.color].filter(Boolean).length ? ` (${[it.size, it.color].filter(Boolean).join('/')})` : ''}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add / Edit customer modal ─────────────────────────────────────────────────
function CustomerForm({ customer, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: customer?.name || '', email: customer?.email || '', phone: customer?.phone || '',
    membership_tier: customer?.tier || 'Bronze',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setSaving(true); setErr('');
    try {
      const body = { ...form };
      if (customer?.id) body.customer_id = customer.id;
      await base44.functions.invoke('upsertCustomer', body);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e?.data?.data?.error || e?.message || 'Save failed');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-heading font-semibold text-foreground">{customer?.id ? 'Edit Customer' : 'Add Customer'}</h3>
        {['name', 'email', 'phone'].map(f => (
          <div key={f}>
            <label className="text-xs text-muted-foreground block mb-1 capitalize">{f}</label>
            <input value={form[f]} onChange={e => setForm(s => ({ ...s, [f]: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
          </div>
        ))}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tier</label>
          <select value={form.membership_tier} onChange={e => setForm(s => ({ ...s, membership_tier: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
            {TIERS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterType, setFilterType] = useState('');       // account | guest
  const [filterOrders, setFilterOrders] = useState('');   // new | repeat
  const [filterRecency, setFilterRecency] = useState('');  // 30 | 90 | 180 | never
  const [filterLocation, setFilterLocation] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [formCustomer, setFormCustomer] = useState(null); // null=closed, {} = new, obj = edit
  const [showForm, setShowForm] = useState(false);
  const [exportErr, setExportErr] = useState('');
  const [exporting, setExporting] = useState(false);

  // Loaded via the guarded listCustomers function so money fields are stripped
  // server-side for non-super-admins (never reach the browser).
  const { data, isLoading } = useQuery({
    queryKey: ['admin-customers-list'],
    queryFn: async () => (await base44.functions.invoke('listCustomers')).data,
  });
  const customers = data?.customers || [];
  const showMoney = !!data?.show_money;

  const allTags = useMemo(() => {
    const s = new Set();
    for (const c of customers) for (const t of (c.tags || [])) s.add(t);
    return [...s].sort();
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c => {
      if (q && !c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !(c.phone || '').includes(q)) return false;
      if (filterTier && (c.tier || 'Bronze') !== filterTier) return false;
      if (filterType === 'account' && !c.is_account) return false;
      if (filterType === 'guest' && c.is_account) return false;
      if (filterOrders === 'new' && (c.order_count || 0) > 1) return false;
      if (filterOrders === 'repeat' && (c.order_count || 0) < 2) return false;
      if (filterLocation && !(c.location || '').toLowerCase().includes(filterLocation.toLowerCase())) return false;
      if (filterTag && !(c.tags || []).includes(filterTag)) return false;
      if (filterRecency) {
        const d = daysSince(c.last_order_date);
        if (filterRecency === 'never' && d !== Infinity) return false;
        if (filterRecency === '30' && d > 30) return false;
        if (filterRecency === '90' && d > 90) return false;
        if (filterRecency === '180' && d <= 180) return false;
      }
      return true;
    });
  }, [customers, search, filterTier, filterType, filterOrders, filterRecency, filterLocation, filterTag]);

  if (!canAccess('view_orders')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const filteredIds = filtered.map(c => c.id);
  const isFiltered = filtered.length !== customers.length;

  async function runExport(fn) {
    setExporting(true); setExportErr('');
    try {
      await downloadCsv(fn, isFiltered ? { ids: filteredIds } : {});
    } catch (err) {
      setExportErr(err?.data?.data?.error || err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    const columns = ['Name', 'Email', 'Phone', 'Location', 'Orders', 'Last Order', 'Type', 'Tier', 'Tags', 'Blocked'];
    if (showMoney) columns.splice(5, 0, 'Total Spent (USD)');
    const rows = filtered.map(c => {
      const row = [
        c.name || '', c.email || '', c.phone || '', c.location || '', c.order_count || 0,
        (c.last_order_date || '').slice(0, 10), c.is_account ? 'Account' : 'Guest',
        c.tier || 'Bronze', (c.tags || []).join('; '), c.is_blocked ? 'Yes' : 'No',
      ];
      if (showMoney) row.splice(5, 0, Number(c.total_spent || 0).toFixed(2));
      return row;
    });
    printTable({ title: 'Customers', columns, rows, meta: showMoney ? 'Financial' : 'Operational' });
  }

  const tierStats = Object.fromEntries(TIERS.map(t => [t, customers.filter(c => (c.tier || 'Bronze') === t).length]));

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Customers</h1>
              <p className="text-sm text-muted-foreground">{customers.length} total{isFiltered ? ` · ${filtered.length} matching` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => runExport('exportCustomersCsv')} disabled={exporting}
              className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-xl text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={() => runExport('exportCustomerEmailsCsv')} disabled={exporting}
              className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-xl text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <Mail className="w-4 h-4" /> Export Emails
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-xl text-sm font-semibold hover:bg-muted">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={() => { setFormCustomer({}); setShowForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {exportErr && <p className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{exportErr}</p>}

        {/* Tier Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TIERS.map(tier => (
            <div key={tier} className={`rounded-xl border p-3 text-center ${TIER_COLORS[tier]}`}>
              <p className="text-lg font-bold">{tierStats[tier]}</p>
              <p className="text-xs font-medium">{TIER_ICONS[tier]} {tier}</p>
            </div>
          ))}
        </div>

        {/* Search & Segments */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…"
              className="bg-transparent text-sm flex-1 outline-none text-foreground placeholder:text-muted-foreground" />
          </div>
          <input value={filterLocation} onChange={e => setFilterLocation(e.target.value)} placeholder="Location…"
            className="px-3 py-2 bg-muted rounded-xl text-sm text-foreground outline-none border-0 w-32" />
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm outline-none border-0 cursor-pointer">
            <option value="">All Tiers</option>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm outline-none border-0 cursor-pointer">
            <option value="">Account & Guest</option>
            <option value="account">Account</option>
            <option value="guest">Guest</option>
          </select>
          <select value={filterOrders} onChange={e => setFilterOrders(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm outline-none border-0 cursor-pointer">
            <option value="">All orders</option>
            <option value="new">New (≤1)</option>
            <option value="repeat">Repeat (2+)</option>
          </select>
          <select value={filterRecency} onChange={e => setFilterRecency(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm outline-none border-0 cursor-pointer">
            <option value="">Any recency</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Older than 180 days</option>
            <option value="never">Never ordered</option>
          </select>
          {allTags.length > 0 && (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm outline-none border-0 cursor-pointer">
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Customers Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Phone</th>
                  <th className="px-4 py-3 text-left">Tier</th>
                  <th className="px-4 py-3 text-center hidden sm:table-cell">Orders</th>
                  {showMoney && <th className="px-4 py-3 text-right hidden lg:table-cell">Total Spent</th>}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={showMoney ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={showMoney ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">No customers found.</td></tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id} className={`hover:bg-muted/20 transition-colors cursor-pointer ${c.is_blocked ? 'bg-destructive/5' : ''}`}
                    onClick={() => setDetailId(c.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {(c.name?.[0] || c.email?.[0] || 'C').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{c.name || '—'}</span>
                          {c.is_blocked && <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">Blocked</span>}
                          {(c.tags || []).slice(0, 2).map(t => (
                            <span key={t} className="ml-1 text-xs bg-secondary/20 text-foreground px-1.5 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{c.email}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{c.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TIER_COLORS[c.tier || 'Bronze'] || TIER_COLORS.Bronze}`}>
                        {TIER_ICONS[c.tier || 'Bronze']} {c.tier || 'Bronze'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell text-foreground font-medium">{c.order_count || 0}</td>
                    {showMoney && (
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="font-semibold text-primary">${(c.total_spent || 0).toFixed(2)}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {c.phone && (
                        <a href={whatsappLink(c.phone, whatsappGreeting(c.name))} target="_blank" rel="noopener noreferrer"
                          title="WhatsApp" className="inline-flex p-1.5 rounded-lg text-green-700 hover:bg-green-50">
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailId && (
        <CustomerDetail customerId={detailId} showMoney={showMoney} onClose={() => setDetailId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['admin-customers-list'] })} />
      )}

      {showForm && (
        <CustomerForm customer={formCustomer} onClose={() => { setShowForm(false); setFormCustomer(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-customers-list'] }); setShowForm(false); setFormCustomer(null); }} />
      )}
    </AdminLayout>
  );
}
