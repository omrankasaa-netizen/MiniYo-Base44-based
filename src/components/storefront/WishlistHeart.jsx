import React from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/contexts/WishlistContext';

export default function WishlistHeart({ productId, className = '' }) {
  const { isWishlisted, toggle } = useWishlist();
  const active = isWishlisted(productId);

  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(productId); }}
      className={`flex items-center justify-center transition-all ${className}`}
      aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
    >
      <Heart className={`w-4 h-4 transition-colors ${active ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground hover:text-rose-400'}`} />
    </button>
  );
}