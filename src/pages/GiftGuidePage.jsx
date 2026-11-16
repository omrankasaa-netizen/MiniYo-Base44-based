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
  outfit: { icon: Shirt, tabEn: '👕 Outfit', tabAr: '👕 طقم', en: '1. Pick an outfit', ar: '1. اختاري طقم', subEn: 'Rompers, sets and dresses in this size', subAr: 'رومبرات، أطقم وفساتين بهالمقاس' },
  cozy: { icon: Package, tabEn: '🧸 Cozy', tabAr: '🧸 دافي', en: '2. Add something cozy', ar: '2. زيدي شي دافي', subEn: 'Blankets, swaddles and jackets', subAr: 'حرامات، لفّات وجاكيتات' },
  extras: { icon: Sparkles, tabEn: '🧦 Extras', tabAr: '🧦 إضافات', en: '3. Finish with little extras', ar: '3. كمّلي بإضافات صغيرة', subEn: 'Socks, bonnets, tights and clips', subAr: 'كلسات، طواقي، كولونات وكليبات' },
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
          <select value={chosen?.id || ''} onChange={(e) => onPickVariant(e.target.value)}
            aria-label={t('Colour', 'اللون')}
            className="w-full min-h-[36px] rounded-lg border border-border bg-background px-2 text-xs">
            {colors.map((v) => <option key={v.id} value={v.id}>{v.color}</option>)}
          </select>
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
  // 'ready' (ready-made boxes) | 'build' (build your own); step within build.
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState('outfit');
  const [showAll, setShowAll] = useState(false);
  const resultsRef = React.useRef(null);

  useEffect(() => { safeSessionStorage.setItem(SEL_KEY, JSON.stringify(selection)); }, [selection]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setSelection({}); // pieces picked for another age/gender wouldn't fit
    setStep('outfit');
    setShowAll(false);
    if (key === 'age' && value) {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
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
  const activeMode = mode || (recs.ready.length > 0 ? 'ready' : 'build');
  const nextStep = STEPS.slice(STEPS.indexOf(step) + 1).find((k) => recs.steps[k].length > 0) || null;

  return (
    <div className="min-h-screen bg-background pb-32" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-6 pb-4 sm:pt-10 sm:pb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold mb-3">
          <Gift className="w-3.5 h-3.5" /> {t('Gift box builder', 'حضّري علبة هدية')}
        </div>
        <h1 className="text-2xl sm:text-4xl font-heading font-bold text-foreground mb-2">
          {t('Build the perfect baby gift', 'حضّري أحلى هدية للبيبي')}
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
          {t('3 quick taps: age, girl or boy, then a ready-made box or your own picks. We gift-wrap it and hide the prices.',
            '3 كبسات: العمر، بنت أو صبي، وبعدين علبة جاهزة أو اختياراتك. منغلّفها ومنخبّي الأسعار.')}
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        {/* Choose age + gender: big, obvious buttons */}
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 mb-6 shadow-sm">
          <p className="text-base font-bold text-foreground mb-3">
            <span className="inline-flex w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs items-center justify-center me-2">1</span>
            {t('How old is the baby?', 'قدّيش عمر البيبي؟')}
          </p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {AGE_OPTIONS.map((a) => (
              <button key={a.key} type="button" onClick={() => setFilter('age', a.key)}
                className={`min-h-[48px] px-2 rounded-2xl text-sm font-semibold transition-colors border ${age === a.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'}`}>
                {lang === 'ar' ? a.ar : a.en}
              </button>
            ))}
          </div>
          <p className="text-base font-bold text-foreground mb-3">
            <span className="inline-flex w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs items-center justify-center me-2">2</span>
            {t('Is it for a girl or a boy?', 'لبنت ولا لصبي؟')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {GENDER_OPTIONS.map((g) => (
              <button key={g.key} type="button" onClick={() => setFilter('for', g.key === 'any' ? '' : g.key)}
                className={`min-h-[48px] px-2 rounded-2xl text-sm font-semibold transition-colors border ${gender === g.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'}`}>
                {g.key === 'girl' ? '👧 ' : g.key === 'boy' ? '👦 ' : '🤍 '}{lang === 'ar' ? g.ar : g.en}
              </button>
            ))}
          </div>
        </div>

        <div ref={resultsRef} className="scroll-mt-20" />

        {!age && (
          <div className="grid grid-cols-3 gap-3 text-center py-6">
            {[
              ['👶', t('Pick the age', 'اختاري العمر')],
              ['🧸', t('We show what’s in stock in that size', 'منورجيكي الموجود بمقاسه')],
              ['🎁', t('We gift-wrap & deliver', 'منغلّف ومنوصّل')],
            ].map(([icon, label]) => (
              <div key={icon} className="rounded-2xl bg-muted/50 p-3">
                <div className="text-2xl mb-1">{icon}</div>
                <p className="text-xs text-muted-foreground leading-snug">{label}</p>
              </div>
            ))}
          </div>
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

        {age && !isLoading && hasAnyRec && (
          <>
            <p className="text-base font-bold text-foreground mb-3">
              <span className="inline-flex w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs items-center justify-center me-2">3</span>
              {t('Choose your gift', 'اختاري هديتك')}
            </p>
            {/* Two clear paths */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              {[
                { key: 'ready', icon: '🎁', en: 'Ready-made box', ar: 'علبة جاهزة', subEn: 'Already put together', subAr: 'محضّرة إلك', disabled: recs.ready.length === 0 },
                { key: 'build', icon: '✨', en: 'Build my own', ar: 'حضّريها بنفسك', subEn: 'Pick piece by piece', subAr: 'قطعة قطعة', disabled: false },
              ].map((o) => (
                <button key={o.key} type="button" disabled={o.disabled} onClick={() => setMode(o.key)}
                  className={`rounded-2xl border p-3 text-start transition-colors disabled:opacity-40 ${activeMode === o.key ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border bg-card'}`}>
                  <span className="text-xl">{o.icon}</span>
                  <p className="text-sm font-bold text-foreground mt-1">{lang === 'ar' ? o.ar : o.en}</p>
                  <p className="text-xs text-muted-foreground">{o.disabled ? t('None for this age yet', 'ما في لهالعمر هلّق') : (lang === 'ar' ? o.subAr : o.subEn)}</p>
                </button>
              ))}
            </div>

            {activeMode === 'ready' && (
              <section className="mb-10">
                <p className="text-sm text-muted-foreground mb-3">{t('Tap a box to see exactly what’s inside.', 'كبسي على العلبة لتشوفي شو في جوّا.')}</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {recs.ready.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </section>
            )}

            {activeMode === 'build' && (
              <section className="mb-10">
                {/* Step tabs */}
                <div className="mb-3">
                  <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1">
                    {STEPS.map((k) => {
                      const copy = STEP_COPY[k];
                      const count = recs.steps[k].filter((e) => e.product.id in selection).length;
                      const empty = recs.steps[k].length === 0;
                      return (
                        <button key={k} type="button" disabled={empty} onClick={() => { setStep(k); setShowAll(false); }}
                          className={`relative min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 ${step === k ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>
                          {lang === 'ar' ? copy.tabAr : copy.tabEn}
                          {count > 0 && (
                            <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-[18px]">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{lang === 'ar' ? STEP_COPY[step].subAr : STEP_COPY[step].subEn}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {(showAll ? recs.steps[step] : recs.steps[step].slice(0, 6)).map((e) => (
                    <BuilderItem key={e.product.id} entry={e} t={t} lang={lang}
                      selectedVariantId={e.product.id in selection ? selection[e.product.id] : undefined}
                      onToggle={(vid) => toggle(e.product.id, vid)}
                      onPickVariant={(vid) => pickVariant(e.product.id, vid)} />
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  {!showAll && recs.steps[step].length > 6 && (
                    <button type="button" onClick={() => setShowAll(true)}
                      className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-semibold text-foreground">
                      {t('Show more', 'شوفي أكتر')} ({recs.steps[step].length - 6})
                    </button>
                  )}
                  {nextStep && (
                    <button type="button" onClick={() => { setStep(nextStep); setShowAll(false); resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      className="flex-1 min-h-[44px] rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                      {t('Next:', 'التالي:')} {lang === 'ar' ? STEP_COPY[nextStep].tabAr : STEP_COPY[nextStep].tabEn} →
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-3 z-40 px-3 sm:px-4">
          <div className="max-w-3xl mx-auto rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg p-3 flex items-center gap-3">
            <div className="hidden min-[380px]:flex -space-x-2 rtl:space-x-reverse shrink-0">
              {picked.slice(0, 3).map(({ product }) => {
                const im = normalizeImages([product.image_url])[0];
                return im ? <img key={product.id} src={imageSrc(im, 'thumb')} alt="" className="w-9 h-9 rounded-full border-2 border-card object-cover" /> : null;
              })}
            </div>
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
              {added ? t('Added ✓', 'انضافت ✓') : t('Add to cart', 'زيدي عالسلة')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
