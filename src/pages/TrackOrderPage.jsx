import React, { useState, useEffect } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, ChevronRight } from 'lucide-react';

const STATUS_STEPS = ['New', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
const STATUS_COLORS = {
  New: 'bg-blue-50 text-blue-700', Confirmed: 'bg-indigo-50 text-indigo-700',
  Packed: 'bg-amber-50 text-amber-700', 'Out for Delivery': 'bg-orange-50 text-orange-700',
  Delivered: 'bg-green-50 text-green-700', Cancelled: 'bg-red-50 text-red-700',
};
const STATUS_AR = { New: 'جديد', Confirmed: 'مؤكد', Packed: 'معبأ', 'Out for Delivery': 'في الطريق', Delivered: 'تم التسليم', Cancelled: 'ملغى' };

export default function TrackOrderPage() {
  const { t, lang } = useLang();
  const { currentUser } = useAuthUser();
  const [orderNum, setOrderNum] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Logged-in users see their orders automatically
  const { data: myOrders = [] } = useQuery({
    queryKey: ['my-orders', currentUser?.email],
    queryFn: () => currentUser?.email ? base44.entities.Order.filter({ customer_email: currentUser.email }, '-created_date', 20) : Promise.resolve([]),
    enabled: !!currentUser?.email,
  });

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setOrder(null);
    try {
      const results = await base44.entities.Order.filter({ order_number: orderNum.trim().toUpperCase() }, '-created_date', 1);
      if (results.length === 0 || results[0].customer_phone !== phone.trim()) {
        setError(t('Order not found. Please check the order number and phone.', 'لم يُعثر على الطلب. تحقق من رقم الطلب والهاتف.'));
        return;
      }
      const found = results[0];
      setOrder(found);
      const orderItems = await base44.entities.OrderItem.filter({ order_id: found.id }, 'product_name', 20);
      setItems(orderItems);
    } catch {
      setError(t('Something went wrong.', 'حدث خطأ ما.'));
    } finally {
      setLoading(false);
    }
  }

  const currentStepIdx = order ? STATUS_STEPS.indexOf(order.order_status) : -1;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <Package className="w-10 h-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-heading font-bold text-foreground">{t('Track Your Order', 'تتبع طلبك')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {currentUser ? t('Your recent orders:', 'طلباتك الأخيرة:') : t('Enter your order number and phone to see the latest status.', 'أدخل رقم طلبك وهاتفك لمعرفة آخر حالة.')}
          </p>
        </div>

        {/* Logged-in user's orders list */}
        {currentUser && myOrders.length > 0 && !order && (
          <div className="space-y-3 mb-6">
            {myOrders.map(o => (
              <button
                key={o.id}
                onClick={async () => {
                  setOrder(o);
                  const orderItems = await base44.entities.OrderItem.filter({ order_id: o.id }, 'product_name', 20);
                  setItems(orderItems);
                }}
                className="w-full bg-card border border-border rounded-xl p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.order_date).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[o.order_status] || 'bg-muted'}`}>
                    {lang === 'ar' ? (STATUS_AR[o.order_status] || o.order_status) : o.order_status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSearch} className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3 mb-6">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('Order Number', 'رقم الطلب')}</label>
            <input required value={orderNum} onChange={e => setOrderNum(e.target.value)}
              placeholder="MNY-XXXXX"
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm uppercase" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('Phone Number', 'رقم الهاتف')}</label>
            <input required value={phone} onChange={e => setPhone(e.target.value)}
              type="tel" className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/5 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
            {t('Track Order', 'تتبع الطلب')}
          </button>
        </form>

        {order && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-5">
            {!currentUser && (
              <button
                onClick={() => { setOrder(null); setItems([]); setOrderNum(''); setPhone(''); }}
                className="text-xs text-primary hover:underline mb-2"
              >
                ← {t('Search another order', 'البحث عن طلب آخر')}
              </button>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading font-bold text-foreground">{order.order_number}</p>
                <p className="text-xs text-muted-foreground">{order.customer_name}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted'}`}>
                {lang === 'ar' ? (STATUS_AR[order.order_status] || order.order_status) : order.order_status}
              </span>
            </div>

            {/* Progress stepper */}
            {order.order_status !== 'Cancelled' && (
              <div className="flex items-center gap-1">
                {STATUS_STEPS.map((step, i) => {
                  const done = i <= currentStepIdx;
                  const active = i === currentStepIdx;
                  return (
                    <React.Fragment key={step}>
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                          ${done ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border text-muted-foreground'}`}>
                          {done ? '✓' : i + 1}
                        </div>
                        <p className={`text-center leading-tight ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                          style={{ fontSize: '9px' }}>
                          {lang === 'ar' ? (STATUS_AR[step] || step) : step}
                        </p>
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`h-0.5 flex-1 rounded-full mb-4 ${i < currentStepIdx ? 'bg-primary' : 'bg-border'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('Items', 'المنتجات')}</p>
              <div className="space-y-1.5">
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm gap-2 bg-muted/40 px-3 py-2 rounded-xl">
                    <span className="text-foreground flex-1 line-clamp-1">{item.product_name} ×{item.quantity}</span>
                    <span className="font-semibold shrink-0">${item.line_total_usd?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between font-bold text-foreground border-t border-border pt-3">
              <span>{t('Total', 'المجموع')}</span>
              <span>${order.grand_total_usd?.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}