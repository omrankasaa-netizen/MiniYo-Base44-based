import React, { useEffect, useRef, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cmsImageSrc, handleImageError, normalizeImage } from '@/lib/imageFraming';
import { availableQty } from '@/lib/inventory';

export default function CartDrawer() {
  const { isOpen, setIsOpen, items, updateQty, removeItem, subtotal: total, totalQty: count, addItem } = useCart();
  const { t, lang } = useLang();
  const settings = useSiteSettings();
  const threshold = settings.freeShippingThreshold || 50;
  const contentRef = useRef(null);
  const [justAdded, setJustAdded] = useState(null);
  const pushedHistoryRef = useRef(false);
  // Tracks whether the drawer was closed by a navigation link (Checkout / View Cart).
  // When true, skip history.back() — React Router already handled the navigation.
  const closedByNavRef = useRef(false);
  const swipeStartY = useRef(null);
  
  // Note: Cart drawer shows progress based on pre-discount subtotal for simplicity
  // Actual free shipping is determined at checkout based on post-discount subtotal
  const remaining = Math.max(0, threshold - total);
  const progress = Math.min(100, (total / threshold) * 100);

  // Scroll to top when drawer opens
  useEffect(() => {
    if (isOpen && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Mobile-native back behavior: if the cart is open, Android/iOS browser back
  // closes it first instead of navigating away.
  useEffect(() => {
    if (!isOpen || pushedHistoryRef.current) return;
    window.history.pushState({ cartDrawer: true }, '');
    pushedHistoryRef.current = true;
    const onPopState = () => {
      setIsOpen(false);
      pushedHistoryRef.current = false;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    if (isOpen || !pushedHistoryRef.current) return;
    if (!closedByNavRef.current) {
      // Closed by X/backdrop/swipe — pop the pushed state entry so the back stack is clean.
      window.history.back();
    }
    // If closedByNavRef is true, React Router already pushed the destination URL;
    // calling history.back() would undo that navigation, sending the user back to the
    // product page. Just leave the orphaned {cartDrawer:true} entry — it's harmless.
    closedByNavRef.current = false;
    pushedHistoryRef.current = false;
  }, [isOpen]);

  // Fetch recommendations based on cart contents
  const { data: recommendations = [] } = useQuery({
    queryKey: ['cart-recommendations', items.map(i => i.product.category_id).filter(Boolean)],
    queryFn: async () => {
      if (items.length === 0) return [];
      const catIds = [...new Set(items.map(i => i.product.category_id).filter(Boolean))];
      if (catIds.length === 0) return [];
      const recIds = new Set(items.map(i => i.product.id));
      
      // Fetch from same categories, in stock, not in cart
      const results = await base44.entities.Product.filter(
        { status: 'Active' },
        '-is_featured',
        50
      );
      
      return results
        .filter(p => !recIds.has(p.id) && (catIds.includes(p.category_id) || p.is_featured || p.is_new))
        .filter(p => availableQty(p) > 0 || (p.has_variants && Math.random() > 0.5))
        .slice(0, 6);
    },
    enabled: isOpen && items.length > 0
  });

  // Fetch variants and images for recommendations
  const { data: allVariants = [] } = useQuery({
    queryKey: ['cart-rec-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 500),
    enabled: recommendations.length > 0
  });

  const { data: allImages = [] } = useQuery({
    queryKey: ['cart-rec-images'],
    queryFn: () => base44.entities.ProductImage.list('-created_date', 500),
    enabled: recommendations.length > 0
  });

  const variantMap = {};
  allVariants.forEach(v => {
    if (!variantMap[v.product_id]) variantMap[v.product_id] = [];
    variantMap[v.product_id].push(v);
  });

  const imageMap = {};
  allImages.forEach(img => {
    if (!imageMap[img.product_id]) imageMap[img.product_id] = [];
    imageMap[img.product_id].push(img);
  });

  const getPrimaryImage = (productId) => {
    const imgs = imageMap[productId] || [];
    const primary = imgs.find((i) => i.is_primary) || imgs[0];
    const normalized = normalizeImage(primary);
    return normalized?.url || null;
  };

  const getStockQty = (product) => {
    if (product.has_variants && variantMap[product.id]?.length > 0) {
      return variantMap[product.id].reduce((s, v) => s + availableQty(v), 0);
    }
    return availableQty(product);
  };

  const handleAddRecommendation = (product) => {
    // Only simple (non-variant) products are added directly — variant products
    // render a "Choose" Link to the PDP instead (see below), so a shopper can
    // never check out a variant they never picked.
    if (product.has_variants) return;
    setJustAdded(product.id);
    // Pass the FULL product: the cart context clamps quantity against the
    // product's stock fields, which the old trimmed copy didn't carry — so the
    // clamp read availability as 0 and silently refused every recommendation.
    addItem({ ...product, primaryImage: getPrimaryImage(product.id) }, null, 1);
    setTimeout(() => setJustAdded(null), 1500);
  };

  const gapSuggestions = recommendations
    .filter((p) => getStockQty(p) > 0)
    .sort((a, b) => Number(a.price_usd || 0) - Number(b.price_usd || 0))
    .slice(0, 3);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50 animate-in fade-in duration-200" onClick={() => setIsOpen(false)} />
      {/* Drawer — slides in from the inline-end edge (right in LTR, left in RTL) */}
      <div
        className={`fixed top-0 bottom-0 w-full max-w-sm max-h-[92dvh] bg-card z-50 flex flex-col shadow-2xl duration-300 overscroll-y-contain
        ${lang === 'ar' ? 'left-0 border-r border-border animate-in slide-in-from-left' : 'right-0 border-l border-border animate-in slide-in-from-right'}`}
        onTouchStart={(e) => { swipeStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          if (swipeStartY.current == null) return;
          const dy = e.changedTouches[0].clientY - swipeStartY.current;
          if (dy > 90 && contentRef.current && contentRef.current.scrollTop <= 4) setIsOpen(false);
          swipeStartY.current = null;
        }}
      >
        {/* Free shipping progress */}
        <div className="px-5 pt-3 pb-2">
          {remaining === 0 ? (
            <div className="flex items-center gap-2 text-xs text-green-700 font-semibold bg-green-50 rounded-xl px-3 py-2">
              <Truck className="w-4 h-4" />
              {t('🎉 You qualify for free delivery!', '🎉 حصلت على توصيل مجاني!')}
            </div>
          ) : total > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                {t(`Add $${remaining.toFixed(2)} more for free delivery`, `أضيفي $${remaining.toFixed(2)} لتوصيل مجاني`)}
              </p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" /> {t('Cart', 'السلة')} {count > 0 && <span className="text-sm text-muted-foreground font-normal">({count})</span>}
          </h2>
          <button onClick={() => setIsOpen(false)} className="p-2 rounded-xl hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-y-contain">
           {items.length === 0 && (
             <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
               <ShoppingBag className="w-10 h-10 opacity-30" />
               <p className="text-sm">{t('Your cart is empty.', 'سلتك فارغة.')}</p>
             </div>
           )}
           {items.map(item => (
             <div
               key={item.key}
               className={`flex items-center gap-3 rounded-2xl p-3 transition-colors duration-300 ${
                 justAdded === item.product.id
                   ? 'bg-primary/15 border-2 border-primary'
                   : 'bg-muted/40'
               }`}
             >
               <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                 {(item.product.primaryImage || item.product.image_url) ? (
                   <img src={cmsImageSrc(item.product.primaryImage || item.product.image_url, 'thumb')} alt="" loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover" />
                 ) : (
                   <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                 )}
               </div>
               <div className="flex-1 min-w-0">
                 <p className="text-sm font-semibold text-foreground line-clamp-1">{lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name}</p>
                 {item.variant && <p className="text-xs text-muted-foreground">{[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}</p>}
                 <p className="text-sm font-bold text-foreground">${((parseFloat(item.price) || 0) * (item.quantity || 0)).toFixed(2)}</p>
               </div>
               <div className="flex flex-col items-center gap-2 shrink-0">
                 <button onClick={() => updateQty(item.key, (item.quantity || 1) + 1)} className="w-11 h-11 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Plus className="w-4 h-4" /></button>
                 <span className="text-xs font-bold">{item.quantity}</span>
                 <button onClick={() => updateQty(item.key, Math.max(1, (item.quantity || 1) - 1))} className="w-11 h-11 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Minus className="w-4 h-4" /></button>
               </div>
               <button onClick={() => removeItem(item.key)} className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-destructive ml-1"><X className="w-4 h-4" /></button>
             </div>
           ))}

           {/* Gap-closing suggestions */}
           {items.length > 0 && gapSuggestions.length > 0 && (
             <div className="mt-6 pt-4 border-t border-border">
               <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                 {t('Add to reach free delivery', 'أضيفي للوصول إلى الشحن المجاني')}
               </p>
               <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mobile-rail">
                 {gapSuggestions.map((product) => {
                   const inStock = getStockQty(product) > 0;
                   const img = getPrimaryImage(product.id);
                   const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
                   return (
                     <div key={product.id} className="flex-shrink-0 w-28 snap-start bg-muted/40 rounded-xl overflow-hidden border border-border">
                       <div className="aspect-square bg-muted overflow-hidden flex items-center justify-center">
                         {(img || product.image_url)
                           ? <img src={cmsImageSrc(img || product.image_url, 'thumb')} alt={name} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover" />
                           : <ShoppingBag className="w-6 h-6 text-muted-foreground" />}
                       </div>
                       <div className="p-2">
                         <p className="text-xs font-semibold text-foreground line-clamp-1">{name}</p>
                         <p className="text-xs font-bold text-primary mb-2">${(parseFloat(product.price_usd) || 0).toFixed(2)}</p>
                         {product.has_variants ? (
                           // Plain anchor on purpose: SPA navigation initiated
                           // from inside this drawer gets reverted by the router
                           // (URL bounces back to the current page). A full
                           // document navigation is bulletproof here.
                           <a
                             href={`/product/${product.slug}`}
                             className="block w-full min-h-[44px] leading-[44px] text-center text-xs rounded-lg font-medium bg-primary text-primary-foreground"
                           >
                             {t('Choose', 'اختاري')}
                           </a>
                         ) : (
                           <button
                             onClick={() => handleAddRecommendation(product)}
                             disabled={!inStock}
                             className={`w-full min-h-[44px] text-xs rounded-lg font-medium transition-colors ${inStock ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                           >
                             {inStock ? t('Add', 'أضف') : t('Out', 'نفد')}
                           </button>
                         )}
                       </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}

           {/* "You may also like" recommendations */}
           {items.length > 0 && recommendations.length > 0 && (
             <div className="mt-6 pt-4 border-t border-border">
               <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                 {t('You may also like', 'قد تعجبك أيضاً')}
               </p>
               <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mobile-rail">
                 {recommendations.map(product => {
                   const inStock = getStockQty(product) > 0;
                   const img = getPrimaryImage(product.id);
                   const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
                   return (
                     <div
                       key={product.id}
                       className="flex-shrink-0 w-24 snap-start bg-muted/40 rounded-xl overflow-hidden border border-border hover:border-primary transition-colors"
                     >
                       <div className="aspect-square bg-muted overflow-hidden flex items-center justify-center">
                         {(img || product.image_url)
                           ? <img src={cmsImageSrc(img || product.image_url, 'thumb')} alt={name} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover" />
                           : <ShoppingBag className="w-6 h-6 text-muted-foreground" />}
                       </div>
                       <div className="p-2">
                         <p className="text-xs font-semibold text-foreground line-clamp-2 h-8">{name}</p>
                         <p className="text-xs font-bold text-primary mb-2">${(parseFloat(product.price_usd) || 0).toFixed(2)}</p>
                         {product.has_variants ? (
                           <a
                             href={`/product/${product.slug}`}
                             className="block w-full text-center text-xs py-1.5 rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                           >
                             {t('Choose', 'اختاري')}
                           </a>
                         ) : (
                           <button
                             onClick={() => handleAddRecommendation(product)}
                             disabled={!inStock}
                             className={`w-full text-xs py-1.5 rounded-lg font-medium transition-colors ${
                               inStock
                                 ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                 : 'bg-muted text-muted-foreground cursor-not-allowed'
                             }`}
                           >
                             {inStock ? t('Add', 'أضف') : t('Out', 'نفد')}
                           </button>
                         )}
                       </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}
         </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-border space-y-3 safe-bottom">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('Subtotal', 'المجموع الفرعي')}</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('Delivery', 'التوصيل')}</span>
              <span>{t('Calculated at checkout', 'يُحتسب عند إتمام الطلب')}</span>
            </div>
            <div className="flex justify-between font-bold text-foreground">
              <span>{t('Total', 'المجموع')}</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <Link to="/checkout" onClick={() => { closedByNavRef.current = true; setIsOpen(false); }}
              className="block w-full min-h-[52px] py-3.5 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm text-center hover:bg-primary/90 transition-colors active:scale-[0.97]">
              {t('Checkout', 'إتمام الطلب')}
            </Link>
            <p className="text-xs text-center text-muted-foreground">{t('Cash on Delivery available', 'الدفع عند الاستلام متاح')}</p>
            <Link to="/cart" onClick={() => { closedByNavRef.current = true; setIsOpen(false); }}
              className="block w-full py-2.5 border border-border rounded-2xl text-sm text-center hover:bg-muted transition-colors text-muted-foreground">
              {t('View Cart', 'عرض السلة')}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}