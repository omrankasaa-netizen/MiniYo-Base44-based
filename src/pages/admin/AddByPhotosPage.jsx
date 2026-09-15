import React, { useState, useMemo, useRef } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Sparkles, Upload, Trash2, Plus, X, Loader2, CheckCircle2, AlertTriangle, ImagePlus } from 'lucide-react';

// ─── Add by Photos ──────────────────────────────────────────────────────────
// AI-assisted product creation: drop ONE PRODUCT'S photos (up to 4 — different
// angles, detail shots, label close-ups) and they land on a single product
// card. Gemini Flash reads all of the card's photos together and drafts the
// name (EN + Lebanese Arabic), description, category, gender, age, tags and a
// SKU hint. The operator reviews every card, fills what AI must never decide
// (price, cost, stock, sizes) and creates the products — always as status
// 'Hidden' so nothing goes live unreviewed.
//
// On create, ALL of the card's ORIGINAL photos go through the normal upload
// pipeline and are attached to the product (first photo = main/primary image,
// the rest fill the gallery), identical to the manual ProductForm path.
//
// The AI endpoint (aiProductDraft) only READS photos and returns drafts; all
// catalog writes happen here through the normal entity API.

const MAX_EDGE = 1024; // downscale copy sent to AI (cost + payload control)
const MAX_PHOTOS_PER_PRODUCT = 4; // mirrors server MAX_IMAGES_PER_ITEM

