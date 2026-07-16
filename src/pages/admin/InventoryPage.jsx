import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { manualStockAdjust, stockStatus } from '@/lib/inventory';
import { logAction } from '@/lib/auditLog';
import { Warehouse, ChevronDown, ChevronUp, Plus, Minus, PackagePlus, Search, Wrench, Download, Printer } from 'lucide-react';
import AccessDenied from './AccessDenied';
import { downloadCsv, printTable } from '@/lib/adminExport';

const MOVEMENT_TYPES = ['Received', 'Correction', 'Damaged'];
const MOVEMENT_COLORS = {
  Sold:       'bg-destructive/10 text-destructive',
  Returned:   'bg-green-50 text-green-700',
  Received:   'bg-blue-50 text-blue-700',
  Correction: 'bg-amber-50 text-amber-700',
  Damaged:    'bg-orange-50 text-orange-700',
  Reserved:   'bg-purple-50 text-purple-700',
  Released:   'bg-teal-50 text-teal-700',
};

// ── Adjust Modal ──────────────────────────────────────────────────────────────
function AdjustModal({ item, isVariant, onClose, onSave }) {
  const current = isVariant ? (item.qty_on_hand || 0) : (item.stock_quantity || 0);
  const [newQty, setNewQty] = useState(current);
  const [type, setType] = useState('Correction');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (newQty === '' || Number(newQty) < 0) { setError('Enter a valid quantity.'); return; }
    setSaving(true);
    try { await onSave({ newQty: Number(newQty), movementType: type, reason }); onClose(); }
    catch (e) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-foreground">Adjust Stock</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{isVariant ? item.variant_sku : item.name} — current: <strong>{current}</strong></p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">New Quantity</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setNewQty(q => Math.max(0, Number(q) - 1))} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted"><Minus className="w-4 h-4" /></button>
            <input type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm text-center" />
            <button onClick={() => setNewQty(q => Number(q) + 1)} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Movement Type</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
            {MOVEMENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Reason (optional)</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm"
            placeholder="e.g. Stock count correction" />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Receive Shipment Modal ────────────────────────────────────────────────────
function ReceiveShipmentModal({ products, variants, onClose, onSaved, currentUser }) {
  const [lines, setLines] = useState([]); // { productId, variantId, variantSku, label, qty }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  const filteredProducts = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30);

  function addProduct(p) {
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) {
      for (const v of pvs) {
        const key = `${p.id}_${v.id}`;
        if (!lines.find(l => l.key === key)) {
          setLines(ls => [...ls, { key, productId: p.id, variantId: v.id, variantSku: v.variant_sku, label: `${p.name} — ${[v.size, v.color].filter(Boolean).join('/')}`, qty: 0 }]);
        }
      }
    } else {
      if (!lines.find(l => l.key === p.id)) {
        setLines(ls => [...ls, { key: p.id, productId: p.id, variantId: null, variantSku: null, label: p.name, qty: 0 }]);
      }
    }
  }

  function updateQty(key, qty) {
    setLines(ls => ls.map(l => l.key === key ? { ...l, qty: Number(qty) } : l));
  }

  function removeLine(key) {
    setLines(ls => ls.filter(l => l.key !== key));
  }

  async function handleSave() {
    const activeLines = lines.filter(l => l.qty > 0);
    if (activeLines.length === 0) { setError('Enter at least one quantity.'); return; }
    setSaving(true);
    try {
      for (const line of activeLines) {
        const variant = line.variantId ? variants.find(v => v.id === line.variantId) : null;
        const product = products.find(p => p.id === line.productId);
        const current = variant ? (variant.qty_on_hand || 0) : (product?.stock_quantity || 0);
        const newQty = current + line.qty;
        if (variant) {
          await base44.entities.ProductVariant.update(line.variantId, { qty_on_hand: newQty });
        } else {
          await base44.entities.Product.update(line.productId, { stock_quantity: newQty });
        }
        await base44.entities.InventoryMovement.create({
          product_id: line.productId, variant_sku: line.variantSku || null,
          type: 'Received', quantity: line.qty, previous_stock: current, new_stock: newQty,
          reason: 'Shipment received', created_at: new Date().toISOString(), created_by: currentUser?.email,
        });
      }
      await logAction({ action: 'receive_shipment', entity: 'Inventory', userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      qc.invalidateQueries({ queryKey: ['inventory-variants'] });
      qc.invalidateQueries({ queryKey: ['inventory-movements'] });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground flex items-center gap-2"><PackagePlus className="w-5 h-5 text-primary" /> Receive Shipment</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>
        <div className="flex flex-1 min-h-0 divide-x divide-border">
          {/* Product picker */}
          <div className="w-64 shrink-0 flex flex-col p-3 gap-2 overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground">Add products</p>
            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                className="bg-transparent text-xs flex-1 outline-none" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => addProduct(p)}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-muted text-xs transition-colors">
                  <p className="font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-muted-foreground">{p.sku}</p>
                </button>
              ))}
            </div>
          </div>
          {/* Lines */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {lines.length === 0 && (
                <p className="text-sm text-muted-foreground text-center pt-10">Select products from the left panel</p>
              )}
              {lines.map(line => (
                <div key={line.key} className="flex items-center gap-3 bg-muted/40 rounded-xl px-3 py-2">
                  <p className="flex-1 text-sm text-foreground truncate">{line.label}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => updateQty(line.key, Math.max(0, line.qty - 1))} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Minus className="w-3 h-3" /></button>
                    <input type="number" min="0" value={line.qty} onChange={e => updateQty(line.key, e.target.value)}
                      className="w-14 text-center px-1 py-1 rounded-lg border border-input bg-background text-sm" />
                    <button onClick={() => updateQty(line.key, line.qty + 1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Plus className="w-3 h-3" /></button>
                  </div>
                  <button onClick={() => removeLine(line.key)} className="text-muted-foreground hover:text-destructive text-xs ml-1">✕</button>
                </div>
              ))}
            </div>
            {error && <p className="px-4 text-xs text-destructive">{error}</p>}
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : `Receive ${lines.filter(l => l.qty > 0).length} items`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Product row in stock table ────────────────────────────────────────────────
function ProductRow({ product, variants, onAdjust }) {
  const [expanded, setExpanded] = useState(false);
  const hasVariants = product.has_variants && variants.length > 0;
  const displayQty = hasVariants ? variants.reduce((s, v) => s + (v.qty_on_hand || 0), 0) : (product.stock_quantity || 0);
  const status = stockStatus(displayQty, product.reorder_level);

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasVariants && (
              <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground p-0.5">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            <div>
              <p className="text-sm font-medium text-foreground">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.sku}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{product.reorder_level ?? 3}</td>
        <td className="px-4 py-3 text-sm font-semibold text-foreground">{hasVariants ? `${displayQty} total` : displayQty}</td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
        </td>
        <td className="px-4 py-3">
          {!hasVariants && (
            <button onClick={() => onAdjust(product, null)} className="text-xs text-primary hover:underline font-medium">Adjust</button>
          )}
        </td>
      </tr>
      {hasVariants && expanded && variants.map(v => {
        const vs = stockStatus(v.qty_on_hand || 0);
        return (
          <tr key={v.id} className="border-b border-border/40 bg-muted/10">
            <td className="px-4 py-2.5 pl-14">
              <p className="text-xs text-foreground">{[v.size, v.color].filter(Boolean).join(' / ')}</p>
              <p className="text-xs text-muted-foreground">{v.variant_sku}</p>
            </td>
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{v.qty_on_hand || 0}</td>
            <td className="px-4 py-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vs.color}`}>{vs.label}</span>
            </td>
            <td className="px-4 py-2.5">
              <button onClick={() => onAdjust(product, v)} className="text-xs text-primary hover:underline font-medium">Adjust</button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [showReceive, setShowReceive] = useState(false);
  const [tab, setTab] = useState('stock');
  const [movFilter, setMovFilter] = useState({ product: '', type: '', dateFrom: '', dateTo: '' });
  const [fixingStock, setFixingStock] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  // Remove orphan/duplicate variants that inflate stock totals. Runs a dry-run
  // first, shows what would change, then applies on confirm.
  async function handleFixStock() {
    setFixingStock(true);
    try {
      const preview = await base44.functions.invoke('cleanupOrphanVariants', { apply: false });
      const affected = preview?.products_affected || 0;
      const removed = preview?.variants_removed || 0;
      if (affected === 0) {
        alert('No orphan or duplicate variants found — all stock counts look correct.');
        return;
      }
      const sample = (preview.report || []).slice(0, 8)
        .map(r => `• ${r.sku || r.name}: ${r.stock_before} → ${r.stock_after}`).join('\n');
      const ok = window.confirm(
        `Found ${removed} stale variant(s) across ${affected} product(s) that inflate stock totals.\n\n` +
        `${sample}${(preview.report || []).length > 8 ? '\n…and more' : ''}\n\n` +
        `Remove them now and correct the counts?`
      );
      if (!ok) return;
      const result = await base44.functions.invoke('cleanupOrphanVariants', { apply: true });
      await logAction({ action: 'cleanup_orphan_variants', entity: 'Inventory', userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['inventory-variants'] });
      qc.invalidateQueries({ queryKey: ['inventory-products'] });
      alert(`Done — removed ${result?.variants_removed || 0} stale variant(s) across ${result?.products_affected || 0} product(s). Stock counts corrected.`);
    } catch (e) {
      alert(`Could not fix stock counts: ${e.message || e}`);
    } finally {
      setFixingStock(false);
    }
  }

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['inventory-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 1000),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: () => base44.entities.InventoryMovement.list('-created_date', 500),
  });

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  const lowStock = products.filter(p => {
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) return pvs.some(v => (v.qty_on_hand || 0) <= (p.reorder_level || 3));
    return (p.stock_quantity || 0) <= (p.reorder_level || 3);
  });

  const showMoney = canAccess('view_finances'); // super-admin only

  async function handleExport() {
    setExporting(true);
    setExportErr('');
    try {
      await downloadCsv('exportInventoryCsv');
    } catch (err) {
      setExportErr(err?.data?.data?.error || err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  // Print the stock table (one row per variant, or per product if none). Cost
  // and stock value are financial — only super-admins see them.
  function handlePrint() {
    const columns = ['Product', 'SKU', 'Variant', 'Qty on Hand', 'Total Stock', 'Reorder', 'Low Stock'];
    if (showMoney) columns.push('Unit Cost (USD)', 'Stock Value (USD)');
    const rows = [];
    for (const p of products) {
      const pvs = variantsByProduct[p.id] || [];
      const reorder = p.reorder_level ?? 3;
      const total = (p.has_variants && pvs.length > 0)
        ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
        : (p.stock_quantity || 0);
      const cost = Number(p.cost_usd || 0);
      const emit = (label, sku, qty) => {
        const row = [p.name || '', sku || '', label || '', qty, total, reorder, qty <= reorder ? 'Yes' : 'No'];
        if (showMoney) row.push(cost.toFixed(2), (cost * qty).toFixed(2));
        rows.push(row);
      };
      if (p.has_variants && pvs.length > 0) {
        for (const v of pvs) emit([v.size, v.color].filter(Boolean).join(' / '), v.variant_sku || p.sku, v.qty_on_hand || 0);
      } else {
        emit('', p.sku, p.stock_quantity || 0);
      }
    }
    printTable({ title: 'Inventory', columns, rows, meta: showMoney ? 'Financial' : 'Operational' });
  }

  async function handleAdjust({ newQty, movementType, reason }) {
    const { product, variant } = adjustTarget;
    await manualStockAdjust({ productId: product.id, variantSku: variant?.variant_sku || null, newQty, movementType, reason });
    await logAction({ action: `stock_${movementType.toLowerCase()}`, entity: variant ? 'ProductVariant' : 'Product', entityId: variant?.id || product.id, userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['inventory-products'] });
    qc.invalidateQueries({ queryKey: ['inventory-variants'] });
    qc.invalidateQueries({ queryKey: ['inventory-movements'] });
  }

  const filteredMovements = useMemo(() => movements.filter(m => {
    if (movFilter.product) {
      const p = products.find(p2 => p2.id === m.product_id);
      if (!p?.name.toLowerCase().includes(movFilter.product.toLowerCase())) return false;
    }
    if (movFilter.type && m.type !== movFilter.type) return false;
    if (movFilter.dateFrom && m.created_at < movFilter.dateFrom) return false;
    if (movFilter.dateTo && m.created_at > movFilter.dateTo + 'T23:59:59') return false;
    return true;
  }), [movements, movFilter, products]);

  if (!canAccess('manage_inventory')) return <AdminLayout><AccessDenied /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Warehouse className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Inventory</h1>
              <p className="text-sm text-muted-foreground">{products.length} products</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 border border-border text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">
              <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-2 border border-border text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted transition-colors">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={handleFixStock} disabled={fixingStock}
              title="Remove leftover/duplicate variants that inflate stock totals"
              className="flex items-center gap-2 bg-secondary/15 text-foreground border border-border px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary/25 transition-colors disabled:opacity-60">
              <Wrench className="w-4 h-4" /> {fixingStock ? 'Checking…' : 'Fix Stock Counts'}
            </button>
            <button onClick={() => setShowReceive(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors">
              <PackagePlus className="w-4 h-4" /> Receive Shipment
            </button>
          </div>
        </div>

        {exportErr && (
          <p className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{exportErr}</p>
        )}

        {/* Low-stock alert banner */}
        {lowStock.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
            ⚠️ <strong>{lowStock.length}</strong> product{lowStock.length > 1 ? 's' : ''} at or below reorder level: {lowStock.slice(0, 3).map(p => p.name).join(', ')}{lowStock.length > 3 ? '…' : ''}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
          {[['stock', 'Stock Levels'], ['movements', 'Movement Log']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Stock Levels */}
        {tab === 'stock' && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Product</th>
                    <th className="text-left px-4 py-3">Reorder At</th>
                    <th className="text-left px-4 py-3">Stock</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <ProductRow key={p.id} product={p} variants={variantsByProduct[p.id] || []}
                      onAdjust={(product, variant) => setAdjustTarget({ product, variant })} />
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No products found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Movement Log */}
        {tab === 'movements' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 bg-card border border-border rounded-2xl p-3">
              <div className="flex items-center gap-2 flex-1 min-w-[160px] bg-muted rounded-xl px-3 py-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input value={movFilter.product} onChange={e => setMovFilter(f => ({ ...f, product: e.target.value }))}
                  placeholder="Filter by product…" className="bg-transparent text-xs flex-1 outline-none" />
              </div>
              <select value={movFilter.type} onChange={e => setMovFilter(f => ({ ...f, type: e.target.value }))}
                className="bg-muted rounded-xl px-3 py-2 text-xs text-foreground outline-none border-0 cursor-pointer">
                <option value="">All types</option>
                {['Sold','Returned','Received','Correction','Damaged','Reserved','Released'].map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="date" value={movFilter.dateFrom} onChange={e => setMovFilter(f => ({ ...f, dateFrom: e.target.value }))}
                className="bg-muted rounded-xl px-3 py-2 text-xs text-foreground outline-none border-0 cursor-pointer" />
              <input type="date" value={movFilter.dateTo} onChange={e => setMovFilter(f => ({ ...f, dateTo: e.target.value }))}
                className="bg-muted rounded-xl px-3 py-2 text-xs text-foreground outline-none border-0 cursor-pointer" />
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Product</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-left px-4 py-3">Qty</th>
                      <th className="text-left px-4 py-3">Before → After</th>
                      <th className="text-left px-4 py-3">Reason</th>
                      <th className="text-left px-4 py-3 hidden md:table-cell">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredMovements.map(m => {
                      const prod = products.find(p => p.id === m.product_id);
                      return (
                        <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                            {m.created_at ? new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{prod?.name || m.product_id.slice(0, 8)}</p>
                            {m.variant_sku && <p className="text-xs text-muted-foreground">{m.variant_sku}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOVEMENT_COLORS[m.type] || 'bg-muted text-muted-foreground'}`}>{m.type}</span>
                          </td>
                          <td className={`px-4 py-3 font-semibold ${m.quantity < 0 ? 'text-destructive' : 'text-green-700'}`}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{m.previous_stock} → {m.new_stock}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">{m.reason || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">{m.created_by || '—'}</td>
                        </tr>
                      );
                    })}
                    {filteredMovements.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No movements match this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {adjustTarget && (
        <AdjustModal
          item={adjustTarget.variant || adjustTarget.product}
          isVariant={!!adjustTarget.variant}
          onClose={() => setAdjustTarget(null)}
          onSave={handleAdjust}
        />
      )}

      {showReceive && (
        <ReceiveShipmentModal
          products={products}
          variants={variants}
          currentUser={currentUser}
          onClose={() => setShowReceive(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['inventory-products'] });
            qc.invalidateQueries({ queryKey: ['inventory-variants'] });
            qc.invalidateQueries({ queryKey: ['inventory-movements'] });
          }}
        />
      )}
    </AdminLayout>
  );
}