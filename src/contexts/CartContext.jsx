import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();
const STORAGE_KEY = 'miniyo-cart';

function loadCart() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode / quota) — cart stays in memory */
    }
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
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function updateQty(key, quantity) {
    if (quantity <= 0) { removeItem(key); return; }
    setItems(prev => prev.map(i => i.key === key ? { ...i, quantity } : i));
  }

  function clearCart() { setItems([]); }

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalQty, subtotal, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
