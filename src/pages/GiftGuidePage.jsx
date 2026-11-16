import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gift, Check, Plus, Shirt, Sparkles, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import ProductCard from '@/components/storefront/ProductCard';
import { normalizeImages, imageSrc, handleImageError } from '@/lib/imageFraming';
import { safeSessionStorage } from '@/lib/safeStorage';
import {
  AGE_OPTIONS, GENDER_OPTIONS, STEPS, buildRecommendations, selectionTotal,
} from '@/lib/giftBuilder';

// "Build a gift box" (/gifts). Shopper picks the baby's age (+ girl/boy),
// we show the ready-made boxes for that age and in-stock pieces in that size,
// grouped into outfit → cozy → extras, with a running total and one
// "add all to cart" button. Gift wrapping / hidden prices are picked at checkout.

const STEP_COPY = {
  outfit: { icon: Shirt, en: '1. Pick an outfit', ar: '1. اختاري طقم', subEn: 'Rompers, sets and dresses in this size', subAr: 'رومبرات، أطقم وفساتين بهالمقاس' },
  cozy: { icon: Package, en: '2. Add something cozy', ar: '2. زيدي شي دافي', subEn: 'Blankets, swaddles and jackets', subAr: 'حرامات، لفّات وجاكيتات' },
  extras: { icon: Sparkles, en: '3. Finish with little extras', ar: '3. كمّلي بإضافات صغيرة', subEn: 'Socks, bonnets, tights and clips', subAr: 'كلسات، طواقي، كولونات وكليبات' },
};

const SEL_KEY = 'miniyo-gift-builder';

function loadSelection() {
  try { return JSON.parse(safeSessionStorage.getItem(SEL_KEY) || '{}') || {}; } catch { return {}; }
}

