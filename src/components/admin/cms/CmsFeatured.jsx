import React, { useState, useEffect } from 'react';

export default function CmsFeatured({ sectionMap, products, categories, onSave }) {
  const [featuredProductIds, setFeaturedProductIds] = useState([]);
  const [featuredCategoryIds, setFeaturedCategoryIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const pSection = sectionMap['featured_products'];
    const cSection = sectionMap['featured_categories'];
    if (pSection?.body) { try { setFeaturedProductIds(JSON.parse(pSection.body)); } catch {} }
    if (cSection?.body) { try { setFeaturedCategoryIds(JSON.parse(cSection.body)); } catch {} }
  }, [sectionMap]);

  function toggleProduct(id) {
    setFeaturedProductIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleCategory(id) {
    setFeaturedCategoryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    setSaving(true);
    await onSave('featured_products', { title: 'Featured Products', body: JSON.stringify(featuredProductIds), is_active: true, sort_order: 10 });
    await onSave('featured_categories', { title: 'Featured Categories', body: JSON.stringify(featuredCategoryIds), is_active: true, sort_order: 5 });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Featured Categories */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-3">
        <h2 className="font-heading font-semibold text-foreground">Featured Categories</h2>
        <p className="text-xs text-muted-foreground">Selected categories appear on the homepage.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {categories.map(c => (
            <label key={c.id}
              className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors text-sm
                ${featuredCategoryIds.includes(c.id) ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'}`}>
              <input type="checkbox" checked={featuredCategoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} className="rounded" />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
          {categories.length === 0 && <p className="col-span-4 text-sm text-muted-foreground">No active categories.</p>}
        </div>
      </div>

      {/* Featured Products */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-3">
        <h2 className="font-heading font-semibold text-foreground">Featured Products</h2>
        <p className="text-xs text-muted-foreground">Selected products appear in the "Featured" section.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
          {products.map(p => (
            <label key={p.id}
              className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors text-sm
                ${featuredProductIds.includes(p.id) ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted'}`}>
              <input type="checkbox" checked={featuredProductIds.includes(p.id)} onChange={() => toggleProduct(p.id)} className="rounded" />
              <span className="truncate flex-1">{p.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">${p.price_usd}</span>
            </label>
          ))}
          {products.length === 0 && <p className="col-span-3 text-sm text-muted-foreground">No active products.</p>}
        </div>
        <p className="text-xs text-muted-foreground">{featuredProductIds.length} selected</p>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
        {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Featured Selections'}
      </button>
    </div>
  );
}