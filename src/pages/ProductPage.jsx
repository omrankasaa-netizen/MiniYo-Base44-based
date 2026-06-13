import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import WishlistHeart from '@/components/storefront/WishlistHeart';
import { ReviewList, ReviewForm } from '@/components/storefront/ReviewCard';
import { useQueryClient } from '@tanstack/react-query';

export default function ProductPage() {
  const { slug } = useParams();
  const { t, lang } = useLang();
  const { addItem, setIsOpen } = useCart();
  const qc = useQueryClient();
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [imgIdx, setImgIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const { getProductDiscount, getDiscountedPrice } = useDiscounts();

  const { data: products = [] } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => base44.entities.Product.filter({ slug }, 'slug', 1),
  });
  const product = products[0];

  const { data: images = [] } = useQuery({
    queryKey: ['product-images', product?.id],
    queryFn: () => base44.entities.ProductImage.filter({ product_id: product.id }, 'sort_order', 20),
    enabled: !!product?.id,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', product?.id],
    queryFn: () => base44.entities.ProductVariant.filter({ product_id: product.id }, 'size', 50),
    enabled: !!product?.id && product?.has_variants,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: () => base44.entities.Review.filter({ product_id: product.id }, '-created_date', 50),
    enabled: !!product?.id,
  });

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
  const badgeLabel = autoDiscount ? (lang === 'ar' ? (autoDiscount.badge_label_ar || autoDiscount.badge_label) : autoDiscount.badge_label) : null;
  const colors = product.colors ? product.colors.split('|').filter(Boolean) : [];
  const sizes  = product.sizes  ? product.sizes.split('|').filter(Boolean)  : [];
  const displayImages = images.length > 0 ? images : [];

  const selectedVariant = product.has_variants && variants.length > 0
    ? variants.find(v => (!selectedSize || v.size === selectedSize) && (!selectedColor || v.color === selectedColor))
    : null;

  const stockQty = selectedVariant ? (selectedVariant.qty_on_hand || 0) : (product.stock_quantity || 0);
  const canAdd = product.has_variants ? !!selectedVariant && stockQty > 0 : stockQty > 0;

  function handleAdd() {
    addItem(product, selectedVariant || null, 1);
    setAdded(true);
    setIsOpen(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> {t('Back to Shop', 'العودة للمتجر')}
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Images */}
          <div className="space-y-3">
            <div className="relative aspect-square bg-muted rounded-3xl overflow-hidden">
              {displayImages.length > 0 ? (
                <img src={displayImages[imgIdx]?.url} alt={name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-16 h-16 text-accent" />
                </div>
              )}
              {displayImages.length > 1 && (
                <>
                  <button onClick={() => setImgIdx(i => (i - 1 + displayImages.length) % displayImages.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setImgIdx(i => (i + 1) % displayImages.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <WishlistHeart productId={product.id} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/80 backdrop-blur shadow" />
            </div>
            {displayImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {displayImages.map((img, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-colors ${i === imgIdx ? 'border-primary' : 'border-transparent'}`}>
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-4">
            <div>
              <div className="flex gap-2 mb-2 flex-wrap">
                {product.is_new && <span className="bg-primary/10 text-primary text-xs px-2.5 py-0.5 rounded-full font-semibold">{t('New', 'جديد')}</span>}
                {hasDiscount && <span className="bg-destructive/10 text-destructive text-xs px-2.5 py-0.5 rounded-full font-semibold">{t('Sale', 'تخفيض')}</span>}
              </div>
              <h1 className="text-2xl font-heading font-bold text-foreground leading-tight">{name}</h1>
              <div className="flex items-baseline gap-3 mt-2">
                <span className={`text-2xl font-bold ${autoDiscount ? 'text-destructive' : 'text-foreground'}`}>${displayPrice?.toFixed(2)}</span>
                {originalPrice && <span className="text-muted-foreground line-through text-lg">${originalPrice?.toFixed(2)}</span>}
                {badgeLabel && <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2.5 py-1 rounded-full">{badgeLabel}</span>}
              </div>
            </div>

            {/* Color picker */}
            {colors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t('Color', 'اللون')}: <span className="text-muted-foreground">{selectedColor}</span></p>
                <div className="flex flex-wrap gap-2">
                  {colors.map(c => (
                    <button key={c} onClick={() => setSelectedColor(c)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${selectedColor === c ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground hover:border-foreground'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size picker */}
            {sizes.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t('Size', 'المقاس')}: <span className="text-muted-foreground">{selectedSize}</span></p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(s => {
                    const v = variants.find(vv => vv.size === s && (!selectedColor || vv.color === selectedColor));
                    const outOfStock = product.has_variants && v && (v.qty_on_hand || 0) <= 0;
                    return (
                      <button key={s} onClick={() => !outOfStock && setSelectedSize(s)}
                        className={`w-12 h-12 rounded-xl border text-sm font-semibold transition-colors
                          ${outOfStock ? 'border-border text-border line-through cursor-not-allowed' : selectedSize === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:border-primary'}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock status */}
            {stockQty > 0 && stockQty <= 3 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-900">{t('Only', 'فقط')} {stockQty} {t('left in stock', 'متبقي في المخزون')} — {t('order soon!', 'اطلب الآن!')}</p>
              </div>
            )}

            {/* Add to cart */}
            <button onClick={handleAdd} disabled={!canAdd}
              className={`w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm
                ${canAdd ? (added ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90') : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
              <ShoppingBag className="w-4 h-4" />
              {added ? t('Added!', 'تمت الإضافة!') : !canAdd && stockQty === 0 ? t('Out of Stock', 'نفذ المخزون') : t('Add to Cart', 'أضف إلى السلة')}
            </button>

            {desc && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            )}
          </div>
        </div>

        {/* Reviews section */}
        <div className="border-t border-border pt-8">
          <h3 className="text-lg font-heading font-bold text-foreground mb-6">{t('Customer Reviews', 'تقييمات العملاء')}</h3>
          <div className="space-y-6">
            <ReviewList reviews={reviews} />
            <ReviewForm
              productId={product.id}
              isSubmitting={reviewSubmitting}
              onSubmit={async (data) => {
                setReviewSubmitting(true);
                try {
                  await base44.entities.Review.create({
                    ...data,
                    is_published: false,
                  });
                  qc.invalidateQueries({ queryKey: ['product-reviews', product.id] });
                } finally {
                  setReviewSubmitting(false);
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}