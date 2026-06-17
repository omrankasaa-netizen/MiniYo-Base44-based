import React, { useState } from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, ChevronRight, X } from 'lucide-react';

const STATUS_COLORS = {
  New: 'bg-blue-50 text-blue-700',
  Confirmed: 'bg-indigo-50 text-indigo-700',
  Packed: 'bg-amber-50 text-amber-700',
  'Out for Delivery': 'bg-orange-50 text-orange-700',
  Delivered: 'bg-green-50 text-green-700',
  Cancelled: 'bg-red-50 text-red-700',
};

const STATUS_AR = {
  New: 'جديد', Confirmed: 'مؤكد', Packed: 'معبأ',
  'Out for Delivery': 'في الطريق', Delivered: 'تم التسليم', Cancelled: 'ملغى',
};

function OrderDetailModal({ order, onClose, lang, t }) {
  const { data: items = [] } = useQuery({
    queryKey: ['order-items', order.id],
    queryFn: () => base44.entities.OrderItem.filter({ order_id: order.id }, 'product_name', 50),
  });
  const { data: history = [] } = useQuery({
    queryKey: ['order-history', order.id],
    queryFn: () => base44.entities.OrderStatusHistory.filter({ order_id: order.id }, 'changed_at', 20),
  });

  const statusLabel = lang === 'ar' ? (STATUS_AR[order.order_status] || order.order_status) : order.order_status;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-foreground">{order.order_number}</h3>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted text-muted-foreground'}`}>{statusLabel}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Items */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('Items', 'المنتجات')}</h4>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm gap-2 bg-muted/40 px-3 py-2 rounded-xl">
                  <span className="text-foreground flex-1 line-clamp-1">{item.product_name} {(item.size || item.color) ? `(${[item.size, item.color].filter(Boolean).join('/')})` : ''} ×{item.quantity}</span>
                  <span className="font-semibold shrink-0">${item.line_total_usd?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Totals */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('Subtotal', 'المجموع الفرعي')}</span><span>${order.subtotal_usd?.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('Delivery', 'التوصيل')}</span><span>${order.delivery_fee_usd?.toFixed(2)}</span></div>
            {order.discount_usd > 0 && <div className="flex justify-between text-green-700"><span>{t('Discount', 'الخصم')}</span><span>-${order.discount_usd?.toFixed(2)}</span></div>}
            <div className="flex justify-between font-bold text-foreground border-t border-border pt-1.5"><span>{t('Total', 'المجموع')}</span><span>${order.grand_total_usd?.toFixed(2)}</span></div>
          </div>
          {/* Status history */}
          {history.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('Status History', 'سجل الحالة')}</h4>
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">{lang === 'ar' ? (STATUS_AR[h.status] || h.status) : h.status}</p>
                      {h.changed_at && <p className="text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString()}</p>}
                      {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Address */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t('Delivery Address', 'عنوان التوصيل')}</h4>
            <p className="text-sm text-muted-foreground">{[order.city, order.district, order.street, order.building].filter(Boolean).join(', ')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderHistoryPage() {
  const { currentUser } = useAuthUser();
  const { t, lang } = useLang();
  const [selected, setSelected] = useState(null);

  // Match orders by the customer's email (always present on the User record and
  // on every order), not by phone — User.phone is blank for accounts created via
  // email/OTP, so the old phone filter returned nothing. Also merge any orders
  // linked by customer_id (set to user.id at checkout) so re-orders show up too.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['customer-orders', currentUser?.email, currentUser?.id],
    queryFn: async () => {
      const email = currentUser?.email;
      const uid = currentUser?.id;
      const [byEmail, byId] = await Promise.all([
        email ? base44.entities.Order.filter({ customer_email: email }, '-created_date', 50) : Promise.resolve([]),
        uid ? base44.entities.Order.filter({ customer_id: uid }, '-created_date', 50) : Promise.resolve([]),
      ]);
      const seen = new Set();
      const merged = [];
      for (const o of [...byEmail, ...byId]) {
        if (o && !seen.has(o.id)) { seen.add(o.id); merged.push(o); }
      }
      merged.sort((a, b) => new Date(b.created_date || b.order_date || 0) - new Date(a.created_date || a.order_date || 0));
      return merged;
    },
    enabled: !!(currentUser?.email || currentUser?.id),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-primary" /> {t('My Orders', 'طلباتي')}
      </h1>
      {isLoading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}</div>}
      {!isLoading && orders.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('No orders yet.', 'لا توجد طلبات حتى الآن.')}</p>
        </div>
      )}
      {orders.map(order => (
        <button key={order.id} onClick={() => setSelected(order)}
          className="w-full bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow text-left group">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-heading font-semibold text-foreground text-sm">{order.order_number}</p>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted text-muted-foreground'}`}>
                  {lang === 'ar' ? (STATUS_AR[order.order_status] || order.order_status) : order.order_status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {order.order_date ? new Date(order.order_date).toLocaleDateString() : '—'} · ${order.grand_total_usd?.toFixed(2)}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </div>
        </button>
      ))}
      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} lang={lang} t={t} />}
    </div>
  );
}