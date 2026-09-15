import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Sparkles, Upload, Trash2, Plus, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

// ─── Add by Photos ──────────────────────────────────────────────────────────
// AI-assisted product creation: drop product photos in, Gemini Flash drafts
// name (EN + Lebanese Arabic), description, category, gender, age, tags and a
// SKU hint for each. The operator reviews every card, fills what AI must never
// decide (price, cost, stock, sizes) and creates the products — always as
// status 'Hidden' so nothing goes live unreviewed.
//
// The AI endpoint (aiProductDraft) only READS photos and returns drafts; all
// catalog writes happen here through the normal entity API, identical to the
// manual ProductForm path (same fields, same variant/image rows).

const MAX_EDGE = 1024; // downscale copy sent to AI (cost + payload control)
const ANALYZE_BATCH = 4; // images per aiProductDraft call

function slugifyLocal(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

// Downscale a photo for the AI call. Returns { base64, mime } (JPEG).
function downscaleForAi(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

const inputCls = 'bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none w-full placeholder:text-muted-foreground';
const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

export default function AddByPhotosPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();

  // items: [{ id, file, preview, aiData, status, error, draft, price, cost, sizeRows, simpleStock, creating, created, createError }]
  const [items, setItems] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => base44.entities.Category.list('sort_order', 200),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const takenSkus = useMemo(
    () => new Set(products.map((p) => String(p.sku || '').toLowerCase()).filter(Boolean)),
    [products],
  );

  function patchItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const preview = URL.createObjectURL(file);
      try {
        const aiData = await downscaleForAi(file);
        setItems((prev) => [...prev, {
          id, file, preview, aiData, status: 'ready', error: '',
          draft: null, price: '', cost: '', sizeRows: [], simpleStock: '',
          creating: false, created: false, createError: '',
        }]);
      } catch {
        setItems((prev) => [...prev, {
          id, file, preview, aiData: null, status: 'error', error: 'Unreadable image file',
          draft: null, price: '', cost: '', sizeRows: [], simpleStock: '',
          creating: false, created: false, createError: '',
        }]);
      }
    }
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function analyzeAll() {
    const targets = items.filter((it) => it.status === 'ready' || it.status === 'error');
    if (!targets.length) return;
    setAnalyzing(true);
    try {
      for (let i = 0; i < targets.length; i += ANALYZE_BATCH) {
        const batch = targets.slice(i, i + ANALYZE_BATCH);
        for (const it of batch) patchItem(it.id, { status: 'analyzing', error: '' });
        try {
          const res = await base44.functions.invoke('aiProductDraft', {
            images: batch.map((it) => ({ data: it.aiData.base64, mime_type: it.aiData.mime })),
          });
          const drafts = res?.data?.drafts || [];
          drafts.forEach((r, j) => {
            const item = batch[r.index ?? j];
            if (!item) return;
            if (r.error) {
              patchItem(item.id, { status: 'error', error: r.error });
            } else {
              patchItem(item.id, {
                status: 'drafted',
                draft: { ...r.draft, tags: (r.draft.tags || []).join(', ') },
                issues: r.issues || [],
                // Pre-fill size rows from the AI's suggested run (operator sets qty).
                sizeRows: (r.draft.sizes || []).map((size) => ({ size, qty: '' })),
              });
            }
          });
        } catch (e) {
          const msg = e?.data?.error || e?.message || 'AI request failed';
          for (const it of batch) patchItem(it.id, { status: 'error', error: msg });
        }
      }
    } finally {
      setAnalyzing(false);
    }
  }

  // ── create ────────────────────────────────────────────────────────────────
  function validateItem(it) {
    const d = it.draft || {};
    if (!d.name?.trim() && !d.name_ar?.trim()) return 'Name is required';
    const sku = (d.sku || '').trim();
    if (!sku) return 'SKU is required';
    if (takenSkus.has(sku.toLowerCase()) && !it.created) return `SKU "${sku}" already exists`;
    const dupInBatch = items.filter((o) => o.id !== it.id && o.draft && (o.draft.sku || '').trim().toLowerCase() === sku.toLowerCase()).length;
    if (dupInBatch) return `SKU "${sku}" is used by another card in this batch`;
    if (!d.category_id && !d.category_suggestion) return 'Pick or create a category';
    const price = Number(it.price);
    if (!price || price <= 0) return 'Price (USD) is required';
    const hasSizes = it.sizeRows.length > 0;
    if (!hasSizes && !(Number(it.simpleStock) >= 0 && it.simpleStock !== '')) return 'Enter stock (or add sizes)';
    if (hasSizes && it.sizeRows.some((r) => !r.size.trim())) return 'Every size row needs a size label';
    return null;
  }

  async function createOne(it) {
    const d = it.draft;
    patchItem(it.id, { creating: true, createError: '' });
    try {
      // 1. Category — create on the fly when the operator accepted the AI's
      //    suggested new category.
      let categoryId = d.category_id;
      if (!categoryId && d.category_suggestion) {
        const slug = slugifyLocal(d.category_suggestion);
        const existing = categories.find((c) => c.slug === slug || c.name.toLowerCase() === d.category_suggestion.toLowerCase());
        if (existing) {
          categoryId = existing.id;
        } else {
          const cat = await base44.entities.Category.create({
            slug, name: d.category_suggestion, name_ar: d.category_suggestion,
            parent_id: null, is_active: true, sort_order: categories.length,
          });
          categoryId = cat.id;
        }
      }

      // 2. Upload the ORIGINAL photo through the normal pipeline (optimize → R2).
      const up = await base44.integrations.Core.UploadFile({ file: it.file });
      const imageUrl = up.file_url || up.url;

      // 3. Create the product — Hidden until the operator publishes it.
      const sku = d.sku.trim().toUpperCase();
      const slug = slugifyLocal(sku || d.name);
      const hasVariants = it.sizeRows.length > 0;
      const payload = {
        slug, sku,
        name: d.name?.trim() || d.name_ar?.trim(),
        name_ar: d.name_ar?.trim() || '',
        description: d.description || '',
        description_ar: d.description_ar || '',
        category_id: categoryId || null,
        gender: d.gender || null,
        age_group: d.age_group || null,
        color: d.color || '',
        tags: (d.tags || '').trim(),
        price_usd: Number(it.price),
        compare_at_price_usd: null,
        cost_usd: it.cost !== '' ? Number(it.cost) : null,
        currency: 'USD',
        has_variants: hasVariants,
        stock_quantity: hasVariants ? 0 : Number(it.simpleStock || 0),
        sizes: hasVariants ? it.sizeRows.map((r) => r.size.trim()).join('|') : '',
        is_new: true, // photo-added products are new arrivals by definition
        is_featured: false,
        status: 'Hidden',
        image_url: imageUrl,
      };
      const created = await base44.entities.Product.create(payload);

      // 4. Primary image row (same shape as bulk import / ProductForm).
      await base44.entities.ProductImage.create({
        product_id: created.id, url: imageUrl, image_url: imageUrl,
        variants: up.variants || null, is_primary: true, sort_order: 0,
        alt: payload.name, alt_ar: payload.name_ar, focal: null, crop: null,
      });

      // 5. Variant rows with stock (only rows with a size label; qty ≥ 0).
      for (const r of it.sizeRows) {
        const size = r.size.trim();
        if (!size) continue;
        await base44.entities.ProductVariant.create({
          product_id: created.id,
          variant_sku: `${sku}-${size}`.replace(/\s+/g, '').toUpperCase(),
          size, color: d.color || '', qty_on_hand: Number(r.qty) || 0, qty_reserved: 0,
        });
      }

      patchItem(it.id, { creating: false, created: true, productId: created.id });
      return true;
    } catch (e) {
      patchItem(it.id, { creating: false, createError: e?.data?.error || e?.message || 'Create failed' });
      return false;
    }
  }

  async function createAll() {
    setCreatingAll(true);
    try {
      for (const it of items) {
        if (it.status !== 'drafted' || it.created || it.creating) continue;
        if (validateItem(it)) continue; // invalid cards stay for the operator to fix
        await createOne(it);
      }
      await qc.invalidateQueries({ queryKey: ['admin-products'] });
      await logAction({ action: 'ai_photo_create', entity: 'Product', userName: currentUser?.email });
    } finally {
      setCreatingAll(false);
    }
  }

  if (!canAccess('edit_products')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const readyCount = items.filter((it) => it.status === 'ready' || it.status === 'error').length;
  const drafted = items.filter((it) => it.status === 'drafted');
  const validCount = drafted.filter((it) => !it.created && !validateItem(it)).length;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Add by Photos
          </h1>
          <p className="text-sm text-muted-foreground">
            Drop product photos — AI drafts the name, description, category, tags and SKU.
            You only set price, cost, sizes and stock. Products are created as <b>Hidden</b> until you publish them.
          </p>
        </div>

        {/* Upload */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl py-10 cursor-pointer hover:bg-muted/40 transition-colors">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Drop photos here or tap to choose</span>
            <span className="text-xs text-muted-foreground">One photo per product · JPG/PNG</span>
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2">
                {items.map((it) => (
                  <div key={it.id} className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted group">
                    <img src={it.preview} alt="" className="w-full h-full object-cover" />
                    {it.status === 'analyzing' && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                    {it.created && (
                      <div className="absolute inset-0 bg-green-600/60 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <button onClick={() => removeItem(it.id)}
                      className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={analyzeAll} disabled={analyzing || readyCount === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {analyzing ? 'Analyzing…' : `Analyze ${readyCount} photo${readyCount === 1 ? '' : 's'} with AI`}
              </button>
            </div>
          )}
        </div>

        {/* Draft cards */}
        {drafted.length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold text-foreground">Review drafts</h2>
            <button onClick={createAll} disabled={creatingAll || validCount === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              {creatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {creatingAll ? 'Creating…' : `Create ${validCount} product${validCount === 1 ? '' : 's'} (Hidden)`}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafted.map((it) => {
            const d = it.draft;
            const validationError = it.created ? null : validateItem(it);
            return (
              <div key={it.id} className={`bg-card border rounded-2xl p-4 space-y-3 ${it.created ? 'border-green-300 opacity-80' : 'border-border'}`}>
                <div className="flex gap-3">
                  <img src={it.preview} alt="" className="w-20 h-20 rounded-xl object-cover bg-muted shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className={labelCls}>Name</span>
                        <input className={inputCls} value={d.name} onChange={(e) => patchItem(it.id, { draft: { ...d, name: e.target.value } })} /></div>
                      <div><span className={labelCls}>الاسم بالعربي</span>
                        <input className={inputCls} dir="rtl" value={d.name_ar} onChange={(e) => patchItem(it.id, { draft: { ...d, name_ar: e.target.value } })} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><span className={labelCls}>SKU</span>
                        <input className={inputCls} value={d.sku || ''} onChange={(e) => patchItem(it.id, { draft: { ...d, sku: e.target.value.toUpperCase() } })} /></div>
                      <div><span className={labelCls}>Price USD *</span>
                        <input className={inputCls} type="number" min="0" step="0.5" value={it.price} onChange={(e) => patchItem(it.id, { price: e.target.value })} placeholder="0" /></div>
                      <div><span className={labelCls}>Cost USD</span>
                        <input className={inputCls} type="number" min="0" step="0.5" value={it.cost} onChange={(e) => patchItem(it.id, { cost: e.target.value })} placeholder="0" /></div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div><span className={labelCls}>Category</span>
                    <select className={inputCls} value={d.category_id || (d.category_suggestion ? '__new__' : '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchItem(it.id, { draft: { ...d, category_id: v === '__new__' ? '' : v, category_suggestion: v === '__new__' ? d.category_suggestion : '' } });
                      }}>
                      <option value="">— pick —</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {d.category_suggestion && <option value="__new__">＋ Create “{d.category_suggestion}”</option>}
                    </select></div>
                  <div><span className={labelCls}>Gender</span>
                    <select className={inputCls} value={d.gender} onChange={(e) => patchItem(it.id, { draft: { ...d, gender: e.target.value } })}>
                      <option value="">—</option>
                      {['Girls', 'Boys', 'Unisex'].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select></div>
                  <div><span className={labelCls}>Age group</span>
                    <select className={inputCls} value={d.age_group} onChange={(e) => patchItem(it.id, { draft: { ...d, age_group: e.target.value } })}>
                      <option value="">—</option>
                      {['Newborn', 'Baby', 'Toddler', 'Kids'].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><span className={labelCls}>Description</span>
                    <textarea className={`${inputCls} min-h-[60px]`} value={d.description} onChange={(e) => patchItem(it.id, { draft: { ...d, description: e.target.value } })} /></div>
                  <div><span className={labelCls}>الوصف بالعربي</span>
                    <textarea className={`${inputCls} min-h-[60px]`} dir="rtl" value={d.description_ar} onChange={(e) => patchItem(it.id, { draft: { ...d, description_ar: e.target.value } })} /></div>
                </div>

                <div><span className={labelCls}>Tags (comma separated)</span>
                  <input className={inputCls} value={d.tags} onChange={(e) => patchItem(it.id, { draft: { ...d, tags: e.target.value } })} />
                  {(d.new_tags || []).length > 0 && (
                    <p className="text-xs text-amber-600 mt-1">New storefront tags: {d.new_tags.join(', ')}</p>
                  )}
                </div>

                {/* Sizes & stock */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={labelCls + ' mb-0'}>Sizes & stock</span>
                    <button onClick={() => patchItem(it.id, { sizeRows: [...it.sizeRows, { size: '', qty: '' }] })}
                      className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                      <Plus className="w-3.5 h-3.5" /> Add size
                    </button>
                  </div>
                  {it.sizeRows.length === 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">No sizes — single stock:</span>
                      <input className={`${inputCls} max-w-[120px]`} type="number" min="0" value={it.simpleStock}
                        onChange={(e) => patchItem(it.id, { simpleStock: e.target.value })} placeholder="0" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {it.sizeRows.map((r, ri) => (
                        <div key={ri} className="flex items-center gap-1 bg-muted rounded-xl px-2 py-1.5">
                          <input className="bg-transparent w-16 text-sm outline-none" placeholder="Size" value={r.size}
                            onChange={(e) => patchItem(it.id, { sizeRows: it.sizeRows.map((x, xi) => xi === ri ? { ...x, size: e.target.value } : x) })} />
                          <input className="bg-transparent w-12 text-sm outline-none" type="number" min="0" placeholder="qty" value={r.qty}
                            onChange={(e) => patchItem(it.id, { sizeRows: it.sizeRows.map((x, xi) => xi === ri ? { ...x, qty: e.target.value } : x) })} />
                          <button onClick={() => patchItem(it.id, { sizeRows: it.sizeRows.filter((_, xi) => xi !== ri) })}
                            className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI notes + issues + validation */}
                {d.notes && <p className="text-xs text-muted-foreground italic">AI note: {d.notes}</p>}
                {(it.issues || []).map((iss, i) => (
                  <p key={i} className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {iss}</p>
                ))}
                {validationError && <p className="text-xs text-destructive">{validationError}</p>}
                {it.createError && <p className="text-xs text-destructive">{it.createError}</p>}

                <div className="flex justify-end gap-2">
                  {it.created ? (
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                      <CheckCircle2 className="w-4 h-4" /> Created (Hidden)
                    </span>
                  ) : (
                    <button onClick={() => createOne(it)} disabled={it.creating || !!validationError}
                      className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {it.creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Create product
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Errors from failed analyses */}
        {items.some((it) => it.status === 'error') && (
          <div className="space-y-1">
            {items.filter((it) => it.status === 'error').map((it) => (
              <p key={it.id} className="text-xs text-destructive">A photo failed analysis: {it.error}</p>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
