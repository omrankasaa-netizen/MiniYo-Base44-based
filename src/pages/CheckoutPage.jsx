import React, { useState, useEffect, useRef } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { ShoppingBag, CheckCircle2, Tag, X, Loader2, Gift } from 'lucide-react';
import { validatePromoCode, calcPromoDiscount } from '@/lib/discounts';
import { useQuery } from '@tanstack/react-query';
import { track } from '@/lib/pixel';

const ScrollToTop = ({ trigger }) => {
  useEffect(() => {
    if (trigger) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [trigger]);
  return null;
};

const CITIES = ['Tripoli', 'Beirut', 'Jounieh', 'Sidon', 'Tyre', 'Zahle', 'Batroun', 'Jbail', 'Tripoli North', 'Other'];

function genOrderNum() {
  return 'MNY-' + String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { currentUser } = useAuthUser();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const siteSettings = useSiteSettings();

  // Fetch customer tier and settings
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-checkout', currentUser?.email],
    queryFn: () => currentUser?.email
      ? base44.entities.Customer.filter({ email: currentUser.email }, '-created_date', 1)
      : Promise.resolve([]),
    enabled: !!currentUser?.email
  });

  const { data: memSettings = [] } = useQuery({
    queryKey: ['membership-settings-checkout'],
    queryFn: () => base44.entities.MembershipSettings.list(),
  });

  const { data: shippingZones = [] } = useQuery({
    queryKey: ['shipping-zones-checkout'],
    queryFn: async () => {
      const zones = await base44.entities.ShippingZone.filter({ is_active: true }, 'sort_order', 100);
      return zones;
    },
  });

  const customer = customers[0];
  const settings = memSettings[0] || {
    bronze_discount_pct: 5,
    silver_discount_pct: 10,
    gold_discount_pct: 15
  };
  const memberDiscount = customer && memSettings.length > 0
    ? {
        Bronze: settings.bronze_discount_pct || 5,
        Silver: settings.silver_discount_pct || 10,
        Gold: settings.gold_discount_pct || 15
      }[customer.current_tier || 'Bronze']
    : 0;

  // Build the list of enabled payment methods from site settings
  const enabledMethods = [
    siteSettings.paymentCodEnabled && { key: 'Cash on Delivery', label: t('Cash on Delivery', 'الدفع عند الاستلام') },
    siteSettings.paymentWhishEnabled && { key: 'Whish', label: 'Whish' },
    siteSettings.paymentCardEnabled && { key: 'Card', label: t('Credit/Debit Card', 'بطاقة ائتمان') },
  ].filter(Boolean);

  const [form, setForm] = useState({
    customer_name: currentUser?.full_name || '',
    customer_phone: currentUser?.phone || '',
    customer_email: currentUser?.email || '',
    city: '',
    district: '',
    street: '',
    building: '',
    floor: '',
    landmark: '',
    shipping_zone_id: '',
    payment_method: currentUser?.preferred_payment || 'Cash on Delivery',
    notes: '',
  });

  const [createAccount, setCreateAccount] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [addressChanged, setAddressChanged] = useState(false);

  // Gift options
  const [gift, setGift] = useState({
    is_gift: false,
    gift_wrapping: false,
    hide_invoice_price: false,
    gift_message: '',
  });
  const GIFT_MSG_MAX = 150;
  function setGiftField(k, v) {
    setGift(g => ({ ...g, [k]: v }));
  }

  // Auto-fill address from customer's first saved address (if exists and logged in)
  useEffect(() => {
    if (currentUser?.id && customer && !addressChanged) {
      // Try to load a saved address from CustomerAddress entity
      const tryLoadAddress = async () => {
        try {
          const addresses = await base44.entities.CustomerAddress?.filter?.({ customer_id: customer.id }, 'created_date', 1);
          if (addresses?.length > 0) {
            const addr = addresses[0];
            setForm(f => ({
              ...f,
              city: addr.city || '',
              district: addr.district || '',
              street: addr.street || '',
              building: addr.building || '',
              floor: addr.floor || '',
              landmark: addr.landmark || '',
            }));
          }
        } catch (e) {
          // CustomerAddress might not exist; that's ok
        }
      };
      tryLoadAddress();
    }
  }, [currentUser?.id, customer?.id]);

  // When site settings load, set default to first enabled method if current is disabled
  useEffect(() => {
    if (enabledMethods.length && !enabledMethods.find(m => m.key === form.payment_method)) {
      setF('payment_method', enabledMethods[0].key);
    }
  }, [siteSettings.paymentCodEnabled, siteSettings.paymentWhishEnabled, siteSettings.paymentCardEnabled]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState(null); // validated code record
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [stockError, setStockError] = useState('');

  // Calculate promo discount FIRST (before using it in postDiscountSubtotal)
  const isFreeShipping = promoCode?.type === 'free_shipping';
  const promoDiscount = promoCode && items?.length > 0 ? (calcPromoDiscount(promoCode, items, subtotal) ?? 0) : 0;

  // Determine post-discount subtotal for threshold check
  let postDiscountSubtotal = Number(subtotal || 0);
  if (memberDiscount > 0 && promoDiscount > 0) {
    if (promoCode?.stackable_with_membership) {
      postDiscountSubtotal = postDiscountSubtotal - ((postDiscountSubtotal * memberDiscount) / 100) - promoDiscount;
    } else {
      const memberDiscountAmt = (postDiscountSubtotal * memberDiscount) / 100;
      postDiscountSubtotal = memberDiscountAmt > promoDiscount ? postDiscountSubtotal - memberDiscountAmt : postDiscountSubtotal - promoDiscount;
    }
  } else if (memberDiscount > 0) {
    postDiscountSubtotal = postDiscountSubtotal - ((postDiscountSubtotal * memberDiscount) / 100);
  } else if (promoDiscount > 0) {
    postDiscountSubtotal = postDiscountSubtotal - promoDiscount;
  }

  const freeShippingThreshold = Number(siteSettings.freeShippingThreshold || 50);
  const qualifiesForThreshold = postDiscountSubtotal >= freeShippingThreshold;

  // Get shipping zone and fee with fallback
  const selectedZone = form.shipping_zone_id ? shippingZones.find(z => z.id === form.shipping_zone_id) : null;
  const catchallZone = shippingZones.find(z => z.is_catchall);
  const zoneForFee = selectedZone || catchallZone || { fee_usd: 6 };
  const deliveryFee = Number(zoneForFee?.fee_usd || 6);

  // Apply member discount logic
  let effectivePromoDiscount = Number(promoDiscount || 0);
  let effectiveMemberDiscount = 0;

  if (memberDiscount > 0 && promoDiscount > 0) {
    if (promoCode?.stackable_with_membership) {
      effectiveMemberDiscount = (subtotal * memberDiscount) / 100;
    } else {
      const memberDiscountAmt = (subtotal * memberDiscount) / 100;
      if (memberDiscountAmt > promoDiscount) {
        effectivePromoDiscount = 0;
        effectiveMemberDiscount = memberDiscountAmt;
      } else {
        effectiveMemberDiscount = 0;
      }
    }
  } else if (memberDiscount > 0) {
    effectiveMemberDiscount = (subtotal * memberDiscount) / 100;
  }

  const totalDiscount = Number(effectivePromoDiscount + effectiveMemberDiscount);
  const effectiveDelivery = isFreeShipping || qualifiesForThreshold ? 0 : deliveryFee;
  const grandTotal = Number((subtotal - totalDiscount + effectiveDelivery).toFixed(2));

  // Meta Pixel InitiateCheckout — fire once when the checkout page opens with a
  // non-empty cart.
  const initiateCheckoutFired = useRef(false);
  useEffect(() => {
    if (initiateCheckoutFired.current || !items?.length) return;
    initiateCheckoutFired.current = true;
    track('InitiateCheckout', {
      value: Number(subtotal) || 0,
      currency: 'USD',
      num_items: items.reduce((s, i) => s + i.quantity, 0),
      content_ids: items.map(i => i.product.sku || i.product.id),
      content_type: 'product',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items?.length]);

  // Meta Pixel Purchase — fire exactly once per completed order. `success` holds
  // the order number; the ref guards against re-fire on remount/refresh.
  // The cart is cleared right before `success` is set, so the order total/items
  // are snapshotted at submit time into refs for the Purchase payload.
  const purchasedOrderRef = useRef(null);
  const lastOrderTotal = useRef(0);
  const lastOrderItems = useRef([]);
  useEffect(() => {
    if (!success || purchasedOrderRef.current === success) return;
    purchasedOrderRef.current = success;
    track('Purchase', {
      value: lastOrderTotal.current,
      currency: 'USD',
      num_items: lastOrderItems.current.length,
      content_ids: lastOrderItems.current.map(i => i.product.sku || i.product.id),
      content_type: 'product',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  async function handleApplyPromo() {
    setPromoError('');
    setPromoLoading(true);
    const codes = await base44.entities.PromoCode.filter({ code: promoInput.toUpperCase().trim() }, 'code', 1);
    setPromoLoading(false);
    if (!codes.length) { setPromoError(t('Invalid promo code.', 'رمز ترويجي غير صحيح.')); return; }
    const code = codes[0];
    const { valid, reason } = validatePromoCode(code, items, subtotal, lang);
    if (!valid) { setPromoError(reason); return; }
    setPromoCode(code);
    setPromoInput('');
  }

  function removePromo() { setPromoCode(null); setPromoError(''); }

  function setF(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'customer_email') setEmailError('');
  }

  function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  function validateLebanesePhone(phone) {
    // Lebanese formats. Mobile prefixes: 03, 70, 71, 76, 78, 79, 81; landline 01-09.
    // Accepts +961 / 00961 / 961 / leading 0, with or without spaces/dashes, e.g.
    // 03 123 456, 70123456, +961 3 123456, 01 234 567.
    let c = String(phone || '').replace(/[\s\-()]/g, '');
    c = c.replace(/^\+961/, '').replace(/^00961/, '').replace(/^961/, '').replace(/^0/, '');
    const mobile = /^(3\d{6}|7[0-9]\d{6}|8[01]\d{6})$/; // 7-8 digit mobiles
    const landline = /^[1-9]\d{6}$/;                     // 7-digit landline
    return mobile.test(c) || landline.test(c);
  }

  async function revalidateStock() {
    // Check live stock for all items
    const issues = [];
    for (const item of items) {
      try {
        const currentProduct = await base44.entities.Product.get(item.product.id);
        if (!currentProduct) {
          issues.push(`${item.product.name} is no longer available`);
        } else if (currentProduct.has_variants) {
          // Check variant stock
          const variant = await base44.entities.ProductVariant?.filter?.(
            { product_id: item.product.id, size: item.variant?.size, color: item.variant?.color },
            'id',
            1
          );
          if (!variant?.length || variant[0].stock_quantity < item.quantity) {
            issues.push(`${item.product.name} (${item.variant?.size}/${item.variant?.color}): only ${variant?.[0]?.stock_quantity || 0} left`);
          }
        } else if (currentProduct.stock_quantity < item.quantity) {
          issues.push(`${item.product.name}: only ${currentProduct.stock_quantity} left`);
        }
      } catch (e) {
        console.error('Stock check failed:', e);
      }
    }
    return issues;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setEmailError('');
    setPhoneError('');
    setStockError('');
    setSubmitting(true);

    // Validate email
    if (!form.customer_email || !form.customer_email.trim()) {
      setEmailError(t('Email is required', 'البريد الإلكتروني مطلوب'));
      setSubmitting(false);
      return;
    }

    if (!validateEmail(form.customer_email)) {
      setEmailError(t('Please enter a valid email address', 'يرجى إدخال عنوان بريد إلكتروني صحيح'));
      setSubmitting(false);
      return;
    }

    // Validate Lebanese phone
    if (!form.customer_phone || !form.customer_phone.trim()) {
      setPhoneError(t('Phone is required for COD delivery', 'الهاتف مطلوب للتوصيل عند الاستلام'));
      setSubmitting(false);
      return;
    }

    if (!validateLebanesePhone(form.customer_phone)) {
      setPhoneError(t('Please enter a valid Lebanese phone number (e.g. 03/70/71/76/78/79/81 or +961)', 'يرجى إدخال رقم هاتف لبناني صحيح'));
      setSubmitting(false);
      return;
    }

    // Re-validate stock
    const stockIssues = await revalidateStock();
    if (stockIssues.length > 0) {
      setStockError(stockIssues.join('; '));
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      // Create guest account if opted in
      let guestCustomerId = currentUser?.id || '';
      if (!currentUser && createAccount) {
        try {
          const existingCustomers = await base44.entities.Customer.filter(
            { email: form.customer_email },
            'email',
            1
          );

          if (existingCustomers.length === 0) {
            const newCustomer = await base44.entities.Customer.create({
              email: form.customer_email,
              name: form.customer_name,
              phone: form.customer_phone,
              current_tier: 'Bronze',
              lifetime_spend_usd: 0,
              free_delivery_credits_remaining: 0
            });
            guestCustomerId = newCustomer.id;

            // Grant Bronze credits
            await base44.functions.invoke('membershipEngine', {
              action: 'grant_bronze_credits',
              customer_id: newCustomer.id
            });

            // Send welcome email
            try {
              await base44.functions.invoke('sendWelcomeEmailNew', {
                customer_id: newCustomer.id,
                email: form.customer_email,
                name: form.customer_name
              });
            } catch (err) {
              console.error('Welcome email failed:', err);
            }
          }
        } catch (err) {
          console.error('Account creation failed:', err);
        }
      }

      const order = await base44.entities.Order.create({
        customer_id: guestCustomerId,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email,
        city: form.city,
        district: form.district,
        street: form.street,
        building: form.building,
        floor: form.floor,
        landmark: form.landmark,
        shipping_zone_id: form.shipping_zone_id,
        payment_method: form.payment_method,
        notes: form.notes,
        order_number: genOrderNum(),
        order_date: new Date().toISOString(),
        subtotal_usd: subtotal,
        discount_usd: totalDiscount,
        delivery_fee_usd: effectiveDelivery,
        grand_total_usd: grandTotal,
        promo_code: promoCode?.code || '',
        order_status: 'New',
        channel: 'Website',
        stock_committed: false,
        is_gift: gift.is_gift,
        gift_wrapping: gift.is_gift ? gift.gift_wrapping : false,
        hide_invoice_price: gift.is_gift ? gift.hide_invoice_price : false,
        gift_message: gift.is_gift ? gift.gift_message.slice(0, GIFT_MSG_MAX) : '',
      });

      // Handle free delivery credit consumption (if under $50 and member wants it)
      if (customer && customer.free_delivery_credits_remaining > 0 && effectiveDelivery > 0 && subtotal < 50) {
        try {
          await base44.functions.invoke('membershipEngine', {
            action: 'consume_credit',
            customer_id: customer.id
          });
        } catch (e) {
          console.error('Credit consumption failed:', e);
        }
      }

      // Update customer lifetime spend and check tier upgrades
      if (customer) {
        const newSpend = (customer.lifetime_spend_usd || 0) + grandTotal;
        await base44.entities.Customer.update(customer.id, {
          lifetime_spend_usd: newSpend,
          total_orders: (customer.total_orders || 0) + 1,
          total_spent_usd: (customer.total_spent_usd || 0) + grandTotal
        });

        // Check for tier upgrades
        try {
          await base44.functions.invoke('membershipEngine', {
            action: 'check_tier_upgrade',
            customer_id: customer.id
          });
        } catch (e) {
          console.error('Tier upgrade check failed:', e);
        }
      }
      // Increment promo code usage
      if (promoCode) {
        await base44.entities.PromoCode.update(promoCode.id, { times_used: (promoCode.times_used || 0) + 1 });
      }

      // Save preferred payment method for logged-in customers
      if (currentUser?.id) {
        try {
          await base44.auth.updateMe({ preferred_payment: form.payment_method });
        } catch (_) { /* non-critical */ }
      }

      await Promise.all(items.map(item =>
        base44.entities.OrderItem.create({
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          sku: item.product.sku || '',
          size: item.variant?.size || '',
          color: item.variant?.color || '',
          quantity: item.quantity,
          unit_price_usd: Number(item.price),
          line_total_usd: Number(item.price) * item.quantity,
        })
      ));

      // Fire confirmation (customer) + notification (admin) emails. Best effort.
      try {
        await base44.functions.invoke('sendOrderConfirmation', { order_id: order.id });
      } catch (e) {
        console.error('Order confirmation email failed:', e);
      }
      try {
        await base44.functions.invoke('sendOrderNotification', { order_id: order.id });
      } catch (e) {
        console.error('Order notification email failed:', e);
      }

      // Snapshot order total/items for the Pixel Purchase event before the cart
      // is cleared (which would otherwise zero out the values).
      lastOrderTotal.current = grandTotal;
      lastOrderItems.current = items;

      clearCart();
      setSuccess(order.order_number);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <>
        <ScrollToTop trigger={success} />
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
          <CheckCircle2 className="w-14 h-14 text-green-500 animate-in zoom-in duration-500" />
          <h2 className="text-2xl font-heading font-bold text-foreground">{t('Order Placed!', 'تم تقديم طلبك!')}</h2>
          <p className="text-muted-foreground">{t('Your order number is', 'رقم طلبك هو')} <strong className="text-primary text-lg">{success}</strong></p>
          <p className="text-sm text-muted-foreground">{t('We\'ll deliver Cash on Delivery. Track your order below.', 'سيتم التوصيل بالدفع عند الاستلام.')}</p>
          <div className="flex gap-3">
            <button onClick={() => navigate('/track')} className="px-5 py-2.5 border border-border rounded-full text-sm font-medium hover:bg-muted">
              {t('Track Order', 'تتبع الطلب')}
            </button>
            <button onClick={() => navigate('/shop')} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold">
              {t('Continue Shopping', 'تابع التسوق')}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (items.length === 0) {
    navigate('/cart', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Signed-in indicator with membership */}
      {currentUser && (
        <div className="bg-primary/5 border-b border-border px-4 py-4 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('Signed in as', 'تم تسجيل الدخول باسم')}</span>
              <span className="font-semibold text-foreground">{currentUser.full_name || currentUser.email}</span>
              {customer && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    customer.current_tier === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                    customer.current_tier === 'Silver' ? 'bg-slate-100 text-slate-800' :
                    'bg-orange-100 text-orange-800'
                  }`}>
                    {customer.current_tier} {t('Member', 'العضو')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {memberDiscount > 0 && `• ${memberDiscount}% ${t('discount', 'خصم')}`}
                    {customer.free_delivery_credits_remaining > 0 && ` • ${customer.free_delivery_credits_remaining} ${t('free deliveries', 'توصيلات مجانية')}`}
                  </span>
                </>
              )}
            </div>
            <Link to="/account" className="text-xs text-primary hover:underline">{t('Edit Profile', 'تعديل الملف الشخصي')}</Link>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-6">{t('Checkout', 'إتمام الطلب')}</h1>
        <div className="grid md:grid-cols-[1fr_320px] gap-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {stockError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex gap-3">
                <div className="text-destructive text-sm">{stockError}</div>
              </div>
            )}

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold text-foreground text-sm">{t('Contact Info', 'معلومات التواصل')}</h2>
              {[
                { k: 'customer_name', label: t('Full Name *', 'الاسم الكامل *'), required: true, autoComplete: 'name' },
                { k: 'customer_phone', label: t('Phone *', 'الهاتف *'), required: true, type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
                { k: 'customer_email', label: t('Email Address *', 'عنوان البريد الإلكتروني *'), required: true, type: 'email', inputMode: 'email', autoComplete: 'email', readOnly: !!currentUser },
              ].map(({ k, label, required, type, inputMode, autoComplete, readOnly }) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input 
                    required={required}
                    type={type || 'text'}
                    inputMode={inputMode}
                    autoComplete={autoComplete}
                    readOnly={readOnly}
                    value={form[k]}
                    onChange={e => { setF(k, e.target.value); if (k === 'customer_phone') setPhoneError(''); }}
                    className={`w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm min-h-[44px] ${readOnly ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}`}
                  />
                  {k === 'customer_email' && emailError && (
                    <p className="text-xs text-destructive mt-1">{emailError}</p>
                  )}
                  {k === 'customer_phone' && phoneError && (
                    <p className="text-xs text-destructive mt-1">{phoneError}</p>
                  )}
                </div>
              ))}

              {/* Guest account creation option */}
              {!currentUser && (
                <div className="border-t border-border pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createAccount}
                      onChange={(e) => setCreateAccount(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('Create an account to track my orders', 'إنشاء حساب لتتبع طلباتي')}
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold text-foreground text-sm">{t('Delivery Address', 'عنوان التوصيل')}</h2>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('Shipping Zone *', 'منطقة الشحن *')}</label>
                <select required value={form.shipping_zone_id} onChange={e => setF('shipping_zone_id', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                  <option value="">-- {t('Select a zone', 'اختر منطقة')} --</option>
                  {shippingZones.map(z => (
                    <option key={z.id} value={z.id}>
                      {lang === 'ar' ? (z.area_name_ar || z.area_name) : z.area_name} {z.is_catchall ? t('(Other areas)', '(مناطق أخرى)') : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('City', 'المدينة')}</label>
                  <select value={form.city} onChange={e => setF('city', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                    <option value="">--</option>
                    {CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('District', 'المنطقة')}</label>
                  <input value={form.district} onChange={e => setF('district', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm" placeholder={t('Optional', 'اختياري')} />
                </div>
              </div>
              {[
                { k: 'street', label: t('Street', 'الشارع'), autoComplete: 'address-line1' },
                { k: 'building', label: t('Building', 'البناية'), autoComplete: 'address-line2' },
                { k: 'floor', label: t('Floor (optional)', 'الطابق (اختياري)') },
                { k: 'landmark', label: t('Landmark (optional)', 'علامة مميزة (اختياري)') },
              ].map(({ k, label, autoComplete }) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input value={form[k]} onChange={e => setF(k, e.target.value)} autoComplete={autoComplete}
                    className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm min-h-[44px]" />
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground text-sm">{t('Payment', 'الدفع')}</h2>
                {currentUser?.preferred_payment && form.payment_method === currentUser.preferred_payment && (
                  <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {t('Saved preference', 'طريقة محفوظة')}
                  </span>
                )}
              </div>
              {enabledMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('No payment methods available.', 'لا توجد طرق دفع متاحة.')}</p>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  {enabledMethods.map(m => (
                    <button type="button" key={m.key} onClick={() => setF('payment_method', m.key)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors min-w-[120px]
                        ${form.payment_method === m.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gift options */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gift.is_gift}
                  onChange={e => setGiftField('is_gift', e.target.checked)}
                  className="rounded"
                />
                <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-primary" /> {t('This is a gift', 'هذا هدية')}
                </span>
              </label>

              {gift.is_gift && (
                <div className="space-y-3 pl-1 border-l-2 border-primary/20 ml-1">
                  <div className="pl-3 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gift.gift_wrapping}
                        onChange={e => setGiftField('gift_wrapping', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-foreground">{t('Add gift wrapping', 'أضف تغليف الهدية')}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gift.hide_invoice_price}
                        onChange={e => setGiftField('hide_invoice_price', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-foreground">{t('Hide prices on the packing slip / invoice', 'إخفاء الأسعار في إيصال الطلب')}</span>
                    </label>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">{t('Gift message (optional)', 'رسالة الهدية (اختياري)')}</label>
                      <textarea
                        value={gift.gift_message}
                        maxLength={GIFT_MSG_MAX}
                        onChange={e => setGiftField('gift_message', e.target.value.slice(0, GIFT_MSG_MAX))}
                        rows={3}
                        placeholder={t('Write a personal note to the recipient…', 'اكتب رسالة شخصية للمستلم…')}
                        className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none"
                      />
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        {gift.gift_message.length}/{GIFT_MSG_MAX}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <label className="text-xs text-muted-foreground block mb-1">{t('Order Notes (optional)', 'ملاحظات الطلب (اختياري)')}</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none" />
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors shadow-sm">
              {submitting ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
              {t('Place Order', 'تأكيد الطلب')} · ${grandTotal.toFixed(2)}
            </button>
          </form>

          {/* Order summary */}
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3 sticky top-24">
              <h2 className="font-semibold text-foreground text-sm">{t('Order Summary', 'ملخص الطلب')}</h2>
              {items.map((item, i) => {
                const name = lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name;
                return (
                  <div key={i} className="flex justify-between text-sm gap-2">
                    <span className="text-muted-foreground line-clamp-1 flex-1">{name} ×{item.quantity}</span>
                    <span className="font-semibold shrink-0">${(Number(item.price) * item.quantity).toFixed(2)}</span>
                  </div>
                );
              })}
              {/* Promo code input */}
              <div className="pt-2 border-t border-border">
                {promoCode ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <Tag className="w-4 h-4 text-green-700 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-green-800">{promoCode.code} applied!</p>
                      <p className="text-xs text-green-700">
                        {promoCode.type === 'free_shipping' ? t('Free shipping', 'شحن مجاني') : `-$${promoDiscount.toFixed(2)}`}
                      </p>
                    </div>
                    <button onClick={removePromo} className="text-green-700 hover:text-green-900"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('Promo Code', 'رمز ترويجي')}</label>
                    <div className="flex gap-2">
                      <input value={promoInput} onChange={e => setPromoInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                        placeholder={t('Enter code', 'أدخل الرمز')}
                        className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm" />
                      <button onClick={handleApplyPromo} disabled={!promoInput.trim() || promoLoading}
                        className="px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                        {promoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : t('Apply', 'تطبيق')}
                      </button>
                    </div>
                    {promoError && <p className="text-xs text-destructive">{promoError}</p>}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-2 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>{t('Subtotal', 'المجموع الفرعي')}</span><span>${subtotal.toFixed(2)}</span></div>

                {/* Show member tier and discount */}
                {customer && memberDiscount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-primary flex items-center gap-1 font-medium">
                      <Gift className="w-3 h-3" /> {customer.current_tier} {t('Member Discount', 'خصم العضو')} ({memberDiscount}%)
                    </span>
                    <span className="text-primary font-bold">-${effectiveMemberDiscount.toFixed(2)}</span>
                  </div>
                )}

                {/* Show promo code discount */}
                {effectivePromoDiscount > 0 && (
                  <div className="flex justify-between text-green-700 font-medium">
                    <span>{t('Promo Code', 'رمز ترويجي')} ({promoCode?.code})</span>
                    <span>-${effectivePromoDiscount.toFixed(2)}</span>
                  </div>
                )}

                {/* Delivery with free shipping reason */}
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('Delivery', 'التوصيل')}</span>
                  <span className="flex items-center gap-1">
                    {effectiveDelivery === 0 ? (
                      <span className="text-green-700 font-medium">
                        {isFreeShipping ? `${t('Free shipping', 'شحن مجاني')} (${t('promo', 'رمز')})` : `${t('Free', 'مجاني')} (${t('order over', 'طلب فوق')} $${freeShippingThreshold.toFixed(2)})`}
                      </span>
                    ) : (
                      `$${effectiveDelivery.toFixed(2)}`
                    )}
                  </span>
                </div>

                {/* Free shipping progress (if not yet qualified and no promo) */}
                {!qualifiesForThreshold && !isFreeShipping && (
                  <div className="pt-2 border-t border-border">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-muted-foreground">{t('Free shipping threshold', 'حد الشحن المجاني')}</span>
                      <span className="text-xs font-semibold text-primary">
                        ${(freeShippingThreshold - postDiscountSubtotal).toFixed(2)} {t('more', 'أكثر')}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min((postDiscountSubtotal / freeShippingThreshold) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-between font-bold text-foreground text-base">
                  <span>{t('Total', 'المجموع')}</span>
                  <span>${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}