function BuilderItem({ entry, selectedVariantId, onToggle, onPickVariant, t, lang }) {
  const { product, options } = entry;
  const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
  const img = normalizeImages([product.image_url])[0];
  const isSelected = selectedVariantId !== undefined;
  const chosen = options.find((v) => v.id === selectedVariantId) || options[0] || null;
  const price = Number(chosen?.price_usd || product.price_usd || 0);
  const colors = options.filter((v) => v.color);
  const sizeLabel = chosen?.size && !/one ?size/i.test(chosen.size) ? chosen.size : null;

  return (
    <div className={`rounded-2xl border bg-card overflow-hidden flex flex-col transition-shadow ${isSelected ? 'border-primary ring-2 ring-primary/30 shadow-md' : 'border-border/60 shadow-sm'}`}>
      <Link to={`/product/${product.slug}`} className="block relative aspect-square bg-muted overflow-hidden">
        {img && (
          <img src={imageSrc(img, 'card')} alt={name} loading="lazy" decoding="async" onError={handleImageError}
            className="w-full h-full object-cover" />
        )}
        {isSelected && (
          <span className="absolute top-2 end-2 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
            <Check className="w-4 h-4" />
          </span>
        )}
      </Link>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{name}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground" dir="ltr">
          <span className="font-bold text-foreground text-sm">${price.toFixed(2)}</span>
          {sizeLabel && <span>{sizeLabel}</span>}
        </div>
        {colors.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('Colour', 'اللون')}>
            {colors.map((v) => (
              <button key={v.id} type="button" onClick={() => onPickVariant(v.id)}
                className={`px-2 py-0.5 rounded-full text-[11px] border ${chosen?.id === v.id ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground'}`}>
                {v.color}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => onToggle(chosen?.id ?? null)}
          className={`mt-auto min-h-[40px] rounded-full text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${isSelected ? 'bg-primary/10 text-primary border border-primary' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
          {isSelected ? <><Check className="w-4 h-4" /> {t('In your box', 'بالعلبة')}</> : <><Plus className="w-4 h-4" /> {t('Add to box', 'زيدي عالعلبة')}</>}
        </button>
      </div>
    </div>
  );
}

export default function GiftGuidePage() {
  const { t, lang } = useLang();
  const { addItem, setIsOpen } = useCart();
  const { freeShippingThreshold } = useSiteSettings();
  const [params, setParams] = useSearchParams();
  const age = params.get('age') || '';
  const gender = params.get('for') || 'any';
  // productId -> variantId (null for products without variants)
  const [selection, setSelection] = useState(loadSelection);
  const [added, setAdded] = useState(false);

  useEffect(() => { safeSessionStorage.setItem(SEL_KEY, JSON.stringify(selection)); }, [selection]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setSelection({}); // pieces picked for another age/gender wouldn't fit
  }

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['gift-builder-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, '-created_date', 1000),
    staleTime: 60_000,
  });
  const { data: variants = [] } = useQuery({
    queryKey: ['gift-builder-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 5000),
    staleTime: 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['gift-builder-categories'],
    queryFn: () => base44.entities.Category.list('name', 500),
    staleTime: 5 * 60_000,
  });

  const categorySlugById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.slug || ''])),
    [categories],
  );
  const recs = useMemo(
    () => buildRecommendations(products, variants, categorySlugById, { age, gender }),
    [products, variants, categorySlugById, age, gender],
  );

  const entriesById = useMemo(() => {
    const m = new Map();
    for (const k of STEPS) for (const e of recs.steps[k]) m.set(e.product.id, e);
    return m;
  }, [recs]);

  const picked = Object.entries(selection)
    .map(([pid, vid]) => {
      const e = entriesById.get(pid);
      if (!e) return null;
      const variant = vid ? e.options.find((v) => v.id === vid) || null : null;
      if (e.product.has_variants && !variant) return null;
      return { product: e.product, variant };
    })
    .filter(Boolean);
  const total = selectionTotal(picked);
  const toFree = Math.max(0, (freeShippingThreshold || 0) - total);

  function toggle(productId, variantId) {
    setSelection((s) => {
      const next = { ...s };
      if (productId in next) delete next[productId]; else next[productId] = variantId;
      return next;
    });
  }
  function pickVariant(productId, variantId) {
    setSelection((s) => ({ ...s, [productId]: variantId }));
  }
  function addBoxToCart() {
    for (const { product, variant } of picked) addItem(product, variant, 1);
    setAdded(true);
    setIsOpen(true);
    setTimeout(() => setAdded(false), 2500);
  }

  const hasAnyRec = recs.ready.length > 0 || STEPS.some((k) => recs.steps[k].length > 0);

  return (
    <div className="min-h-screen bg-background pb-32" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-10 pb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold mb-3">
          <Gift className="w-3.5 h-3.5" /> {t('Gift box builder', 'حضّري علبة هدية')}
        </div>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-foreground mb-2">
          {t('Build the perfect baby gift', 'حضّري أحلى هدية للبيبي')}
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
          {t('Tell us the baby’s age and we’ll suggest pieces that are in stock in that size. Gift wrapping and hidden prices are free to choose at checkout.',
            'قوليلنا عمر البيبي ومنقترحلك قطع متوفرة بمقاسه. فيكي تختاري تغليف الهدية وتخبية الأسعار عند الدفع.')}
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 mb-8 shadow-sm">
          <p className="text-sm font-semibold text-foreground mb-2">{t('How old is the baby?', 'قدّيش عمر البيبي؟')}</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {AGE_OPTIONS.map((a) => (
              <button key={a.key} type="button" onClick={() => setFilter('age', a.key)}
                className={`min-h-[40px] px-4 rounded-full text-sm font-medium transition-colors ${age === a.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                {lang === 'ar' ? a.ar : a.en}
              </button>
            ))}
          </div>
          <p className="text-sm font-semibold text-foreground mb-2">{t('For a…', 'الهدية لـ…')}</p>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((g) => (
              <button key={g.key} type="button" onClick={() => setFilter('for', g.key === 'any' ? '' : g.key)}
                className={`min-h-[40px] px-4 rounded-full text-sm font-medium transition-colors ${gender === g.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                {lang === 'ar' ? g.ar : g.en}
              </button>
            ))}
          </div>
        </div>

        {!age && (
          <p className="text-center text-muted-foreground py-10">{t('Pick an age above to see suggestions.', 'اختاري العمر لتشوفي الاقتراحات.')}</p>
        )}
        {age && isLoading && (
          <p className="text-center text-muted-foreground py-10">{t('Finding pieces in this size…', 'عم نفتّش على قطع بهالمقاس…')}</p>
        )}
        {age && !isLoading && !hasAnyRec && (
          <p className="text-center text-muted-foreground py-10">
            {t('Nothing in stock for this age right now — try another age or ', 'ما في شي متوفر لهالعمر هلّق — جرّبي عمر تاني أو ')}
            <Link to="/shop" className="text-primary underline">{t('browse the shop', 'تصفّحي المحل')}</Link>.
          </p>
        )}

        {age && recs.ready.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-1">{t('Ready-made gift boxes', 'علب هدايا جاهزة')}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t('Already put together for you — tap to see what’s inside.', 'محضّرة إلك — كبسي لتشوفي شو في جوّا.')}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {recs.ready.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {age && STEPS.map((k) => {
          const list = recs.steps[k];
          if (list.length === 0) return null;
          const copy = STEP_COPY[k];
          const Icon = copy.icon;
          return (
            <section key={k} className="mb-10">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-5 h-5 text-primary" />
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
                  {recs.ready.length > 0 && k === 'outfit' ? t('Or build your own — ', 'أو حضّريها بنفسك — ') : ''}{lang === 'ar' ? copy.ar : copy.en}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{lang === 'ar' ? copy.subAr : copy.subEn}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {list.map((e) => (
                  <BuilderItem key={e.product.id} entry={e} t={t} lang={lang}
                    selectedVariantId={e.product.id in selection ? selection[e.product.id] : undefined}
                    onToggle={(vid) => toggle(e.product.id, vid)}
                    onPickVariant={(vid) => pickVariant(e.product.id, vid)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-3 z-40 px-3 sm:px-4">
          <div className="max-w-3xl mx-auto rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                🎁 {picked.length} {picked.length === 1 ? t('piece', 'قطعة') : t('pieces', 'قطع')} · <span dir="ltr">${total.toFixed(2)}</span>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {toFree > 0
                  ? <>{t('Add', 'زيدي')} <span dir="ltr">${toFree.toFixed(2)}</span> {t('more for free delivery', 'كمان للتوصيل ببلاش')}</>
                  : t('Free delivery ✓ · gift wrap at checkout', 'التوصيل ببلاش ✓ · التغليف عند الدفع')}
              </p>
            </div>
            <button type="button" onClick={addBoxToCart}
              className={`shrink-0 min-h-[44px] px-5 rounded-xl text-sm font-semibold transition-colors ${added ? 'bg-green-600 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
              {added ? t('Added ✓', 'انضافت ✓') : t('Add box to cart', 'زيدي العلبة عالسلة')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
