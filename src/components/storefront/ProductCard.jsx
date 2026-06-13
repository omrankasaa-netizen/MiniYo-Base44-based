import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Star } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { motion } from 'framer-motion';
import WishlistHeart from './WishlistHeart';

export default function ProductCard({ product }) {
  const { t, lang } = useLang();
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
          <div className="relative aspect-square bg-muted overflow-hidden">
            {product.primaryImage
              ? <img src={product.primaryImage} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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