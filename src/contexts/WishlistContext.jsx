import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuthUser } from '@/contexts/AuthUserContext';

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const { currentUser } = useAuthUser();
  const [items, setItems] = useState([]); // array of product_ids
  const [itemMap, setItemMap] = useState({}); // productId -> wishlistItemId

  useEffect(() => {
    if (currentUser?.id) loadWishlist();
    else { setItems([]); setItemMap({}); }
  }, [currentUser?.id]);

  async function loadWishlist() {
    try {
      const list = await base44.entities.WishlistItem.filter({ user_id: currentUser.id }, '-created_date', 200);
      const ids = list.map(w => w.product_id);
      const map = {};
      for (const w of list) map[w.product_id] = w.id;
      setItems(ids);
      setItemMap(map);
    } catch { }
  }

  async function toggle(productId) {
    if (!currentUser?.id) { base44.auth.redirectToLogin(window.location.pathname); return; }
    if (itemMap[productId]) {
      await base44.entities.WishlistItem.delete(itemMap[productId]);
      setItems(p => p.filter(id => id !== productId));
      setItemMap(m => { const n = { ...m }; delete n[productId]; return n; });
    } else {
      const w = await base44.entities.WishlistItem.create({ user_id: currentUser.id, product_id: productId });
      setItems(p => [...p, productId]);
      setItemMap(m => ({ ...m, [productId]: w.id }));
    }
  }

  const isWishlisted = (productId) => items.includes(productId);

  return (
    <WishlistContext.Provider value={{ wishlistIds: items, toggle, isWishlisted, reload: loadWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}