import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied from './AccessDenied';
import { ShoppingBag, Plus, Search, ChevronRight, X, FileSpreadsheet, Download, Loader2 } from 'lucide-react';

// ─── Bulk CSV import ─────────────────────────────────────────────────────────
// Template columns; rows sharing a customer_phone are merged into one order
// (one line per row). `product` matches by SKU first, then exact name.
const CSV_TEMPLATE = `customer_name,customer_phone,city,address,product,size,color,quantity,unit_price,delivery_fee,discount,notes
Omar el Masri,76958533,Tripoli,"مشروع البيال, Block C",TEE-001,M,,2,12,3,0,Leave at door
Nour Hassan,71958533,Beirut,Hamra Main St,DRESS-004,S,,1,,3,5,
`;

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ''));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}
import NewOrderModal from '@/components/admin/NewOrderModal';
import OrderDetailModal from '@/components/admin/OrderDetailModal';

const STATUS_COLORS = {
  New: 'bg-blue-50 text-blue-700',
  Confirmed: 'bg-indigo-50 text-indigo-700',
  Packed: 'bg-violet-50 text-violet-700',
  'Out for Delivery': 'bg-amber-50 text-amber-700',
  Delivered: 'bg-green-50 text-green-700',
  Cancelled: 'bg-destructive/10 text-destructive',
};

export default function OrdersPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const csvInputRef = React.useRef(null);

  function downloadCsvTemplate() {
    const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'miniyo-orders-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleCsvFile(file) {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) throw new Error('No data rows found — use the template format.');
      const res = await base44.functions.invoke('bulkCreateOrders', { rows });
      const payload = res?.data || res;
      if (!payload?.ok) throw new Error(payload?.error || 'Import failed');
      setImportResult(payload);
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
    } catch (e) {
      setImportResult({ created: 0, failed: 1, results: [{ customer: file.name, ok: false, error: e?.data?.data?.error || e?.data?.error || e.message }] });
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 500),
  });

  // Map customers by id and email so the order list can show a tier badge.
  const { data: customers = [] } = useQuery({
    queryKey: ['admin-orders-customers'],
    queryFn: () => base44.entities.Customer.list('-created_date', 1000),
  });
  const tierByKey = useMemo(() => {
    const m = {};
    for (const c of customers) {
      const tier = c.current_tier || c.membership_tier;
      if (!tier) continue;
      if (c.id) m[c.id] = tier;
      if (c.email) m[c.email.toLowerCase()] = tier;
    }
    return m;
  }, [customers]);
  const tierBadge = (tier) => {
    if (!tier) return null;
    const cls = tier === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
      tier === 'Silver' ? 'bg-slate-200 text-slate-800' :
      tier === 'VIP' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800';
    const icon = tier === 'Gold' ? '🥇' : tier === 'Silver' ? '🥈' : tier === 'VIP' ? '👑' : '🥉';
    return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{icon} {tier}</span>;
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (q && !o.customer_name?.toLowerCase().includes(q) && !o.customer_phone?.includes(q) && !o.order_number?.toLowerCase().includes(q)) return false;
      if (filterStatus && o.order_status !== filterStatus) return false;
      if (filterChannel && o.channel !== filterChannel) return false;
      if (filterZone && o.delivery_zone !== filterZone) return false;
      if (filterDateFrom && (o.order_date || o.created_date) < filterDateFrom) return false;
      if (filterDateTo && (o.order_date || o.created_date) > filterDateTo + 'T23:59:59') return false;
      return true;
    });
  }, [orders, search, filterStatus, filterChannel, filterZone, filterDateFrom, filterDateTo]);

  if (!canAccess('view_orders')) return <AdminLayout><AccessDenied /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Orders</h1>
              <p className="text-sm text-muted-foreground">{orders.length} total</p>
            </div>
          </div>
          {canAccess('edit_orders') && (
            <div className="flex items-center gap-2">
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleCsvFile(e.target.files?.[0])} />
              <button onClick={downloadCsvTemplate} title="Download a ready CSV template for bulk order import"
                className="flex items-center gap-1.5 border border-border bg-card text-foreground px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors">
                <Download className="w-4 h-4" /> Template
              </button>
              <button onClick={() => csvInputRef.current?.click()} disabled={importing}
                title="Import orders in bulk from a CSV file"
                className="flex items-center gap-1.5 border border-border bg-card text-foreground px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {importing ? 'Importing…' : 'Bulk CSV'}
              </button>
              <button onClick={() => setShowNew(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" /> New Order
              </button>
            </div>
          )}
        </div>

        {importResult && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">
                Bulk import: {importResult.created} created{importResult.failed ? `, ${importResult.failed} failed` : ''}
              </p>
              <button onClick={() => setImportResult(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <ul className="max-h-40 overflow-y-auto space-y-1">
              {(importResult.results || []).map((r, i) => (
                <li key={i} className={r.ok ? 'text-green-700' : 'text-destructive'}>
                  {r.ok ? `✓ ${r.customer} → ${r.order_number} ($${Number(r.grand_total_usd || 0).toFixed(2)})` : `✗ ${r.customer}: ${r.error}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-muted rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, order #…"
              className="bg-transparent text-sm flex-1 outline-none text-foreground placeholder:text-muted-foreground" />
          </div>
          {[
            { value: filterStatus, setter: setFilterStatus, label: 'Status', options: ['New','Confirmed','Packed','Out for Delivery','Delivered','Cancelled'] },
            { value: filterChannel, setter: setFilterChannel, label: 'Channel', options: ['Website','Instagram','Facebook','WhatsApp','Other'] },
            { value: filterZone, setter: setFilterZone, label: 'Zone', options: ['Inside Tripoli','Outside Tripoli'] },
          ].map(({ value, setter, label, options }) => (
            <select key={label} value={value} onChange={e => setter(e.target.value)}
              className="bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none border-0 cursor-pointer">
              <option value="">{label}: All</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none border-0 cursor-pointer" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none border-0 cursor-pointer" />
          {(filterStatus || filterChannel || filterZone || filterDateFrom || filterDateTo || search) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterChannel(''); setFilterZone(''); setFilterDateFrom(''); setFilterDateTo(''); }}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-muted">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Order #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Channel</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No orders found.</td></tr>}
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setDetailOrder(o)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{o.order_number || o.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground">{o.customer_name}</p>
                        {tierBadge(tierByKey[o.customer_id] || tierByKey[(o.customer_email || '').toLowerCase()])}
                        {o.is_gift && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">🎁 Gift</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{o.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{o.channel || 'Website'}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                      {o.order_date ? new Date(o.order_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : new Date(o.created_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">${(o.grand_total_usd || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.order_status] || 'bg-muted text-muted-foreground'}`}>
                        {o.order_status}
                      </span>
                    </td>
                    <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <NewOrderModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-orders'] });
            setShowNew(false);
          }}
          currentUser={currentUser}
        />
      )}

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onUpdated={(updated) => {
            setDetailOrder(updated);
            qc.invalidateQueries({ queryKey: ['admin-orders'] });
          }}
          currentUser={currentUser}
        />
      )}
    </AdminLayout>
  );
}