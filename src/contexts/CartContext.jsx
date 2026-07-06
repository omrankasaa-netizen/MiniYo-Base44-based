import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isDiscountLive, getEffectiveUnitPrice } from '@/lib/discounts';
import { trackAddToCart } from '@/lib/metaPixel';
import { safeLocalStorage } from '@/lib/safeStorage';

const CartContext = createContext();
const STORAGE_KEY = 'miniyo-cart';

function loadCart() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // JSON.parse guard — safeLocalStorage itself never throws.
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // safeLocalStorage no-ops (keeps the cart in an in-memory shim) when storage
    // is unavailable — private mode, quota, or a blocked in-app WebView.
    safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function getKey(product, variant) {
    return variant ? `${product.id}_${variant.id}` : String(product.id);
  }

  function addItem(product, variant, qty = 1) {
    const key = getKey(product, variant);
    setItems(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + qty } : i);
      }
      const price = parseFloat(variant?.price_usd || product.price_usd || 0);
      return [...prev, { key, product, variant, quantity: qty, price }];
    });

    trackAddToCart({ product, variant, quantity: qty });
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function updateQty(key, quantity) {
    if (quantity <= 0) { removeItem(key); return; }
    setItems(prev => prev.map(i => i.key === key ? { ...i, quantity } : i));
  }

  function clearCart() { setItems([]); }

  // Live auto-discounts (same source as the storefront DiscountContext) so cart
  // and checkout prices match the badge price. Recomputed reactively — the stored
  // line price is never frozen.
  const { data: discounts = [] } = useQuery({
    queryKey: ['active-discounts'],
    queryFn: () => base44.entities.Discount.filter({ is_active: true }, '-created_date', 100),
    staleTime: 60_000,
  });
  const liveDiscounts = useMemo(() => discounts.filter(isDiscountLive), [discounts]);

  // Decorate each line with its effective (discounted) unit price. basePrice is the
  // variant price when present, otherwise the product price (unchanged base selection).
  const decoratedItems = useMemo(() => items.map(i => {
    const basePrice = parseFloat(i.variant?.price_usd || i.product?.price_usd || i.price || 0) || 0;
    const effective = getEffectiveUnitPrice(liveDiscounts, i.product, basePrice);
    return { ...i, basePrice, price: effective };
  }), [items, liveDiscounts]);

  const totalQty = decoratedItems.reduce((s, i) => s + i.quantity, 0);
  const subtotal = decoratedItems.reduce((s, i) => s + (parseFloat(i.price) || 0) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items: decoratedItems, addItem, removeItem, updateQty, clearCart, totalQty, subtotal, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
