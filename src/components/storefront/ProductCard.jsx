import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { motion } from 'framer-motion';
import WishlistHeart from './WishlistHeart';
import { framingStyle } from '@/lib/imageFraming';

// Renders one framed image inside the 3:4 box, honoring its focal/crop metadata.
// Cropped images are absolutely sized via `style`; focal-only images fill the box.
function FramedImage({ image, alt, eager }) {
  const { style, cropped } = framingStyle(image);
  return (
    <img
      src={image.url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      style={style}
      className={`${cropped ? '' : 'w-full h-full'} group-hover:scale-105 transition-transform duration-500`}
    />
  );
}

// In-card multi-photo carousel: arrows + dots on hover (desktop) / always on
// touch, plus swipe. Falls back to a single static image when there is only one.
function ProductCardImage({ images, name, isRTL }) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(null);
  const count = images.length;

  function go(delta, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setIdx(i => (i + delta + count) % count);
  }
  // In RTL the visual "previous" (left arrow) should advance forward.
  const prevDelta = isRTL ? 1 : -1;
  const nextDelta = isRTL ? -1 : 1;

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      // A swipe maps to the arrow on the side it moves toward: swiping left
      // (dx<0) is the same as pressing the right arrow, and vice versa. Both
      // arrows already encode RTL via prev/nextDelta, so reuse them directly.
      go(dx < 0 ? nextDelta : prevDelta);
    }
    touchStartX.current = null;
  }

  if (count <= 1) {
    return <FramedImage image={images[0]} alt={name} eager={false} />;
  }

  return (
    <div className="absolute inset-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <FramedImage image={images[idx]} alt={name} eager={idx === 0} />

      {/* Arrows: hidden until hover on desktop, always visible on touch */}
      <button type="button" aria-label="Previous image" onClick={(e) => go(prevDelta, e)}
        className="absolute top-1/2 -translate-y-1/2 left-2 w-7 h-7 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity z-10">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" aria-label="Next image" onClick={(e) => go(nextDelta, e)}
        className="absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity z-10">
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity z-10">
        {images.map((_, i) => (
          <button key={i} type="button" aria-label={`Go to image ${i + 1}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx(i); }}
            className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white w-4' : 'bg-white/60'}`} />
        ))}
      </div>
    </div>
  );
}

export default function ProductCard({ product }) {
  const { t, lang, isRTL } = useLang();
  const { addItem, setIsOpen } = useCart();
  const { getProductDiscount, getDiscountedPrice } = useDiscounts();
  const [added, setAdded] = useState(false);

  const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
  const isOutOfStock = (product.stock_quantity || 0) <= 0 && !product.has_variants;
  const isLowStock = !isOutOfStock && (product.stock_quantity || 0) > 0 && (product.stock_quantity || 0) <= 3;
  const hasCompareDiscount = product.compare_at_price_usd > product.price_usd;
  const autoDiscount = getProductDiscount(product);
  const discountedPrice = autoDiscount ? getDiscountedPrice(product) : null;
  const hasDiscount = hasCompareDiscount || !!autoDiscount;
  const displayPrice = discountedPrice ?? product.price_usd;
  const originalPrice = discountedPrice ? product.price_usd : (hasCompareDiscount ? product.compare_at_price_usd : null);
  const badgeLabel = autoDiscount ? (lang === 'ar' ? (autoDiscount.badge_label_ar || autoDiscount.badge_label) : autoDiscount.badge_label) : null;

  // Build the carousel image list. Prefer the full images array (with per-image
  // focal/crop metadata) when a consumer provides it; otherwise fall back to the
  // single derived primaryImage so callers that don't load all images still work.
  const cardImages = Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : (product.primaryImage ? [{ url: product.primaryImage }] : []);

  function handleAdd(e) {
    e.preventDefault();
    if (isOutOfStock || product.has_variants) return;
    addItem(product, null, 1);
    setAdded(true);
    setIsOpen(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="group">
      <Link to={`/product/${product.slug}`} className="block">
        <div className="bg-card rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-border/60">
          <div className="relative aspect-[3/4] bg-muted overflow-hidden">
            {cardImages.length > 0
              ? <ProductCardImage images={cardImages} name={name} isRTL={isRTL} />
              : <div className="w-full h-full flex items-center justify-center bg-accent/20"><ShoppingBag className="w-12 h-12 text-accent" /></div>}
            {/* Badges */}
            <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
              {product.is_new && <span className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded-full">{t('New', 'جديد')}</span>}
              {product.is_featured && <span className="bg-accent text-accent-foreground text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"><Star className="w-2.5 h-2.5 fill-current" /> {t('Featured', 'مميز')}</span>}
              {badgeLabel && <span className="bg-destructive text-destructive-foreground text-xs font-semibold px-2.5 py-1 rounded-full">{badgeLabel}</span>}
              {!badgeLabel && hasDiscount && <span className="bg-destructive text-destructive-foreground text-xs font-semibold px-2.5 py-1 rounded-full">{t('Sale', 'تخفيض')}</span>}
              {isLowStock && <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">{t('Only', 'فقط')} {product.stock_quantity} {t('left', 'متبقي')}</span>}
            </div>
            {/* Wishlist */}
            <WishlistHeart productId={product.id} className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/80 backdrop-blur shadow-sm" />
            {/* Sold out overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center backdrop-blur-[1px]">
                <span className="bg-card text-muted-foreground text-sm font-semibold px-4 py-1.5 rounded-full border border-border">{t('Sold out', 'نفذ المخزون')}</span>
              </div>
            )}
          </div>
          <div className="p-3.5">
            <p className="font-heading font-semibold text-foreground text-sm leading-tight line-clamp-2 mb-1.5">{name}</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className={`font-bold ${autoDiscount ? 'text-destructive' : 'text-foreground'}`}>${displayPrice?.toFixed(2)}</span>
                {originalPrice && <span className="text-xs text-muted-foreground line-through">${originalPrice?.toFixed(2)}</span>}
              </div>
              {!isOutOfStock && !product.has_variants && (
                <button onClick={handleAdd}
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm text-xs font-bold
                    ${added ? 'bg-green-500 text-white scale-110' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                  {added ? '✓' : '+'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}