import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, Printer, MessageCircle, ChevronRight, Gift } from 'lucide-react';
import { logAction } from '@/lib/auditLog';
import { commitStock, releaseStock } from '@/lib/inventory';
import { normalizeImage, imageSrc, IMAGE_PLACEHOLDER, handleImageError } from '@/lib/imageFraming';

// Resolve a small thumbnail URL for a product using the app's canonical image
// helper (Cloudflare-resized `thumb` derivative). Prefers the product's legacy
// single `image_url` (kept in sync with the primary image), then any images[]
// entry. Returns '' when nothing usable so callers render the placeholder.
function productThumbSrc(product) {
  if (!product) return '';
  const raw = product.image_url
    || (Array.isArray(product.images) ? product.images[0] : null)
    || product.primaryImage;
  const n = normalizeImage(raw);
  return n ? imageSrc(n, 'thumb') : '';
}

const STATUS_FLOW = ['New', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
const STATUS_COLORS = {
  New: 'bg-blue-50 text-blue-700',
  Confirmed: 'bg-indigo-50 text-indigo-700',
  Packed: 'bg-violet-50 text-violet-700',
  'Out for Delivery': 'bg-amber-50 text-amber-700',
  Delivered: 'bg-green-50 text-green-700',
  Cancelled: 'bg-destructive/10 text-destructive',
};

export default function OrderDetailModal({ order, onClose, onUpdated, currentUser }) {
  const [updating, setUpdating] = useState(false);
  const [err, setErr] = useState('');

  const { data: items = [] } = useQuery({
    queryKey: ['order-items', order.id],
    queryFn: () => base44.entities.OrderItem.filter({ order_id: order.id }),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['order-history', order.id],
    queryFn: () => base44.entities.OrderStatusHistory.filter({ order_id: order.id }, '-changed_at'),
  });

  // Line items don't snapshot a product image, so resolve the referenced
  // products (by id, only those in this order) to show a mini thumbnail. Fetched
  // by id so inactive/hidden products still resolve. SKU stays sourced from the
  // line-item snapshot; the product is a fallback when a legacy item lacks one.
  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  const { data: productsById = {} } = useQuery({
    queryKey: ['order-item-products', productIds.slice().sort().join(',')],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        productIds.map(id => base44.entities.Product.get(id).catch(() => null)),
      );
      const map = {};
      for (const p of results) if (p) map[p.id] = p;
      return map;
    },
  });

  const currentIdx = STATUS_FLOW.indexOf(order.order_status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  async function changeStatus(newStatus) {
    setUpdating(true);
    setErr('');
    try {
      // Inventory logic. Confirming converts the placement-time reservation into
      // a sale (or, for legacy unreserved orders, deducts on-hand directly).
      // Cancelling frees stock whether it is merely reserved (New order) or has
      // already been committed (Confirmed → Cancelled).
      if (newStatus === 'Confirmed' && !order.stock_committed) {
        await commitStock({ orderId: order.id, items });
      }
      if (newStatus === 'Cancelled' && (order.stock_committed || order.stock_reserved)) {
        await releaseStock({ orderId: order.id, items });
      }

      // Delivery triggers the consolidated backend handler (commit stock if
      // needed + recompute membership tier + customer email). Other statuses
      // update the order then notify the customer.
      if (newStatus === 'Delivered') {
        try {
          await base44.functions.invoke('onOrderDelivered', { order_id: order.id });
        } catch (e) {
          console.error('onOrderDelivered failed:', e);
        }
      } else {
        await base44.entities.Order.update(order.id, {
          order_status: newStatus,
          ...(newStatus === 'Confirmed' ? { stock_committed: true } : {}),
          ...(newStatus === 'Cancelled' && order.stock_committed ? { stock_committed: false } : {}),
        });
        try {
          await base44.functions.invoke('sendOrderStatusUpdate', { order_id: order.id, new_status: newStatus });
        } catch (e) {
          console.error('sendOrderStatusUpdate failed:', e);
        }
      }

      await base44.entities.OrderStatusHistory.create({
        order_id: order.id,
        status: newStatus,
        changed_by: currentUser?.email || 'admin',
        changed_at: new Date().toISOString(),
      });

      await logAction({ action: 'status_changed', entity: 'Order', entityId: order.id, details: `→ ${newStatus}`, userName: currentUser?.email });
      onUpdated({ ...order, order_status: newStatus, stock_committed: newStatus === 'Confirmed' || newStatus === 'Delivered' ? true : (newStatus === 'Cancelled' ? false : order.stock_committed) });
    } catch (e) {
      setErr(e.message);
    } finally {
      setUpdating(false);
    }
  }

  function handlePrint() {
    const win = window.open('', '_blank', 'width=600,height=800');
    win.document.write(buildPrintHTML(order, items));
    win.document.close();
    win.focus();
    win.print();
  }

  function handleWhatsApp() {
    const msg = buildWhatsAppMsg(order, items);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  const codAmount = order.payment_method === 'Cash on Delivery' ? order.grand_total_usd : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-semibold text-foreground">Order {order.order_number || order.id.slice(0,8)}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted text-muted-foreground'}`}>
                {order.order_status}
              </span>
              <span className="text-xs text-muted-foreground">{order.channel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={handleWhatsApp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* COD highlight */}
          {codAmount && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-800">💵 Cash to Collect (COD)</span>
              <span className="text-xl font-bold text-amber-900">${codAmount.toFixed(2)}</span>
            </div>
          )}

          {/* Status stepper */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Status</h4>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {STATUS_FLOW.map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                    s === order.order_status ? STATUS_COLORS[s] :
                    i < currentIdx ? 'bg-green-50 text-green-600' : 'bg-muted text-muted-foreground'
                  }`}>{s}</span>
                  {i < STATUS_FLOW.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              {nextStatus && order.order_status !== 'Cancelled' && (
                <button onClick={() => changeStatus(nextStatus)} disabled={updating}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
                  {updating ? '…' : `Mark as ${nextStatus}`}
                </button>
              )}
              {order.order_status !== 'Cancelled' && order.order_status !== 'Delivered' && (
                <button onClick={() => changeStatus('Cancelled')} disabled={updating}
                  className="px-4 py-2 rounded-xl border border-destructive text-destructive text-sm font-medium disabled:opacity-50 hover:bg-destructive/10">
                  Cancel Order
                </button>
              )}
            </div>
            {err && <p className="text-xs text-destructive mt-2">{err}</p>}
          </div>

          {/* Items */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Items</h4>
            <div className="bg-muted/30 rounded-xl overflow-hidden">
              {items.map((item, i) => {
                const product = productsById[item.product_id];
                const thumb = productThumbSrc(product);
                const sku = item.sku || product?.sku || '';
                return (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <img
                    src={thumb || IMAGE_PLACEHOLDER}
                    onError={handleImageError}
                    alt={item.product_name || ''}
                    className="w-11 h-11 rounded-lg object-cover bg-muted border border-border shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{[item.size, item.color].filter(Boolean).join(' / ')} {sku && `· ${sku}`}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                  <span className="text-sm font-semibold text-foreground">${(item.line_total_usd || item.unit_price_usd * item.quantity).toFixed(2)}</span>
                </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>${(order.subtotal_usd || 0).toFixed(2)}</span></div>
            {order.discount_usd > 0 && <div className="flex justify-between text-sm text-green-700"><span>Discount</span><span>-${order.discount_usd.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery ({order.delivery_zone})</span><span>${(order.delivery_fee_usd || 0).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-2 mt-2"><span>Total</span><span className="text-primary">${(order.grand_total_usd || 0).toFixed(2)}</span></div>
          </div>

          {/* Customer & Address */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Customer</h4>
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
                <p className="text-xs text-muted-foreground">{order.payment_method}</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Address</h4>
              <div className="bg-muted/30 rounded-xl p-3 text-sm text-muted-foreground space-y-0.5">
                {order.building && <p>Bldg {order.building}{order.floor ? `, Fl ${order.floor}` : ''}{order.apartment ? `, Apt ${order.apartment}` : ''}</p>}
                {order.street && <p>{order.street}</p>}
                {order.district && <p>{order.district}</p>}
                <p className="font-medium text-foreground">{order.city}</p>
                {order.landmark && <p className="text-xs">Near: {order.landmark}</p>}
              </div>
            </div>
          </div>

          {/* Gift options */}
          {order.is_gift && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" /> Gift
              </h4>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                <p className="font-semibold text-amber-800">🎁 This order is a gift</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.gift_wrapping ? 'bg-amber-200 text-amber-900' : 'bg-muted text-muted-foreground'}`}>
                    {order.gift_wrapping ? '✓ Gift wrapping' : 'No wrapping'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.hide_invoice_price ? 'bg-amber-200 text-amber-900' : 'bg-muted text-muted-foreground'}`}>
                    {order.hide_invoice_price ? '✓ Hide prices on slip' : 'Prices shown'}
                  </span>
                </div>
                {order.gift_message && (
                  <p className="text-amber-900 italic bg-white/60 rounded-lg px-3 py-2 mt-1">“{order.gift_message}”</p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</h4>
              <p className="text-sm text-foreground bg-muted/30 rounded-xl px-4 py-3">{order.notes}</p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status History</h4>
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[h.status] || 'bg-muted text-muted-foreground'}`}>{h.status}</span>
                    <span>{h.changed_by}</span>
                    <span>{h.changed_at ? new Date(h.changed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPrintHTML(order, items) {
  // When a gift order requests price masking, omit all prices/totals (and the
  // COD amount) from the printed packing slip so the recipient never sees them.
  const hidePrice = !!(order.is_gift && order.hide_invoice_price);
  const itemsHTML = items.map(i => {
    const label = `${i.product_name}${i.size ? ` (${i.size}` : ''}${i.color ? `/${i.color})` : i.size ? ')' : ''}`;
    const priceCell = hidePrice ? '' : `<td style="text-align:right">$${(i.line_total_usd || i.unit_price_usd * i.quantity).toFixed(2)}</td>`;
    return `<tr><td>${label}</td><td style="text-align:center">${i.quantity}</td>${priceCell}</tr>`;
  }).join('');
  const priceHeader = hidePrice ? '' : '<th style="text-align:right">Total</th>';
  const totalsRows = hidePrice ? '' :
    `<tr class="total-row"><td colspan="2">Delivery</td><td style="text-align:right">$${(order.delivery_fee_usd || 0).toFixed(2)}</td></tr>
     <tr class="total-row"><td colspan="2">GRAND TOTAL</td><td style="text-align:right">$${(order.grand_total_usd || 0).toFixed(2)}</td></tr>`;
  const codBlock = (!hidePrice && order.payment_method === 'Cash on Delivery')
    ? `<div class="cod">💵 COD Amount to Collect: $${(order.grand_total_usd || 0).toFixed(2)}</div>` : '';
  const giftBlock = order.is_gift
    ? `<div class="gift">🎁 Gift${order.gift_wrapping ? ' · please gift-wrap' : ''}${order.gift_message ? `<br/><em>"${order.gift_message}"</em>` : ''}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Order ${order.order_number}</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px;color:#222}h1{font-size:20px;margin-bottom:4px}.label{color:#888;font-size:11px}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #eee}.total-row td{font-weight:bold;border-top:2px solid #222}.cod{background:#fffbe6;border:1px solid #f6c90e;padding:8px 12px;border-radius:6px;font-size:15px;font-weight:bold;margin-top:12px}.gift{background:#fff7ed;border:1px dashed #d97706;padding:8px 12px;border-radius:6px;margin-top:12px}</style>
  </head><body>
  <h1>MiniYo — ${hidePrice ? 'Packing Slip' : 'Order Slip'}</h1>
  <p class="label">Order #</p><p><strong>${order.order_number}</strong></p>
  <p class="label">Date</p><p>${order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : ''}</p>
  <p class="label">Customer</p><p>${order.customer_name} · ${order.customer_phone}</p>
  <p class="label">Address</p><p>${[order.building, order.street, order.district, order.city].filter(Boolean).join(', ')}</p>
  <p class="label">Zone</p><p>${order.delivery_zone || ''}</p>
  <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th>${priceHeader}</tr></thead>
  <tbody>${itemsHTML}${totalsRows}</tbody></table>
  <p class="label">Payment</p><p>${order.payment_method}</p>
  ${codBlock}
  ${giftBlock}
  ${order.notes ? `<p class="label">Notes</p><p>${order.notes}</p>` : ''}
  </body></html>`;
}

function buildWhatsAppMsg(order, items) {
  const itemLines = items.map(i => `• ${i.product_name}${i.size ? ` (${i.size}` : ''}${i.color ? `/${i.color})` : i.size ? ')' : ''} x${i.quantity} — $${(i.line_total_usd || i.unit_price_usd * i.quantity).toFixed(2)}`).join('\n');
  return `*MiniYo Order Confirmation*\nOrder: ${order.order_number}\n\n${itemLines}\n\nDelivery: $${(order.delivery_fee_usd || 0).toFixed(2)}\n*Total: $${(order.grand_total_usd || 0).toFixed(2)}*\n\nDeliver to: ${[order.building, order.street, order.district, order.city].filter(Boolean).join(', ')}\nPhone: ${order.customer_phone}\n${order.payment_method === 'Cash on Delivery' ? `\n💵 Please have $${(order.grand_total_usd || 0).toFixed(2)} ready for the driver.` : ''}`;
}