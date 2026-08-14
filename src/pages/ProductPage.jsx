import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag, ArrowLeft, ChevronLeft, ChevronRight, ShieldCheck, Truck, RotateCcw,
  Plus, Minus, MessageCircle, ChevronDown
} from 'lucide-react';
import ImageLightbox from '@/components/storefront/ImageLightbox';
import WishlistHeart from '@/components/storefront/WishlistHeart';
import { ReviewList, ReviewForm } from '@/components/storefront/ReviewCard';
import RatingStars from '@/components/storefront/RatingStars';
import { normalizeImages, imageSrc, imageSrcSet, DETAIL_SIZES, handleImageError, buildImagesByProduct } from '@/lib/imageFraming';
import { trackViewContent } from '@/lib/metaPixel';
import { ttViewContent } from '@/lib/tiktokPixel';
import { ga4TrackViewItem } from '@/lib/ga4';
import { availableQty } from '@/lib/inventory';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useCmsSection } from '@/hooks/useCmsSection';

function isValidPreloadedProduct(preloaded, slug) {
  if (!preloaded || typeof preloaded !== 'object') return false;
  if (preloaded.slug !== slug) return false;
  const product = preloaded.product;
  if (!product || typeof product !== 'object') return false;
  if (!product.id || !product.slug || !product.name) return false;
  if (product.price_usd == null) return false;
  if (!Array.isArray(preloaded.images) || !Array.isArray(preloaded.variants)) return false;
  return true;
}

