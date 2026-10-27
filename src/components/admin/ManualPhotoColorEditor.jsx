import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Image as ImageIcon, RefreshCw, Save } from 'lucide-react';
import { applyManualPhotoColors, loadManualPhotoColorCatalog } from '@/lib/photoColorClient';
import { logAction } from '@/lib/auditLog';

function assignmentsFor(product) {
  const map = {};
  for (const image of product?.images || []) {
    map[image.url] = product.colors.find((color) => color.image === image.url)?.key || '';
  }
  return map;
}

export default function ManualPhotoColorEditor({ currentUser, onApplied, onBusyChange }) {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [baseline, setBaseline] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (preferredId = '') => {
    setLoading(true);
    setError('');
    try {
      const rows = await loadManualPhotoColorCatalog();
      setProducts(rows);
      setProductId((current) => {
        const wanted = preferredId || current;
        return rows.some((p) => p.id === wanted) ? wanted : (rows[0]?.id || '');
      });
    } catch (e) {
      setError(e.message || 'Could not load product photos and colors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const product = products.find((p) => p.id === productId) || null;
  useEffect(() => {
    const initial = assignmentsFor(product);
    setBaseline(initial);
    setDrafts(initial);
    setNotice('');
    setError('');
  }, [product]);

  const changes = useMemo(() => (product?.images || [])
    .filter((image) => (drafts[image.url] || '') !== (baseline[image.url] || ''))
    .map((image) => ({ productId: product.id, imageUrl: image.url, colorKey: drafts[image.url] || '' })),
  [product, drafts, baseline]);

  async function save() {
    if (!product || changes.length === 0) return;
    setSaving(true);
    onBusyChange?.(true);
    setError('');
    setNotice('');
    try {
      const result = await applyManualPhotoColors(changes);
      await logAction({
        action: 'manual_assign_photo_colors',
        entity: 'ProductVariant',
        entityId: product.id,
        userName: currentUser?.email,
        details: `${changes.length} photo assignment(s); ${result?.variantsUpdated || 0} variants updated`,
      });
      onApplied?.();
      await load(product.id);
      setNotice(`Saved ${changes.length} photo assignment${changes.length === 1 ? '' : 's'}.${result?.skipped ? ` ${result.skipped} stale or invalid change(s) skipped.` : ''}`);
    } catch (e) {
      setError(e.message || 'Could not save photo assignments.');
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center space-y-3">
        <RefreshCw className="w-7 h-7 animate-spin text-primary mx-auto" />
        <p className="font-medium text-foreground">Loading product photos and color names…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/15 px-3.5 py-3 text-xs text-foreground">
        Choose the exact existing variant name for each photo. Saving replaces incorrect AI assignments; <strong>Unassigned</strong> removes a photo from its color.
      </div>

      {error && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-green-50 text-green-800"><Check className="w-4 h-4" />{notice}</p>}

      <div>
        <label htmlFor="manual-photo-product" className="block text-sm font-semibold text-foreground mb-1.5">Product</label>
        <select id="manual-photo-product" value={productId} disabled={saving}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm text-foreground">
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` — ${p.sku}` : ''}</option>)}
        </select>
      </div>

      {product ? (
        <>
          <p className="text-xs text-muted-foreground">
            {product.images.length} photos · {product.colors.length} color/pattern names. Selecting another photo for the same color replaces its previous assignment.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {product.images.map((image, index) => {
              const value = drafts[image.url] || '';
              const changed = value !== (baseline[image.url] || '');
              return (
                <div key={image.url} className={`flex gap-3 rounded-xl border p-3 ${changed ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                  <img src={image.url} alt={image.alt || `Product photo ${index + 1}`} loading="lazy"
                    className="w-24 h-28 rounded-lg object-cover bg-muted shrink-0" />
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5" htmlFor={`photo-color-${index}`}>Photo {index + 1}</label>
                    <select id={`photo-color-${index}`} value={value} disabled={saving}
                      onChange={(e) => setDrafts((old) => ({ ...old, [image.url]: e.target.value }))}
                      className="w-full min-h-[44px] rounded-lg border border-border bg-card px-2.5 text-sm text-foreground">
                      <option value="">Unassigned</option>
                      {product.colors.map((color) => <option key={color.key} value={color.key}>{color.label}</option>)}
                    </select>
                    {changed && <span className="text-xs text-primary font-medium mt-1.5">Unsaved change</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">Changes update mini-card previews and the product-page color selector.</p>
            <button onClick={save} disabled={saving || changes.length === 0}
              className="flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving…' : `Save assignments (${changes.length})`}
            </button>
          </div>
        </>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <ImageIcon className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No products have both photos and variant colors.</p>
        </div>
      )}
    </div>
  );
}
