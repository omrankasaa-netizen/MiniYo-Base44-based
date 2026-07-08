import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import ProductForm from '@/components/admin/ProductForm';
import { Plus, Search, Pencil, Copy, Trash2, Eye, EyeOff, Star, Download, Printer } from 'lucide-react';
import { stockStatus } from '@/lib/inventory';
import { downloadCsv, printTable } from '@/lib/adminExport';

const STATUS_COLORS = { Active: 'bg-green-50 text-green-700', Hidden: 'bg-muted text-muted-foreground' };

export default function ProductsPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterAge, setFilterAge] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editProduct, setEditProduct] = useState(null); // null=closed, {} = new, product=edit
  const [cloneSourceId, setCloneSourceId] = useState(null); // when set, the form seeds variants/images from this product
  const [showForm, setShowForm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => base44.entities.Category.list('sort_order', 200),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['admin-variants-all'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 1000),
  });

  const { data: productImages = [] } = useQuery({
    queryKey: ['admin-product-images'],
    queryFn: () => base44.entities.ProductImage.list('-created_date', 1000),
  });

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  const imagesByProduct = {};
  for (const img of productImages) {
    if (!imagesByProduct[img.product_id]) imagesByProduct[img.product_id] = [];
    imagesByProduct[img.product_id].push(img);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (q && !p.name?.toLowerCase().includes(q) && !p.sku?.toLowerCase().includes(q) && !p.name_ar?.includes(q)) return false;
      if (filterCat && p.category_id !== filterCat) return false;
      if (filterGender && p.gender !== filterGender) return false;
      if (filterAge && p.age_group !== filterAge) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterStock === 'in') {
        const qty = getQty(p, variantsByProduct[p.id] || []);
        if (qty <= 0) return false;
      }
      if (filterStock === 'out') {
        const qty = getQty(p, variantsByProduct[p.id] || []);
        if (qty > 0) return false;
      }
      return true;
    });
  }, [products, search, filterCat, filterGender, filterAge, filterStatus, filterStock, variants]);

  function getQty(p, pvs) {
    if (p.has_variants && pvs.length > 0) return pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0);
    return p.stock_quantity || 0;
  }

  function getPrimaryImage(productId) {
    const imgs = imagesByProduct[productId] || [];
    return imgs.find(i => i.is_primary)?.url || imgs[0]?.url || null;
  }

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  async function bulkAction(action) {
    const ids = [...selected];
    for (const id of ids) {
      if (action === 'show')     await base44.entities.Product.update(id, { status: 'Active' });
      if (action === 'hide')     await base44.entities.Product.update(id, { status: 'Hidden' });
      if (action === 'featured') await base44.entities.Product.update(id, { is_featured: true });
    }
    if (action === 'delete') {
      setConfirmDelete(ids);
      return;
    }
    await logAction({ action: `bulk_${action}`, entity: 'Product', userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-products'] });
    setSelected(new Set());
  }

  async function doDelete(ids) {
    for (const id of ids) await base44.entities.Product.delete(id);
    await logAction({ action: 'deleted', entity: 'Product', userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-products'] });
    setSelected(new Set());
    setConfirmDelete(null);
  }

  // Open the editor pre-filled with a deep copy of the source product as a NEW
  // draft (no id) so nothing is written until the owner saves a unique SKU. The
  // form seeds variants/images from `cloneSourceId` and recreates them fresh.
  function handleClone(p) {
    const { id, created_date, updated_date, ...rest } = p;
    setEditProduct({
      ...rest,
      sku: p.sku ? `${p.sku}-COPY` : '',
      slug: '', // re-derived from the new SKU on save to avoid handle collisions
      image_url: '', // primary image is recomputed from the cloned image rows
    });
    setCloneSourceId(p.id);
    setShowForm(true);
  }

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const showMoney = canAccess('view_finances'); // super-admin only

  async function handleExport() {
    setExporting(true);
    setExportErr('');
    try {
      await downloadCsv('exportProductsCsv');
    } catch (err) {
      setExportErr(err?.data?.data?.error || err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  // Print the current (filtered) table, expanded to ONE ROW PER SIZE/VARIANT so
  // the printed sheet shows stock per size per variant (matching the CSV).
  // Products without variants print a single row (Size/Variant blank, product
  // total stock). Cost is a financial column, only included for super-admins —
  // matching the server-side CSV gating.
  function handlePrint() {
    const columns = ['SKU', 'Name', 'Category', 'Size', 'Variant', 'Price (USD)', 'Stock', 'Status'];
    if (showMoney) columns.push('Cost (USD)');
    const rows = [];
    for (const p of filtered) {
      const pvs = variantsByProduct[p.id] || [];
      const price = Number(p.price_usd || 0).toFixed(2);
      const cost = Number(p.cost_usd || 0).toFixed(2);
      const cat = catMap[p.category_id] || '';
      const status = p.status || '';
      if (p.has_variants && pvs.length > 0) {
        for (const v of pvs) {
          const row = [
            v.variant_sku || p.sku || '', p.name || '', cat,
            v.size || '', v.color || '', price, v.qty_on_hand || 0, status,
          ];
          if (showMoney) row.push(cost);
          rows.push(row);
        }
      } else {
        const row = [
          p.sku || '', p.name || '', cat, '', '', price, p.stock_quantity || 0, status,
        ];
        if (showMoney) row.push(cost);
        rows.push(row);
      }
    }
    printTable({ title: 'Products — Stock by Size & Variant', columns, rows, meta: showMoney ? 'Financial' : 'Operational' });
  }

  if (!canAccess('view_products')) return <AdminLayout><AccessDenied /></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Products</h1>
            <p className="text-sm text-muted-foreground">{products.length} total</p>
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
            {canAccess('edit_products') && (
              <button
                onClick={() => { setEditProduct({}); setShowForm(true); }}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Product
              </button>
            )}
          </div>
        </div>
        {exportErr && (
          <p className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{exportErr}</p>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-muted rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name or SKU…"
              className="bg-transparent text-sm flex-1 outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
          {[
            { value: filterCat,    setter: setFilterCat,    placeholder: 'Category', options: categories.map(c => ({ v: c.id, l: c.name })) },
            { value: filterGender, setter: setFilterGender, placeholder: 'Gender',   options: ['Girls','Boys','Unisex'].map(v => ({ v, l: v })) },
            { value: filterAge,    setter: setFilterAge,    placeholder: 'Age',      options: ['Newborn','Baby','Toddler','Kids'].map(v => ({ v, l: v })) },
            { value: filterStatus, setter: setFilterStatus, placeholder: 'Status',   options: ['Active','Hidden'].map(v => ({ v, l: v })) },
            { value: filterStock,  setter: setFilterStock,  placeholder: 'Stock',    options: [{ v:'in', l:'In stock' }, { v:'out', l:'Out of stock' }] },
          ].map(({ value, setter, placeholder, options }) => (
            <select key={placeholder} value={value} onChange={e => setter(e.target.value)}
              className="bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none border-0 cursor-pointer">
              <option value="">{placeholder}: All</option>
              {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          ))}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && canAccess('edit_products') && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
            <div className="flex gap-1.5 ml-2">
              {[
                { action: 'show', icon: Eye, label: 'Show' },
                { action: 'hide', icon: EyeOff, label: 'Hide' },
                { action: 'featured', icon: Star, label: 'Featured' },
                { action: 'delete', icon: Trash2, label: 'Delete', red: true },
              ].map(({ action, icon: Icon, label, red }) => (
                <button key={action} onClick={() => bulkAction(action)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${red ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-muted'}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Stock</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No products found.</td></tr>
                )}
                {filtered.map(p => {
                  const pvs = variantsByProduct[p.id] || [];
                  const qty = getQty(p, pvs);
                  const st = stockStatus(qty, p.reorder_level);
                  const img = getPrimaryImage(p.id);
                  return (
                    <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${selected.has(p.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted shrink-0 overflow-hidden">
                            {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-muted" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-foreground">{p.name}</p>
                              {p.is_new && <span className="text-xs bg-accent/50 text-accent-foreground px-1.5 py-0.5 rounded-full">New</span>}
                              {p.is_featured && <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">★</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">{p.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{catMap[p.category_id] || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        ${p.price_usd?.toFixed(2)}
                        {p.compare_at_price_usd > p.price_usd && (
                          <span className="text-xs text-muted-foreground line-through ml-1">${p.compare_at_price_usd?.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                          {qty} — {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-muted text-muted-foreground'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {canAccess('edit_products') && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditProduct(p); setShowForm(true); }} title="Edit"
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleClone(p)} title="Duplicate"
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirmDelete([p.id])} title="Delete"
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <ProductForm
          product={editProduct}
          categories={categories}
          cloneSourceId={cloneSourceId}
          products={products}
          onClose={() => { setShowForm(false); setEditProduct(null); setCloneSourceId(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-products'] });
            qc.invalidateQueries({ queryKey: ['admin-variants-all'] });
            qc.invalidateQueries({ queryKey: ['admin-product-images'] });
            // Storefront/detail read images from their own caches; invalidate them
            // so deletions and framing edits reflect without a hard reload.
            qc.invalidateQueries({ queryKey: ['shop-product-images'] });
            qc.invalidateQueries({ queryKey: ['product-images'] });
            qc.invalidateQueries({ queryKey: ['form-images'] });
            qc.invalidateQueries({ queryKey: ['form-variants'] });
            setShowForm(false);
            setEditProduct(null);
            setCloneSourceId(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-heading font-semibold text-foreground mb-2">Delete {confirmDelete.length} product{confirmDelete.length > 1 ? 's' : ''}?</h3>
            <p className="text-sm text-muted-foreground mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
              <button onClick={() => doDelete(confirmDelete)} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}