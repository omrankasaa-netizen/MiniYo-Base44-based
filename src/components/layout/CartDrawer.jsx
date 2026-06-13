import React, { useEffect, useRef, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function CartDrawer() {
  const { isOpen, setIsOpen, items, updateQty, removeItem, subtotal: total, totalQty: count, addItem } = useCart();
  const { t, lang } = useLang();
  const settings = useSiteSettings();
  const threshold = settings.freeShippingThreshold || 50;
  const contentRef = useRef(null);
  const [justAdded, setJustAdded] = useState(null);
  
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
        .filter(p => (p.stock_quantity || 0) > 0 || (p.has_variants && Math.random() > 0.5))
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
    return imgs.find(i => i.is_primary)?.url || imgs[0]?.url || null;
  };

  const getStockQty = (product) => {
    if (product.has_variants && variantMap[product.id]?.length > 0) {
      return variantMap[product.id].reduce((s, v) => s + (v.qty_on_hand || 0), 0);
    }
    return product.stock_quantity || 0;
  };

  const handleAddRecommendation = (product) => {
    setJustAdded(product.id);
    addItem(
      {
        id: product.id,
        name: product.name,
        name_ar: product.name_ar,
        price_usd: product.price_usd,
        compare_at_price_usd: product.compare_at_price_usd,
        image_url: product.image_url,
        sku: product.sku,
        primaryImage: getPrimaryImage(product.id),
        category_id: product.category_id,
        has_variants: product.has_variants
      },
      null,
      1
    );
    setTimeout(() => setJustAdded(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50 animate-in fade-in duration-200" onClick={() => setIsOpen(false)} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-card border-l border-border z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
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
                {t(`You're $${remaining.toFixed(2)} away from free delivery`, `أنت على بُعد $${remaining.toFixed(2)} من التوصيل المجاني`)}
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

        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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
                   <img src={item.product.primaryImage || item.product.image_url} alt="" className="w-full h-full object-cover" />
                 ) : (
                   <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                 )}
               </div>
               <div className="flex-1 min-w-0">
                 <p className="text-sm font-semibold text-foreground line-clamp-1">{lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name}</p>
                 {item.variant && <p className="text-xs text-muted-foreground">{[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}</p>}
                 <p className="text-sm font-bold text-foreground">${((parseFloat(item.price) || 0) * (item.quantity || 0)).toFixed(2)}</p>
               </div>
               <div className="flex flex-col items-center gap-1.5 shrink-0">
                 <button onClick={() => updateQty(item.key, (item.quantity || 1) + 1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Plus className="w-3 h-3" /></button>
                 <span className="text-xs font-bold">{item.quantity}</span>
                 <button onClick={() => updateQty(item.key, Math.max(1, (item.quantity || 1) - 1))} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><Minus className="w-3 h-3" /></button>
               </div>
               <button onClick={() => removeItem(item.key)} className="p-1 text-muted-foreground hover:text-destructive ml-1"><X className="w-3.5 h-3.5" /></button>
             </div>
           ))}

           {/* "You may also like" recommendations */}
           {items.length > 0 && recommendations.length > 0 && (
             <div className="mt-6 pt-4 border-t border-border">
               <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                 {t('You may also like', 'قد تعجبك أيضاً')}
               </p>
               <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
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
                           ? <img src={img || product.image_url} alt={name} className="w-full h-full object-cover" />
                           : <ShoppingBag className="w-6 h-6 text-muted-foreground" />}
                       </div>
                       <div className="p-2">
                         <p className="text-xs font-semibold text-foreground line-clamp-2 h-8">{name}</p>
                         <p className="text-xs font-bold text-primary mb-2">${(parseFloat(product.price_usd) || 0).toFixed(2)}</p>
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
                       </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}
         </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-border space-y-3">
            <div className="flex justify-between font-bold text-foreground">
              <span>{t('Total', 'المجموع')}</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <Link to="/checkout" onClick={() => setIsOpen(false)}
              className="block w-full py-3.5 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm text-center hover:bg-primary/90 transition-colors">
              {t('Checkout', 'إتمام الطلب')}
            </Link>
            <Link to="/cart" onClick={() => setIsOpen(false)}
              className="block w-full py-2.5 border border-border rounded-2xl text-sm text-center hover:bg-muted transition-colors text-muted-foreground">
              {t('View Cart', 'عرض السلة')}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}