function slugifyLocal(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

function rid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

async function toPhoto(file) {
  const photo = { id: rid(), file, preview: URL.createObjectURL(file), aiData: null, error: '' };
  try {
    photo.aiData = await downscaleForAi(file);
  } catch {
    photo.error = 'Unreadable image file';
  }
  return photo;
}

function newGroup(photos) {
  return {
    id: rid(),
    photos,
    status: 'ready', // ready | analyzing | drafted | error
    error: '',
    draft: null,
    issues: [],
    price: '',
    cost: '',
    sizeRows: [],
    simpleStock: '',
    creating: false,
    created: false,
    createError: '',
    productId: null,
  };
}

const inputCls = 'bg-muted rounded-xl px-3 py-2 text-sm text-foreground outline-none w-full placeholder:text-muted-foreground';
const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

// Photo strip for one product card: thumbnails (first = main image), per-photo
// remove, and an add tile while under the cap. Read-only once created.
function PhotoStrip({ group, onRemovePhoto, onAddPhotos, addInputRef }) {
  const canEdit = !group.created && !group.creating;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {group.photos.map((p, pi) => (
        <div key={p.id} className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted group/ph shrink-0">
          <img src={p.preview} alt="" className="w-full h-full object-cover" />
          {pi === 0 && (
            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold text-center py-0.5">Main</span>
          )}
          {group.status === 'analyzing' && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
          {group.created && (
            <div className="absolute inset-0 bg-green-600/50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          )}
          {canEdit && (
            <button onClick={() => onRemovePhoto(group.id, p.id)}
              className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover/ph:opacity-100 transition-opacity">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {canEdit && group.photos.length < MAX_PHOTOS_PER_PRODUCT && (
        <button onClick={() => addInputRef.current?.click()}
          className="w-16 h-16 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:bg-muted/40 transition-colors shrink-0">
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px] font-medium">Add</span>
        </button>
      )}
      <input ref={addInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { onAddPhotos(group.id, e.target.files); e.target.value = ''; }} />
    </div>
  );
}

export default function AddByPhotosPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();

  // groups: one per PRODUCT. Each holds up to MAX_PHOTOS_PER_PRODUCT photos
  // (all analyzed together, all attached on create) + the editable draft.
  const [groups, setGroups] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);
  const addPhotoRefs = useRef({});

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

  function patchGroup(id, patch) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addRef(id) {
    if (!addPhotoRefs.current[id]) addPhotoRefs.current[id] = React.createRef();
    return addPhotoRefs.current[id];
  }

  // Each selection = one product's photo set → one card. If more than the
  // per-product cap is selected at once, spill over into additional cards so
  // no photo is silently dropped (the operator can move/remove after).
  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const photos = [];
    for (const file of files) photos.push(await toPhoto(file));
    setGroups((prev) => {
      const next = [...prev];
      for (let i = 0; i < photos.length; i += MAX_PHOTOS_PER_PRODUCT) {
        next.push(newGroup(photos.slice(i, i + MAX_PHOTOS_PER_PRODUCT)));
      }
      return next;
    });
  }

  async function addPhotosToGroup(groupId, fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const photos = [];
    for (const file of files) photos.push(await toPhoto(file));
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      const room = MAX_PHOTOS_PER_PRODUCT - g.photos.length;
      return { ...g, photos: [...g.photos, ...photos.slice(0, Math.max(0, room))] };
    }));
  }

  function removePhoto(groupId, photoId) {
    setGroups((prev) => prev
      .map((g) => (g.id === groupId ? { ...g, photos: g.photos.filter((p) => p.id !== photoId) } : g))
      .filter((g) => g.photos.length > 0 || g.draft)); // drop empty un-drafted cards
  }

  function removeGroup(id) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  // Analyze every not-yet-drafted card. One invoke per card: all of the
  // card's photos go in a SINGLE request so the AI drafts one entry for the
  // whole set. Sequential — typical use is a few products at a time, and one
  // slow/failing card never blocks the others.
  async function analyzeAll() {
    const targets = groups.filter((g) => g.status === 'ready' || g.status === 'error');
    if (!targets.length) return;
    setAnalyzing(true);
    try {
      for (const g of targets) {
        patchGroup(g.id, { status: 'analyzing', error: '' });
        const images = g.photos.filter((p) => p.aiData)
          .map((p) => ({ data: p.aiData.base64, mime_type: p.aiData.mime }));
        if (!images.length) {
          patchGroup(g.id, { status: 'error', error: 'No readable photos on this card' });
          continue;
        }
        try {
          const res = await base44.functions.invoke('aiProductDraft', { items: [{ images }] });
          const r = (res?.data?.drafts || [])[0];
          if (!r) throw new Error('Empty AI response');
          if (r.error) {
            patchGroup(g.id, { status: 'error', error: r.error });
          } else {
            patchGroup(g.id, {
              status: 'drafted',
              draft: { ...r.draft, tags: (r.draft.tags || []).join(', ') },
              issues: r.issues || [],
              // Pre-fill size rows from the AI's suggested run (operator sets qty).
              sizeRows: (r.draft.sizes || []).map((size) => ({ size, qty: '' })),
            });
          }
        } catch (e) {
          const msg = e?.data?.error || e?.message || 'AI request failed';
          patchGroup(g.id, { status: 'error', error: msg });
        }
      }
    } finally {
      setAnalyzing(false);
    }
  }

  // ── create ────────────────────────────────────────────────────────────────
  function validateGroup(g) {
    const d = g.draft || {};
    if (!g.photos.length) return 'Add at least one photo';
    if (!d.name?.trim() && !d.name_ar?.trim()) return 'Name is required';
    const sku = (d.sku || '').trim();
    if (!sku) return 'SKU is required';
    if (takenSkus.has(sku.toLowerCase()) && !g.created) return `SKU "${sku}" already exists`;
    const dupInBatch = groups.filter((o) => o.id !== g.id && o.draft && (o.draft.sku || '').trim().toLowerCase() === sku.toLowerCase()).length;
    if (dupInBatch) return `SKU "${sku}" is used by another card in this batch`;
    if (!d.category_id && !d.category_suggestion) return 'Pick or create a category';
    const price = Number(g.price);
    if (!price || price <= 0) return 'Price (USD) is required';
    const hasSizes = g.sizeRows.length > 0;
    if (!hasSizes && !(Number(g.simpleStock) >= 0 && g.simpleStock !== '')) return 'Enter stock (or add sizes)';
    if (hasSizes && g.sizeRows.some((r) => !r.size.trim())) return 'Every size row needs a size label';
    return null;
  }

  async function createOne(g) {
    const d = g.draft;
    patchGroup(g.id, { creating: true, createError: '' });
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

      // 2. Upload ALL of the card's ORIGINAL photos through the normal
      //    pipeline (optimize → R2). First photo = main image.
      const uploads = [];
      for (const p of g.photos) {
        uploads.push(await base44.integrations.Core.UploadFile({ file: p.file }));
      }
      const imageUrl = uploads[0].file_url || uploads[0].url;

      // 3. Create the product — Hidden until the operator publishes it.
      const sku = d.sku.trim().toUpperCase();
      const slug = slugifyLocal(sku || d.name);
      const hasVariants = g.sizeRows.length > 0;
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
        price_usd: Number(g.price),
        compare_at_price_usd: null,
        cost_usd: g.cost !== '' ? Number(g.cost) : null,
        currency: 'USD',
        has_variants: hasVariants,
        stock_quantity: hasVariants ? 0 : Number(g.simpleStock || 0),
        sizes: hasVariants ? g.sizeRows.map((r) => r.size.trim()).join('|') : '',
        is_new: true, // photo-added products are new arrivals by definition
        is_featured: false,
        status: 'Hidden',
        image_url: imageUrl,
      };
      const created = await base44.entities.Product.create(payload);

      // 4. Image rows for EVERY photo (same shape as bulk import / ProductForm).
      for (let i = 0; i < uploads.length; i++) {
        const up = uploads[i];
        const url = up.file_url || up.url;
        await base44.entities.ProductImage.create({
          product_id: created.id, url, image_url: url,
          variants: up.variants || null, is_primary: i === 0, sort_order: i,
          alt: payload.name, alt_ar: payload.name_ar, focal: null, crop: null,
        });
      }

      // 5. Variant rows with stock (only rows with a size label; qty ≥ 0).
      for (const r of g.sizeRows) {
        const size = r.size.trim();
        if (!size) continue;
        await base44.entities.ProductVariant.create({
          product_id: created.id,
          variant_sku: `${sku}-${size}`.replace(/\s+/g, '').toUpperCase(),
          size, color: d.color || '', qty_on_hand: Number(r.qty) || 0, qty_reserved: 0,
        });
      }

      patchGroup(g.id, { creating: false, created: true, productId: created.id });
      return true;
    } catch (e) {
      patchGroup(g.id, { creating: false, createError: e?.data?.error || e?.message || 'Create failed' });
      return false;
    }
  }

  async function createAll() {
    setCreatingAll(true);
    try {
      for (const g of groups) {
        if (g.status !== 'drafted' || g.created || g.creating) continue;
        if (validateGroup(g)) continue; // invalid cards stay for the operator to fix
        await createOne(g);
      }
      await qc.invalidateQueries({ queryKey: ['admin-products'] });
      await logAction({ action: 'ai_photo_create', entity: 'Product', userName: currentUser?.email });
    } finally {
      setCreatingAll(false);
    }
  }

  if (!canAccess('edit_products')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const readyCount = groups.filter((g) => g.status === 'ready' || g.status === 'error').length;
  const drafted = groups.filter((g) => g.status === 'drafted');
  const validCount = drafted.filter((g) => !g.created && !validateGroup(g)).length;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Add by Photos
          </h1>
          <p className="text-sm text-muted-foreground">
            Add one product's photos at a time (up to {MAX_PHOTOS_PER_PRODUCT} — angles, details, label).
            AI reads them together and drafts the name, description, category, tags and SKU.
            You only set price, cost, sizes and stock. Products are created as <b>Hidden</b> until you publish them.
          </p>
        </div>

        {/* Upload */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl py-10 cursor-pointer hover:bg-muted/40 transition-colors">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Drop a product's photos here or tap to choose</span>
            <span className="text-xs text-muted-foreground">Each upload = one product card · up to {MAX_PHOTOS_PER_PRODUCT} photos per product · JPG/PNG</span>
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={analyzeAll} disabled={analyzing || readyCount === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {analyzing ? 'Analyzing…' : `Analyze ${readyCount} product${readyCount === 1 ? '' : 's'} with AI`}
              </button>
              {drafted.length > 0 && (
                <button onClick={createAll} disabled={creatingAll || validCount === 0}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {creatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {creatingAll ? 'Creating…' : `Create ${validCount} product${validCount === 1 ? '' : 's'} (Hidden)`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Product cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((g) => {
            const d = g.draft;
            const validationError = g.created || g.status !== 'drafted' ? null : validateGroup(g);
            return (
              <div key={g.id} className={`bg-card border rounded-2xl p-4 space-y-3 ${g.created ? 'border-green-300 opacity-80' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-2">
                  <PhotoStrip group={g} onRemovePhoto={removePhoto} onAddPhotos={addPhotosToGroup} addInputRef={addRef(g.id)} />
                  {!g.created && (
                    <button onClick={() => removeGroup(g.id)} title="Remove this card"
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Pre-draft states */}
                {g.status === 'ready' && (
                  <p className="text-xs text-muted-foreground">Ready — hit “Analyze with AI” to draft this product.</p>
                )}
                {g.status === 'analyzing' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI is reading {g.photos.length} photo{g.photos.length === 1 ? '' : 's'}…
                  </p>
                )}
                {g.status === 'error' && (
                  <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {g.error}</p>
                )}

                {/* Draft form */}
                {g.status === 'drafted' && d && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className={labelCls}>Name</span>
                        <input className={inputCls} value={d.name} onChange={(e) => patchGroup(g.id, { draft: { ...d, name: e.target.value } })} /></div>
                      <div><span className={labelCls}>الاسم بالعربي</span>
                        <input className={inputCls} dir="rtl" value={d.name_ar} onChange={(e) => patchGroup(g.id, { draft: { ...d, name_ar: e.target.value } })} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><span className={labelCls}>SKU</span>
                        <input className={inputCls} value={d.sku || ''} onChange={(e) => patchGroup(g.id, { draft: { ...d, sku: e.target.value.toUpperCase() } })} /></div>
                      <div><span className={labelCls}>Price USD *</span>
                        <input className={inputCls} type="number" min="0" step="0.5" value={g.price} onChange={(e) => patchGroup(g.id, { price: e.target.value })} placeholder="0" /></div>
                      <div><span className={labelCls}>Cost USD</span>
                        <input className={inputCls} type="number" min="0" step="0.5" value={g.cost} onChange={(e) => patchGroup(g.id, { cost: e.target.value })} placeholder="0" /></div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div><span className={labelCls}>Category</span>
                        <select className={inputCls} value={d.category_id || (d.category_suggestion ? '__new__' : '')}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchGroup(g.id, { draft: { ...d, category_id: v === '__new__' ? '' : v, category_suggestion: v === '__new__' ? d.category_suggestion : '' } });
                          }}>
                          <option value="">— pick —</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          {d.category_suggestion && <option value="__new__">＋ Create “{d.category_suggestion}”</option>}
                        </select></div>
                      <div><span className={labelCls}>Gender</span>
                        <select className={inputCls} value={d.gender} onChange={(e) => patchGroup(g.id, { draft: { ...d, gender: e.target.value } })}>
                          <option value="">—</option>
                          {['Girls', 'Boys', 'Unisex'].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select></div>
                      <div><span className={labelCls}>Age group</span>
                        <select className={inputCls} value={d.age_group} onChange={(e) => patchGroup(g.id, { draft: { ...d, age_group: e.target.value } })}>
                          <option value="">—</option>
                          {['Newborn', 'Baby', 'Toddler', 'Kids'].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><span className={labelCls}>Description</span>
                        <textarea className={`${inputCls} min-h-[60px]`} value={d.description} onChange={(e) => patchGroup(g.id, { draft: { ...d, description: e.target.value } })} /></div>
                      <div><span className={labelCls}>الوصف بالعربي</span>
                        <textarea className={`${inputCls} min-h-[60px]`} dir="rtl" value={d.description_ar} onChange={(e) => patchGroup(g.id, { draft: { ...d, description_ar: e.target.value } })} /></div>
                    </div>

                    <div><span className={labelCls}>Tags (comma separated)</span>
                      <input className={inputCls} value={d.tags} onChange={(e) => patchGroup(g.id, { draft: { ...d, tags: e.target.value } })} />
                      {(d.new_tags || []).length > 0 && (
                        <p className="text-xs text-amber-600 mt-1">New storefront tags: {d.new_tags.join(', ')}</p>
                      )}
                    </div>

                    {/* Sizes & stock */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={labelCls + ' mb-0'}>Sizes & stock</span>
                        <button onClick={() => patchGroup(g.id, { sizeRows: [...g.sizeRows, { size: '', qty: '' }] })}
                          className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                          <Plus className="w-3.5 h-3.5" /> Add size
                        </button>
                      </div>
                      {g.sizeRows.length === 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">No sizes — single stock:</span>
                          <input className={`${inputCls} max-w-[120px]`} type="number" min="0" value={g.simpleStock}
                            onChange={(e) => patchGroup(g.id, { simpleStock: e.target.value })} placeholder="0" />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {g.sizeRows.map((r, ri) => (
                            <div key={ri} className="flex items-center gap-1 bg-muted rounded-xl px-2 py-1.5">
                              <input className="bg-transparent w-16 text-sm outline-none" placeholder="Size" value={r.size}
                                onChange={(e) => patchGroup(g.id, { sizeRows: g.sizeRows.map((x, xi) => xi === ri ? { ...x, size: e.target.value } : x) })} />
                              <input className="bg-transparent w-12 text-sm outline-none" type="number" min="0" placeholder="qty" value={r.qty}
                                onChange={(e) => patchGroup(g.id, { sizeRows: g.sizeRows.map((x, xi) => xi === ri ? { ...x, qty: e.target.value } : x) })} />
                              <button onClick={() => patchGroup(g.id, { sizeRows: g.sizeRows.filter((_, xi) => xi !== ri) })}
                                className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* AI notes + issues + validation */}
                    {d.notes && <p className="text-xs text-muted-foreground italic">AI note: {d.notes}</p>}
                    {(g.issues || []).map((iss, i) => (
                      <p key={i} className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {iss}</p>
                    ))}
                    {validationError && <p className="text-xs text-destructive">{validationError}</p>}
                    {g.createError && <p className="text-xs text-destructive">{g.createError}</p>}

                    <div className="flex justify-end gap-2">
                      {g.created ? (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                          <CheckCircle2 className="w-4 h-4" /> Created (Hidden)
                        </span>
                      ) : (
                        <button onClick={() => createOne(g)} disabled={g.creating || !!validationError}
                          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                          {g.creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Create product
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
