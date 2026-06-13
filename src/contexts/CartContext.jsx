import React, { createContext, useContext, useState } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  function getKey(product, variant) {
    return variant ? `${product.id}_${variant.id}` : product.id;
  }

  function addItem(product, variant, qty = 1) {
    const key = getKey(product, variant);
    setItems(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, qty: i.qty + qty } : i);
      const price = variant?.price_usd || product.price_usd || 0;
      return [...prev, { key, product, variant, qty, price }];
    });
  }

  function removeItem(key) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function updateQty(key, qty) {
    if (qty <= 0) { removeItem(key); return; }
    setItems(prev => prev.map(i => i.key === key ? { ...i, qty } : i));
  }

  function clearCart() { setItems([]); }

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, totalQty, subtotal, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}