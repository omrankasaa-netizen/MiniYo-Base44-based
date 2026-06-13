import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Trash2 } from 'lucide-react';
import { logAction } from '@/lib/auditLog';

const DELIVERY_FEES = { 'Inside Tripoli': 3, 'Outside Tripoli': 5 };
const CHANNELS = ['Website', 'Instagram', 'Facebook', 'WhatsApp', 'Other'];
const PAYMENT_METHODS = ['Cash on Delivery', 'Whish'];
const LB_CITIES = ['Tripoli', 'Beirut', 'Sidon', 'Tyre', 'Jounieh', 'Baalbek', 'Zahle', 'Other'];

function generateOrderNumber() {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `MNY-${n}`;
}

export default function NewOrderModal({ onClose, onSaved, currentUser }) {
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '',
    city: 'Tripoli', district: '', street: '', building: '', floor: '', apartment: '', landmark: '',
    delivery_zone: 'Inside Tripoli', delivery_fee_usd: 3,
    channel: 'Instagram', payment_method: 'Cash on Delivery',
    promo_code: '', notes: '',
  });
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['order-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, 'name', 200),
  });
  const { data: variants = [] } = useQuery({
    queryKey: ['order-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 1000),
  });

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  const subtotal = items.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0);
  const grand_total = subtotal + (form.delivery_fee_usd || 0);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function onZoneChange(zone) {
    setForm(f => ({ ...f, delivery_zone: zone, delivery_fee_usd: DELIVERY_FEES[zone] ?? 3 }));
  }

  function addProductToOrder(product) {
    const pvs = variantsByProduct[product.id] || [];
    const newItem = {
      _id: Date.now() + Math.random(),
      product_id: product.id,
      product_name: product.name,
      sku: product.sku || '',
      size: pvs.length > 0 ? pvs[0].size || '' : '',
      color: pvs.length > 0 ? pvs[0].color || '' : '',
      unit_price_usd: product.price_usd || 0,
      quantity: 1,
      availableSizes: pvs.length > 0 ? [...new Set(pvs.map(v => v.size).filter(Boolean))] : [],
      availableColors: pvs.length > 0 ? [...new Set(pvs.map(v => v.color).filter(Boolean))] : [],
      hasVariants: pvs.length > 0,
    };
    setItems(prev => [...prev, newItem]);
    setShowPicker(false);
    setProductSearch('');
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(i => i._id === id ? { ...i, [field]: value } : i));
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i._id !== id));
  }

  async function handleSave() {
    if (!form.customer_name || !form.customer_phone) { setError('Customer name and phone are required.'); return; }
    if (items.length === 0) { setError('Add at least one product.'); return; }
    setSaving(true);
    setError('');
    try {
      const order_number = generateOrderNumber();
      const order = await base44.entities.Order.create({
        order_number,
        order_date: new Date().toISOString(),
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        city: form.city,
        district: form.district,
        street: form.street,
        building: form.building,
        floor: form.floor,
        apartment: form.apartment,
        landmark: form.landmark,
        delivery_zone: form.delivery_zone,
        delivery_fee_usd: Number(form.delivery_fee_usd),
        channel: form.channel,
        payment_method: form.payment_method,
        subtotal_usd: subtotal,
        discount_usd: 0,
        grand_total_usd: grand_total,
        order_status: 'New',
        stock_committed: false,
        promo_code: form.promo_code,
        notes: form.notes,
      });

      for (const item of items) {
        await base44.entities.OrderItem.create({
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          unit_price_usd: item.unit_price_usd,
          line_total_usd: item.unit_price_usd * item.quantity,
        });
      }

      await base44.entities.OrderStatusHistory.create({
        order_id: order.id,
        status: 'New',
        note: 'Order created manually',
        changed_by: currentUser?.email || 'admin',
        changed_at: new Date().toISOString(),
      });

      await logAction({ action: 'created', entity: 'Order', entityId: order.id, details: order_number, userName: currentUser?.email });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">New Order</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Channel + Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Channel</label>
              <select value={form.channel} onChange={e => setField('channel', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                {CHANNELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Payment Method</label>
              <select value={form.payment_method} onChange={e => setField('payment_method', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Customer */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Customer</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <input value={form.customer_name} onChange={e => setField('customer_name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Phone *</label>
                <input value={form.customer_phone} onChange={e => setField('customer_phone', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="+961 xx xxx xxx" />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Delivery Address</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">City</label>
                <select value={form.city} onChange={e => setField('city', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                  {LB_CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">District</label>
                <input value={form.district} onChange={e => setField('district', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="e.g. Mina" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Street</label>
                <input value={form.street} onChange={e => setField('street', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="Street name" />
              </div>
              {[['building','Building'],['floor','Floor'],['apartment','Apartment']].map(([k,l]) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1">{l}</label>
                  <input value={form[k]} onChange={e => setField(k, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Landmark</label>
                <input value={form.landmark} onChange={e => setField('landmark', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="Near mosque, school…" />
              </div>
            </div>
          </div>

          {/* Delivery Zone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Delivery Zone</label>
              <select value={form.delivery_zone} onChange={e => onZoneChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                <option>Inside Tripoli</option>
                <option>Outside Tripoli</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Delivery Fee ($)</label>
              <input type="number" min="0" step="0.5" value={form.delivery_fee_usd}
                onChange={e => setField('delivery_fee_usd', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          </div>

          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">Products</h4>
              <button onClick={() => setShowPicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80">
                <Plus className="w-3.5 h-3.5" /> Add Product
              </button>
            </div>

            {showPicker && (
              <div className="mb-3 bg-muted/50 border border-border rounded-xl p-3 space-y-2">
                <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                  placeholder="Search product…"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addProductToOrder(p)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-card text-sm transition-colors">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-muted-foreground ml-2">${p.price_usd?.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">No products added yet</p>}
              {items.map(item => (
                <div key={item._id} className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                    <div className="flex gap-2 mt-1">
                      {item.availableSizes.length > 0 && (
                        <select value={item.size} onChange={e => updateItem(item._id, 'size', e.target.value)}
                          className="px-2 py-1 rounded-lg border border-input bg-background text-xs">
                          {item.availableSizes.map(s => <option key={s}>{s}</option>)}
                        </select>
                      )}
                      {item.availableColors.length > 0 && (
                        <select value={item.color} onChange={e => updateItem(item._id, 'color', e.target.value)}
                          className="px-2 py-1 rounded-lg border border-input bg-background text-xs">
                          {item.availableColors.map(c => <option key={c}>{c}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item._id, 'quantity', Math.max(1, Number(e.target.value)))}
                      className="w-14 text-center px-2 py-1.5 rounded-lg border border-input bg-background text-sm" />
                    <span className="text-sm font-semibold text-foreground w-16 text-right">${(item.unit_price_usd * item.quantity).toFixed(2)}</span>
                    <button onClick={() => removeItem(item._id)} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none"
              placeholder="Special instructions…" />
          </div>

          {/* Totals */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery Fee</span><span className="font-medium">${(form.delivery_fee_usd || 0).toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-2">
              <span>Total</span><span className="text-primary">${grand_total.toFixed(2)}</span>
            </div>
            {form.payment_method === 'Cash on Delivery' && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm font-semibold text-amber-800">
                💵 COD Amount to Collect: ${grand_total.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {error && <p className="px-6 text-xs text-destructive">{error}</p>}

        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}