function AccordionRow({ title, open, onToggle, children }) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-start bg-card"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground leading-[1.7]">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const { t, lang, isRTL } = useLang();
  const { addItem, setIsOpen } = useCart();
  const navigate = useNavigate();
  const siteSettings = useSiteSettings();
  const { section: sizeGuideSection } = useCmsSection('product_size_guide');
  const { section: careSection } = useCmsSection('product_care_default');
  const qc = useQueryClient();

  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [qty, setQty] = useState(1);
  const [selectorError, setSelectorError] = useState('');
  const [shakeSelector, setShakeSelector] = useState(false);
  const [showStickyBuy, setShowStickyBuy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const buyZoneRef = useRef(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    setImgIdx(0);
    setSelectedColor('');
    setSelectedSize('');
    setQty(1);
  }, [slug]);

  useEffect(() => {
    if (!buyZoneRef.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBuy(!entry.isIntersecting),
      { threshold: 0.25 }
    );
    observer.observe(buyZoneRef.current);
    return () => observer.disconnect();
  }, [buyZoneRef.current]);

  const { getProductDiscount, getDiscountedPrice } = useDiscounts();

  const rawPreloaded = typeof window !== 'undefined'
    ? (
      window.__PRELOADED_PRODUCT__
      || (window.__PRODUCT__ ? { slug: window.__PRODUCT__.slug, product: window.__PRODUCT__, images: [], variants: [], reviews: { published_count: 0 } } : null)
    )
    : null;
  const preloaded = isValidPreloadedProduct(rawPreloaded, slug) ? rawPreloaded : null;
  const seedProduct = preloaded?.product;

  const { data: products = [] } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => base44.entities.Product.filter({ slug }, 'slug', 1),
    enabled: !seedProduct,
    initialData: seedProduct ? [seedProduct] : undefined,
  });
  const product = seedProduct || products[0];

  const { data: images = [] } = useQuery({
    queryKey: ['product-images', product?.id],
    queryFn: () => base44.entities.ProductImage.filter({ product_id: product.id }, 'sort_order', 20),
    enabled: !!product?.id,
    initialData: preloaded?.images,
    initialDataUpdatedAt: preloaded ? 0 : undefined,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', product?.id],
    queryFn: () => base44.entities.ProductVariant.filter({ product_id: product.id }, 'size', 500),
    enabled: !!product?.id && product?.has_variants,
    initialData: preloaded?.variants,
    initialDataUpdatedAt: preloaded ? 0 : undefined,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: () => base44.entities.Review.filter({ product_id: product.id }, '-created_date', 50),
    enabled: !!product?.id,
  });

  const { data: completeLook = [] } = useQuery({
    queryKey: ['complete-look-products', product?.id, product?.category_id],
    queryFn: async () => {
      if (!product?.category_id) return [];
      const items = await base44.entities.Product.filter({ status: 'Active', category_id: product.category_id }, '-created_date', 12);
      return items.filter((p) => p.id !== product.id).slice(0, 3);
    },
    enabled: !!product?.id && !!product?.category_id,
    staleTime: 60_000,
  });

  const completeLookIds = useMemo(() => completeLook.map((p) => p.id), [completeLook]);
  const { data: completeLookImages = [] } = useQuery({
    queryKey: ['complete-look-images', completeLookIds.join(',')],
    queryFn: () => completeLookIds.length ? base44.entities.ProductImage.filter({ product_id: completeLookIds }, 'sort_order') : [],
    enabled: completeLookIds.length > 0,
  });

  useEffect(() => {
    if (!preloaded?.slug || preloaded.slug !== slug) return;
    qc.prefetchQuery({
      queryKey: ['product', slug],
      queryFn: () => base44.entities.Product.filter({ slug }, 'slug', 1),
    });
  }, [preloaded?.slug, slug, qc]);

  useEffect(() => {
    if (!product?.id) return;
    trackViewContent(product);
    ttViewContent(product);
    ga4TrackViewItem(product);
  }, [product?.id]);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
  const desc = lang === 'ar' ? (product.description_ar || product.description) : product.description;
  const hasCompareDiscount = product.compare_at_price_usd > product.price_usd;
  const autoDiscount = getProductDiscount(product);
  const discountedPrice = autoDiscount ? getDiscountedPrice(product) : null;
  const hasDiscount = hasCompareDiscount || !!autoDiscount;
  const displayPrice = discountedPrice ?? product.price_usd;
  const originalPrice = discountedPrice ? product.price_usd : (hasCompareDiscount ? product.compare_at_price_usd : null);
  const displayImages = normalizeImages(images);
  const imageCount = displayImages.length;
  const waNumber = String(siteSettings.whatsappNumber || '').replace(/\D/g, '');
  const waHelpLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(t('Need help with this item', 'أحتاج مساعدة في هذا المنتج'))}` : null;

  const publishedReviews = reviews.filter((r) => r.is_published);
  const preloadedReviewCount = Number(preloaded?.reviews?.published_count) || 0;
  const reviewCount = publishedReviews.length || preloadedReviewCount;
  const reviewAvg = reviewCount
    ? publishedReviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviewCount
    : 0;

  const variantSizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
  const variantColors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
  const stringSizes = product.sizes ? product.sizes.split('|').map((s) => s.trim()).filter(Boolean) : [];
  const stringColors = product.colors ? product.colors.split('|').map((c) => c.trim()).filter(Boolean) : [];
  const sizes = variantSizes.length > 0 ? variantSizes : stringSizes;
  const colors = variantColors.length > 0 ? variantColors : stringColors;
  const usesVariants = product.has_variants && variants.length > 0;
  const needsSize = usesVariants && sizes.length > 0;
  const needsColor = usesVariants && colors.length > 0;

  function variantStockFor({ size, color } = {}) {
    return variants
      .filter((v) => (size === undefined || v.size === size) && (color === undefined || v.color === color))
      .reduce((s, v) => s + availableQty(v), 0);
  }

  const selectedVariant = usesVariants && (!needsSize || selectedSize) && (!needsColor || selectedColor)
    ? variants.find((v) => (!needsSize || v.size === selectedSize) && (!needsColor || v.color === selectedColor)) || null
    : null;

  const stockQty = usesVariants
    ? (selectedVariant ? availableQty(selectedVariant) : 0)
    : availableQty(product);
  const canAdd = usesVariants ? !!selectedVariant && stockQty > 0 : stockQty > 0;

  // CTA state: before the shopper finishes picking options the button should
  // invite selection ("Select options"), not cry "Out of Stock" — stockQty is
  // 0 whenever no variant is selected yet, which read as unavailable inventory.
  const selectionComplete = !usesVariants || ((!needsSize || selectedSize) && (!needsColor || selectedColor));
  const totalVariantStock = usesVariants ? variants.reduce((s, v) => s + availableQty(v), 0) : stockQty;
  const allVariantsOos = usesVariants && variants.length > 0 && totalVariantStock <= 0;
  const ctaOutOfStock = usesVariants
    ? (allVariantsOos || (selectionComplete && stockQty <= 0))
    : stockQty <= 0;
  const ctaLabel = added
    ? t('Added ✓', 'تمت الإضافة ✓')
    : ctaOutOfStock
      ? t('Out of Stock', 'نفذ المخزون')
      : (usesVariants && !selectionComplete)
        ? t('Select options', 'اختاري الخيارات')
        : t('Add to Cart', 'أضف إلى السلة');

  const badgeCandidates = [];
  if (product.is_new) badgeCandidates.push({ key: 'new', label: t('New', 'جديد'), className: 'bg-primary text-primary-foreground' });
  if (product.is_featured) badgeCandidates.push({ key: 'best', label: t('Bestseller', 'الأكثر مبيعاً'), className: 'bg-primary text-primary-foreground' });
  if (stockQty > 0 && Number.isFinite(Number(product.reorder_level)) && stockQty <= Number(product.reorder_level)) {
    badgeCandidates.push({ key: 'low', label: `${t('Only', 'فقط')} ${stockQty} ${t('left', 'متبقٍ')}`, className: 'bg-accent text-accent-foreground' });
  }
  if (hasDiscount && originalPrice) {
    const pct = Math.max(1, Math.round(((Number(originalPrice) - Number(displayPrice)) / Number(originalPrice)) * 100));
    badgeCandidates.push({ key: 'sale', label: `${t('Sale', 'تخفيض')} ${pct}%`, className: 'bg-accent text-accent-foreground' });
  }

  function ensureVariantSelection() {
    if (needsSize && !selectedSize) {
      setSelectorError(t('Please choose a size', 'يرجى اختيار المقاس'));
      setShakeSelector(true);
      setTimeout(() => setShakeSelector(false), 300);
      return false;
    }
    if (needsColor && !selectedColor) {
      setSelectorError(t('Please choose a variant', 'يرجى اختيار اللون'));
      setShakeSelector(true);
      setTimeout(() => setShakeSelector(false), 300);
      return false;
    }
    setSelectorError('');
    return true;
  }

  function handleAdd(openDrawer = true) {
    if (!ensureVariantSelection() || !canAdd) return;
    addItem(product, selectedVariant || null, qty);
    setAdded(true);
    if (openDrawer) setIsOpen(true);
    setTimeout(() => setAdded(false), 1500);
  }

  function onGalleryTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onGalleryTouchEnd(e) {
    if (touchStartX.current == null || imageCount < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 45) {
      if (dx < 0) setImgIdx((i) => (i + 1) % imageCount);
      else setImgIdx((i) => (i - 1 + imageCount) % imageCount);
    }
    touchStartX.current = null;
  }

  const completeImageMap = buildImagesByProduct(completeLookImages);
  // Only show products that are in stock. For variant-based products we fall
  // back to qty_on_hand > 0 since individual variant stock isn't loaded here;
  // clicking navigates to the PDP where the user selects a variant.
  const inStockLook = completeLook.filter((p) =>
    p.has_variants ? Number(p.qty_on_hand || 0) > 0 : availableQty(p) > 0
  );
  const returnsBlurb = siteSettings.returnsBlurb || 'Easy exchange';
  const deliveryFlat = Number.isFinite(Number(siteSettings.deliveryFeeInside)) ? Number(siteSettings.deliveryFeeInside) : 3;
  // Show the outside-city fee too so the product page matches what checkout charges.
  const deliveryOutside = Number.isFinite(Number(siteSettings.deliveryFeeOutside)) ? Number(siteSettings.deliveryFeeOutside) : 5;
  const freeThreshold = Number.isFinite(Number(siteSettings.freeShippingThreshold)) ? Number(siteSettings.freeShippingThreshold) : 50;
  // If inside/outside differ, show a range so no user is surprised at checkout.
  const deliveryDisplay = deliveryFlat === deliveryOutside
    ? `$${deliveryFlat.toFixed(2)}`
    : `$${deliveryFlat.toFixed(2)}–$${deliveryOutside.toFixed(2)}`;

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-0" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <Link to="/shop" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} /> {t('Back to Shop', 'العودة للمتجر')}
        </Link>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div
              className="relative aspect-square bg-muted rounded-3xl overflow-hidden"
              onTouchStart={onGalleryTouchStart}
              onTouchEnd={onGalleryTouchEnd}
            >
              {displayImages.length > 0 ? (
                <img
                  src={imageSrc(displayImages[imgIdx], 'large')}
                  srcSet={imageSrcSet(displayImages[imgIdx])}
                  sizes={DETAIL_SIZES}
                  alt={name}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={handleImageError}
                  onClick={() => setLightboxOpen(true)}
                  className="absolute inset-0 w-full h-full object-contain cursor-zoom-in"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-16 h-16 text-accent" /></div>
              )}

              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                {badgeCandidates.slice(0, 2).map((badge) => (
                  <span key={badge.key} className={`${badge.className} text-xs font-semibold rounded-full px-3 py-1`}>
                    {badge.label}
                  </span>
                ))}
              </div>

              <WishlistHeart productId={product.id} product={product} className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/85 shadow" />

              {imageCount > 1 && (
                <>
                  <button
                    aria-label={t('Previous image', 'الصورة السابقة')}
                    onClick={() => setImgIdx((i) => (i - 1 + imageCount) % imageCount)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/85 rounded-full flex items-center justify-center shadow"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    aria-label={t('Next image', 'الصورة التالية')}
                    onClick={() => setImgIdx((i) => (i + 1) % imageCount)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/85 rounded-full flex items-center justify-center shadow"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-2">
                    {displayImages.map((_, i) => (
                      <button key={i} type="button" onClick={() => setImgIdx(i)} className="h-8 w-8 flex items-center justify-center">
                        <span className={`h-2 w-2 rounded-full ${imgIdx === i ? 'bg-primary' : 'bg-primary/35'}`} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h1 className="text-[22px] font-heading font-bold text-foreground leading-tight">{name}</h1>
              <div className="flex items-end gap-2 mt-2 flex-wrap">
                <span className="text-2xl font-bold text-primary">${Number(displayPrice || 0).toFixed(2)}</span>
                {originalPrice && (
                  <>
                    <span className="text-base text-muted-foreground line-through">${Number(originalPrice || 0).toFixed(2)}</span>
                    <span className="bg-accent text-accent-foreground text-xs font-semibold px-2.5 py-1 rounded-full">
                      {t('Save', 'وفري')} {Math.max(1, Math.round(((Number(originalPrice) - Number(displayPrice)) / Number(originalPrice)) * 100))}%
                    </span>
                  </>
                )}
              </div>
              {reviewCount > 0 && (
                <a href="#reviews" className="inline-block mt-2">
                  <RatingStars avg={reviewAvg} count={reviewCount} size="md" />
                </a>
              )}
            </div>

            <div className={`space-y-3 ${shakeSelector ? 'animate-[pulse_0.3s_ease-in-out]' : ''}`}>
              {colors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">{t('Color', 'اللون')}</p>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => {
                      const outOfStock = usesVariants && variantStockFor({ color: c, size: needsSize && selectedSize ? selectedSize : undefined }) <= 0;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => !outOfStock && setSelectedColor(c)}
                          disabled={outOfStock}
                          className={`min-h-[44px] px-4 rounded-full border text-sm ${outOfStock ? 'border-border text-muted-foreground/40 line-through' : selectedColor === c ? 'border-primary ring-2 ring-primary/35' : 'border-border text-foreground'}`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {sizes.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">{t('Size', 'المقاس')}</p>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((s) => {
                      const outOfStock = usesVariants && variantStockFor({ size: s, color: needsColor && selectedColor ? selectedColor : undefined }) <= 0;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => !outOfStock && setSelectedSize(s)}
                          disabled={outOfStock}
                          className={`min-w-[48px] min-h-[48px] px-3 rounded-xl border text-sm font-semibold ${outOfStock ? 'border-border text-muted-foreground/40 line-through' : selectedSize === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'}`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectorError && <p className="text-xs text-destructive mt-1">{selectorError}</p>}
            </div>

            <div ref={buyZoneRef} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-[52px] rounded-2xl border border-border bg-card flex items-center">
                  <button type="button" className="w-11 h-11 flex items-center justify-center" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold">{qty}</span>
                  <button type="button" className="w-11 h-11 flex items-center justify-center" onClick={() => setQty((q) => Math.min(stockQty > 0 ? stockQty : 1, 99, q + 1))}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(true)}
                  disabled={ctaOutOfStock}
                  className={`flex-1 min-h-[52px] rounded-2xl text-base font-semibold text-white active:scale-[0.97] transition-transform ${added ? 'bg-green-600' : 'bg-primary'}`}
                >
                  {ctaLabel}
                </button>
              </div>
              {waHelpLink && (
                <a href={waHelpLink} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-primary">
                  <MessageCircle className="w-4 h-4" /> {t('Need help? WhatsApp us', 'تحتاج مساعدة؟ راسلنا واتساب')}
                </a>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-3 grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col items-center gap-1">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <p className="text-xs leading-tight">{t('COD available', 'الدفع عند الاستلام')}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Truck className="w-5 h-5 text-primary" />
                <p className="text-xs leading-tight">{t('Delivery all Lebanon', 'توصيل لكل لبنان')}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <RotateCcw className="w-5 h-5 text-primary" />
                <p className="text-xs leading-tight">{t(returnsBlurb, 'تبديل سهل')}</p>
              </div>
            </div>

            <div className="rounded-xl p-3 bg-secondary/10 text-sm">
              <p className="text-foreground">
                {t('Delivery', 'التوصيل')}: {deliveryDisplay} — {t('FREE over', 'مجاني للطلبات فوق')} ${freeThreshold.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {inStockLook.length > 0 && (
          <section className="mt-8 border-t border-border pt-8">
            <h3 className="text-lg font-heading font-bold text-foreground mb-4">{t('Complete the look', 'كمّلي الطقم')}</h3>
            <div className="flex gap-3 overflow-x-auto mobile-rail pb-2">
              {inStockLook.map((p) => {
                const img = (completeImageMap[p.id] || [])[0] || null;
                const itemName = lang === 'ar' ? (p.name_ar || p.name) : p.name;
                return (
                  <div key={p.id} className="w-44 shrink-0 rounded-2xl border border-border bg-card overflow-hidden snap-start">
                    <Link to={`/product/${p.slug}`} className="block aspect-square bg-muted">
                      {(img?.url || p.image_url) ? (
                        <img src={img?.url ? imageSrc(img, 'card') : p.image_url} alt={itemName} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={handleImageError} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-8 h-8 text-muted-foreground" /></div>
                      )}
                    </Link>
                    <div className="p-3">
                      <p className="text-sm font-semibold line-clamp-1">{itemName}</p>
                      <p className="text-sm font-bold text-primary">${Number(p.price_usd || 0).toFixed(2)}</p>
                      <button
                        type="button"
                        onClick={() => (p.has_variants ? navigate(`/product/${p.slug}`) : addItem(p, null, 1))}
                        className="mt-2 w-full min-h-[44px] rounded-xl text-sm font-semibold bg-primary text-primary-foreground"
                      >
                        {p.has_variants ? t('View', 'عرض') : t('+ Add', '+ أضف')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8 space-y-2">
          <AccordionRow title={t('Details', 'التفاصيل')} open={detailsOpen} onToggle={() => setDetailsOpen((v) => !v)}>
            {desc || t('No details yet.', 'لا توجد تفاصيل بعد.')}
          </AccordionRow>
          <AccordionRow title={t('Size guide', 'دليل المقاسات')} open={sizeGuideOpen} onToggle={() => setSizeGuideOpen((v) => !v)}>
            {product.size_guide || sizeGuideSection?.body || t('Size information will be provided soon.', 'سيتم توفير معلومات المقاسات قريباً.')}
          </AccordionRow>
          <AccordionRow title={t('Care', 'العناية')} open={careOpen} onToggle={() => setCareOpen((v) => !v)}>
            {product.care_instructions || careSection?.body || t('Machine wash cold. Dry flat.', 'غسيل بارد في الغسالة. تجفيف بشكل مسطح.')}
          </AccordionRow>
        </section>

        {reviewCount > 0 && (
          <div id="reviews" className="border-t border-border pt-8 mt-8 scroll-mt-24">
            <h3 className="text-lg font-heading font-bold text-foreground mb-6">{t('Customer Reviews', 'تقييمات العملاء')}</h3>
            <div className="space-y-6">
              <ReviewList reviews={reviews} />
              <ReviewForm
                productId={product.id}
                isSubmitting={reviewSubmitting}
                onSubmit={async (data) => {
                  setReviewSubmitting(true);
                  try {
                    await base44.entities.Review.create({ ...data, is_published: false });
                    qc.invalidateQueries({ queryKey: ['product-reviews', product.id] });
                  } finally {
                    setReviewSubmitting(false);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {lightboxOpen && displayImages.length > 0 && (
        <ImageLightbox
          images={displayImages}
          startIndex={imgIdx}
          alt={name}
          rtl={lang === 'ar'}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {showStickyBuy && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-40 px-3 safe-bottom">
          <div className="h-16 rounded-t-2xl bg-card border border-border shadow-xl flex items-center gap-2 px-2.5">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
              {displayImages[0]?.url
                ? <img src={imageSrc(displayImages[0], 'thumb')} alt="" className="w-full h-full object-cover" />
                : <ShoppingBag className="w-5 h-5 m-2.5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground line-clamp-1">{name}</p>
              <p className="text-sm font-bold text-foreground">${Number(displayPrice || 0).toFixed(2)}</p>
            </div>
            <button
              type="button"
              onClick={() => handleAdd(false)}
              disabled={ctaOutOfStock}
              className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold ${!ctaOutOfStock ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
