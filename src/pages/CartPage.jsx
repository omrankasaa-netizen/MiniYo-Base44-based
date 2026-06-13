import React from 'react';
import { useCart } from '@/contexts/CartContext';
import { useLang } from '@/contexts/LanguageContext';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Plus, Minus } from 'lucide-react';

export default function CartPage() {
  const { items, removeItem, updateQty, subtotal } = useCart();
  const { t, lang } = useLang();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 px-4">
        <ShoppingBag className="w-12 h-12 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">{t('Your cart is empty.', 'سلتك فارغة.')}</p>
        <Link to="/shop" className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm">
          {t('Continue Shopping', 'تابع التسوق')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-6">{t('Your Cart', 'سلتك')}</h1>
        <div className="space-y-3 mb-6">
          {items.map((item, i) => {
            const name = lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name;
            return (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded-xl overflow-hidden shrink-0">
                  {item.product.primaryImage ? (
                    <img src={item.product.primaryImage} alt={name} className="w-full h-full object-cover" />
                  ) : <ShoppingBag className="w-6 h-6 m-auto text-muted-foreground mt-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm line-clamp-1">{name}</p>
                  {(item.variant?.size || item.variant?.color) && (
                    <p className="text-xs text-muted-foreground">{[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}</p>
                  )}
                  <p className="text-sm font-bold text-foreground mt-0.5">${(item.product.price_usd * item.quantity).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => updateQty(i, item.quantity - 1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button onClick={() => updateQty(i, item.quantity + 1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeItem(i)} className="ml-1 w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex justify-between font-bold text-foreground text-lg mb-4">
            <span>{t('Subtotal', 'المجموع الفرعي')}</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <button onClick={() => navigate('/checkout')}
            className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl font-semibold text-sm hover:bg-primary/90 transition-colors">
            {t('Proceed to Checkout', 'إتمام الطلب')}
          </button>
        </div>
      </div>
    </div>
  );
}