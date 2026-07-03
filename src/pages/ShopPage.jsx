import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import ProductCard from '@/components/storefront/ProductCard';
import { buildImagesByProduct } from '@/lib/imageFraming';
import {
  productSizeBuckets,
  normalizeAge,
  genderMatchBuckets,
  availableSizeBuckets,
  availableAgeBuckets,
  availableGenderBuckets,
  SIZE_LABELS_AR,
  AGE_LABELS_AR,
  GENDER_LABELS_AR,
} from '@/lib/filterNormalize';
import { SlidersHorizontal, X, Search, ChevronDown, ChevronUp } from 'lucide-react';

// ── URL state helpers ──────────────────────────────────────────────────────────
function useUrlFilters() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  function get(key, def = '') { return params.get(key) || def; }
  function getArr(key) { const v = params.get(key); return v ? v.split(',').filter(Boolean) : []; }

  function set(updates) {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || (Array.isArray(v) && v.length === 0)) p.delete(k);
      else p.set(k, Array.isArray(v) ? v.join(',') : v);
    }
    navigate({ search: p.toString() }, { replace: true });
  }

  function clear() { navigate({ search: '' }, { replace: true }); }

  return { get, getArr, set, clear, params };
}

// ── Price slider ───────────────────────────────────────────────────────────────
function PriceSlider({ min, max, value, onChange }) {
  const [lo, hi] = value;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>${lo}</span><span>${hi}</span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute left-0 right-0 h-1.5 bg-muted rounded-full" />
        <div className="absolute h-1.5 bg-primary rounded-full"
          style={{ left: `${((lo - min) / (max - min)) * 100}%`, right: `${((max - hi) / (max - min)) * 100}%` }} />
        <input type="range" min={min} max={max} value={lo}
          onChange={e => { const v = Math.min(Number(e.target.value), hi - 1); onChange([v, hi]); }}
          className="absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md" />
        <input type="range" min={min} max={max} value={hi}
          onChange={e => { const v = Math.max(Number(e.target.value), lo + 1); onChange([lo, v]); }}
          className="absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md" />
      </div>
    </div>
  );
}

// ── Collapsible filter section ─────────────────────────────────────────────────
function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-semibold text-foreground pb-2">
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full">
      {label}
      <button onClick={onRemove}><X className="w-3 h-3" /></button>
    </span>
  );
}

// ── Main ShopPage ──────────────────────────────────────────────────────────────
export default function ShopPage() {
  const { t, lang } = useLang();
  const { liveDiscounts, getDiscountedPrice } = useDiscounts();
  const { get, getArr, set, clear, params } = useUrlFilters();
  const [mobileFilterOpen, setMobileFilterOpen] = React.useState(false);

  // URL-driven filter state
  const search = get('q');
  const filterCategory = get('category');
  const filterSubcategory = get('sub');
  const filterGender = get('gender');
  const filterAge = get('age');
  const filterSizes = getArr('sizes');
  const filterCollection = get('collection');
  const filterOnSale = get('sale') === '1';
  const filterInStock = get('stock') === '1';
  const filterSort = get('sort', 'new');
  const filterPriceMin = parseInt(get('pmin', '0'));
  const filterPriceMax = parseInt(get('pmax', '500'));

  // Data fetching
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['shop-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, '-created_date', 500),
  });

  const { data: images = [] } = useQuery({
    queryKey: ['shop-product-images'],
    queryFn: () => base44.entities.ProductImage.list('-created_date', 3000),
    enabled: products.length > 0,
    staleTime: 60_000,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['shop-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 3000),
    enabled: products.length > 0,
    staleTime: 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'sort_order', 100),
  });

  const { data: collections = [] } = useQuery({
    queryKey: ['collections'],
    queryFn: () => base44.entities.Collection.filter({ is_active: true }, 'name', 50),
  });

  // Build lookup maps: primary url + full ordered image list (with focal/crop)
  const imgMap = useMemo(() => {
    const m = {};
    for (const img of images) {
      if (!img.url) continue;
      if (!m[img.product_id] || img.is_primary) m[img.product_id] = img.url;
    }
    return m;
  }, [images]);

  const imagesByProduct = useMemo(() => buildImagesByProduct(images), [images]);

  const variantsByProduct = useMemo(() => {
    const m = {};
    for (const v of variants) { if (!m[v.product_id]) m[v.product_id] = []; m[v.product_id].push(v); }
    return m;
  }, [variants]);

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const collectionMap = useMemo(() => Object.fromEntries(collections.map(c => [c.id, c])), [collections]);

  // Category tree
  const categoryTree = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    const childrenMap = {};
    for (const c of categories) { if (c.parent_id) { if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = []; childrenMap[c.parent_id].push(c); } }
    return parents.map(p => ({ ...p, children: childrenMap[p.id] || [] }));
  }, [categories]);

  // Determine max price for slider
  const maxPrice = useMemo(() => {
    const m = Math.ceil(Math.max(...products.map(p => p.price_usd || 0), 100) / 10) * 10;
    return Math.min(m, 500);
  }, [products]);

  // Derive available filter options from NORMALIZED buckets (fixed logical
  // order, no ghost/empty buckets). Color facet intentionally removed.
  const availableSizes = useMemo(() => availableSizeBuckets(products), [products]);
  const availableAges = useMemo(() => availableAgeBuckets(products), [products]);
  const availableGenders = useMemo(() => availableGenderBuckets(products), [products]);

  // Enrich products with images and stock
  const enriched = useMemo(() => products.map(p => {
    const pvs = variantsByProduct[p.id] || [];
    const totalStock = p.has_variants && pvs.length > 0
      ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
      : (p.stock_quantity || 0);
    return { ...p, primaryImage: imgMap[p.id] || null, images: imagesByProduct[p.id] || [], totalStock };
  }), [products, imgMap, imagesByProduct, variantsByProduct]);

  // Check if product is on sale
  function isOnSale(p) {
    if (p.compare_at_price_usd && p.compare_at_price_usd > p.price_usd) return true;
    const discounted = getDiscountedPrice(p);
    return discounted < p.price_usd;
  }

  // Apply all filters
  const filtered = useMemo(() => {
    let list = enriched.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name?.toLowerCase().includes(q) && !(p.name_ar || '').includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false;
      }
      if (filterCategory) {
        const isInCategory = p.category_id === filterCategory || p.subcategory_id === filterCategory;
        if (!isInCategory) return false;
      }
      if (filterSubcategory && p.subcategory_id !== filterSubcategory) return false;
      // Gender: Unisex products surface under both Girls and Boys.
      if (filterGender && !genderMatchBuckets(p.gender).includes(filterGender)) return false;
      // Age: raw "Baby" normalizes to Newborn; "Kids" is dropped.
      if (filterAge && normalizeAge(p.age_group) !== filterAge) return false;
      if (filterCollection) {
        const ids = (p.collection_ids || '').split(',').map(s => s.trim());
        if (!ids.includes(filterCollection) && p.collection_id !== filterCollection) return false;
      }
      if (filterSizes.length > 0) {
        // A product matches if ANY of its size tokens maps to a selected bucket.
        const pBuckets = productSizeBuckets(p.sizes);
        if (!filterSizes.some(s => pBuckets.includes(s))) return false;
      }
      if (filterOnSale && !isOnSale(p)) return false;
      if (filterInStock && p.totalStock <= 0) return false;
      const effectivePrice = getDiscountedPrice(p);
      if (effectivePrice < filterPriceMin || effectivePrice > filterPriceMax) return false;
      return true;
    });

    // Sort
    switch (filterSort) {
      case 'price_asc': list = [...list].sort((a, b) => a.price_usd - b.price_usd); break;
      case 'price_desc': list = [...list].sort((a, b) => b.price_usd - a.price_usd); break;
      case 'featured': list = [...list].sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0)); break;
      default: list = [...list].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)); break;
    }
    return list;
  }, [enriched, search, filterCategory, filterSubcategory, filterGender, filterAge, filterCollection, filterSizes, filterOnSale, filterInStock, filterPriceMin, filterPriceMax, filterSort, liveDiscounts]);

  // Active filter chips
  const activeChips = useMemo(() => {
    const chips = [];
    if (search) chips.push({ label: `"${search}"`, key: 'q' });
    if (filterCategory) {
      const cat = catMap[filterCategory];
      chips.push({ label: `Category: ${cat ? (lang === 'ar' ? (cat.name_ar || cat.name) : cat.name) : filterCategory}`, key: 'category' });
    }
    if (filterSubcategory) {
      const cat = catMap[filterSubcategory];
      chips.push({ label: `Sub: ${cat ? (lang === 'ar' ? (cat.name_ar || cat.name) : cat.name) : filterSubcategory}`, key: 'sub' });
    }
    if (filterGender) chips.push({ label: lang === 'ar' ? (GENDER_LABELS_AR[filterGender] || filterGender) : filterGender, key: 'gender' });
    if (filterAge) chips.push({ label: lang === 'ar' ? (AGE_LABELS_AR[filterAge] || filterAge) : filterAge, key: 'age' });
    if (filterCollection) {
      const col = collectionMap[filterCollection];
      chips.push({ label: `Collection: ${col ? (lang === 'ar' ? (col.name_ar || col.name) : col.name) : filterCollection}`, key: 'collection' });
    }
    filterSizes.forEach(s => chips.push({ label: `${t('Size', 'المقاس')}: ${lang === 'ar' ? (SIZE_LABELS_AR[s] || s) : s}`, key: 'sizes', val: s, isArr: true }));
    if (filterOnSale) chips.push({ label: t('On Sale', 'تخفيضات'), key: 'sale' });
    if (filterInStock) chips.push({ label: t('In Stock', 'متوفر'), key: 'stock' });
    if (filterPriceMin > 0 || filterPriceMax < maxPrice) chips.push({ label: `$${filterPriceMin}–$${filterPriceMax}`, key: 'price' });
    return chips;
  }, [search, filterCategory, filterSubcategory, filterGender, filterAge, filterCollection, filterSizes, filterOnSale, filterInStock, filterPriceMin, filterPriceMax, maxPrice, catMap, collectionMap, lang]);

  function removeChip(chip) {
    if (chip.isArr) {
      set({ [chip.key]: filterSizes.filter(v => v !== chip.val) });
    } else if (chip.key === 'price') {
      set({ pmin: '', pmax: '' });
    } else {
      set({ [chip.key]: '' });
    }
  }

  const selectedCategoryChildren = filterCategory ? categoryTree.find(c => c.id === filterCategory)?.children || [] : [];

  // Shared filter panel content
  function FilterPanel() {
    return (
      <div className="space-y-0">
        {/* Category */}
        <FilterSection title={t('Category', 'الفئة')}>
          <div className="space-y-1">
            <button onClick={() => set({ category: '', sub: '' })}
              className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${!filterCategory ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
              {t('All Categories', 'جميع الفئات')}
            </button>
            {categoryTree.map(parent => (
              <div key={parent.id}>
                <button onClick={() => set({ category: parent.id, sub: '' })}
                  className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${filterCategory === parent.id ? 'text-primary font-semibold bg-primary/5' : 'text-foreground hover:bg-muted'}`}>
                  {lang === 'ar' ? (parent.name_ar || parent.name) : parent.name}
                </button>
                {(filterCategory === parent.id) && parent.children.length > 0 && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {parent.children.map(child => (
                      <button key={child.id} onClick={() => set({ sub: child.id })}
                        className={`w-full text-left text-xs px-2 py-1 rounded-lg transition-colors flex items-center gap-1.5
                          ${filterSubcategory === child.id ? 'text-primary font-semibold bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                        <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                        {lang === 'ar' ? (child.name_ar || child.name) : child.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </FilterSection>

        {/* Gender (Girls / Boys only; Unisex surfaces under both) */}
        {availableGenders.length > 0 && (
          <FilterSection title={t('Gender', 'الجنس')}>
            {availableGenders.map(g => (
              <button key={g} onClick={() => set({ gender: filterGender === g ? '' : g })}
                className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${filterGender === g ? 'text-primary font-semibold bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                {t(g, GENDER_LABELS_AR[g] || g)}
              </button>
            ))}
          </FilterSection>
        )}

        {/* Age (Newborn / Toddler only) */}
        {availableAges.length > 0 && (
          <FilterSection title={t('Age Group', 'الفئة العمرية')}>
            {availableAges.map(a => (
              <button key={a} onClick={() => set({ age: filterAge === a ? '' : a })}
                className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${filterAge === a ? 'text-primary font-semibold bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                {t(a, AGE_LABELS_AR[a] || a)}
              </button>
            ))}
          </FilterSection>
        )}

        {/* Sizes (clean clothing buckets, fixed age order) */}
        {availableSizes.length > 0 && (
          <FilterSection title={t('Size', 'المقاس')}>
            <div className="flex flex-wrap gap-1.5">
              {availableSizes.map(s => (
                <button key={s} onClick={() => set({ sizes: filterSizes.includes(s) ? filterSizes.filter(x => x !== s) : [...filterSizes, s] })}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterSizes.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
                  {t(s, SIZE_LABELS_AR[s] || s)}
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Price Range */}
        <FilterSection title={t('Price Range', 'نطاق السعر')}>
          <PriceSlider min={0} max={maxPrice}
            value={[filterPriceMin, filterPriceMax < filterPriceMin ? maxPrice : Math.min(filterPriceMax, maxPrice)]}
            onChange={([lo, hi]) => set({ pmin: lo > 0 ? lo : '', pmax: hi < maxPrice ? hi : '' })} />
        </FilterSection>

        {/* Collections */}
        {collections.length > 0 && (
          <FilterSection title={t('Collection', 'المجموعة')} defaultOpen={false}>
            <button onClick={() => set({ collection: '' })}
              className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${!filterCollection ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
              {t('All', 'الكل')}
            </button>
            {collections.map(col => (
              <button key={col.id} onClick={() => set({ collection: filterCollection === col.id ? '' : col.id })}
                className={`w-full text-left text-sm px-2 py-1 rounded-lg transition-colors ${filterCollection === col.id ? 'text-primary font-semibold bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                {lang === 'ar' ? (col.name_ar || col.name) : col.name}
              </button>
            ))}
          </FilterSection>
        )}

        {/* Toggles */}
        <FilterSection title={t('More Filters', 'فلاتر أخرى')} defaultOpen={false}>
          <label className="flex items-center gap-2.5 cursor-pointer py-1 group">
            <div onClick={() => set({ sale: filterOnSale ? '' : '1' })}
              className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${filterOnSale ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${filterOnSale ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-foreground">{t('On Sale only', 'التخفيضات فقط')}</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer py-1">
            <div onClick={() => set({ stock: filterInStock ? '' : '1' })}
              className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${filterInStock ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
              <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${filterInStock ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-foreground">{t('In Stock only', 'المتوفر فقط')}</span>
          </label>
        </FilterSection>
      </div>
    );
  }

  const activeCatName = filterCategory && catMap[filterCategory]
    ? (lang === 'ar' ? (catMap[filterCategory].name_ar || catMap[filterCategory].name) : catMap[filterCategory].name)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-2xl font-heading font-bold text-foreground">
            {activeCatName || t('Shop', 'المتجر')}
          </h1>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          {/* Search */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 flex-1 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => set({ q: e.target.value })}
              placeholder={t('Search…', 'بحث…')}
              className="bg-transparent text-sm flex-1 outline-none text-foreground" />
            {search && <button onClick={() => set({ q: '' })}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
          </div>

          {/* Mobile filter toggle */}
          <button onClick={() => setMobileFilterOpen(true)}
            className="lg:hidden flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground">
            <SlidersHorizontal className="w-4 h-4" />
            {t('Filter', 'فلتر')}
            {activeChips.length > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">{activeChips.length}</span>
            )}
          </button>

          {/* Sort */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{filtered.length} {t('items', 'منتج')}</span>
            <select value={filterSort} onChange={e => set({ sort: e.target.value })}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none cursor-pointer">
              <option value="new">{t('Newest', 'الأحدث')}</option>
              <option value="price_asc">{t('Price: Low → High', 'السعر: منخفض → عالٍ')}</option>
              <option value="price_desc">{t('Price: High → Low', 'السعر: عالٍ → منخفض')}</option>
              <option value="featured">{t('Featured', 'المميز')}</option>
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {activeChips.map((chip, i) => (
              <FilterChip key={i} label={chip.label} onRemove={() => removeChip(chip)} />
            ))}
            <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2">
              {t('Clear all', 'مسح الكل')}
            </button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="bg-card border border-border rounded-2xl p-4 sticky top-24">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm text-foreground">{t('Filters', 'الفلاتر')}</h2>
                {activeChips.length > 0 && (
                  <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive">
                    {t('Clear', 'مسح')}
                  </button>
                )}
              </div>
              <FilterPanel />
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-square bg-muted rounded-3xl animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <SlidersHorizontal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t('No products found. Try clearing some filters.', 'لم يُعثر على منتجات. جرب إزالة بعض الفلاتر.')}</p>
                {activeChips.length > 0 && (
                  <button onClick={clear} className="mt-3 text-sm text-primary underline">{t('Clear all filters', 'مسح جميع الفلاتر')}</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilterOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileFilterOpen(false)} />
          <div className={`fixed inset-y-0 z-50 w-80 max-w-[85vw] bg-card flex flex-col lg:hidden shadow-2xl ${lang === 'ar' ? 'left-0 border-r border-border' : 'right-0 border-l border-border'}`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="font-heading font-semibold text-foreground">{t('Filters', 'الفلاتر')}</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="p-2 rounded-xl hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <FilterPanel />
            </div>
            <div className="px-5 py-4 border-t border-border shrink-0 flex gap-3">
              <button onClick={() => { clear(); setMobileFilterOpen(false); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">
                {t('Clear All', 'مسح الكل')}
              </button>
              <button onClick={() => setMobileFilterOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                {t('Show Results', 'عرض النتائج')} ({filtered.length})
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}