import React from 'react';
import { useWishlist } from '@/contexts/WishlistContext';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import ProductCard from '@/components/storefront/ProductCard';
import { buildImagesByProduct } from '@/lib/imageFraming';
import { Link } from 'react-router-dom';

export default function WishlistPage() {
  const { wishlistIds } = useWishlist();
  const { currentUser } = useAuthUser();
  const { t } = useLang();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['wishlist-products', wishlistIds.join(',')],
    queryFn: async () => {
      if (wishlistIds.length === 0) return [];
      const [prods, imgs] = await Promise.all([
        base44.entities.Product.list('-created_date', 200),
        base44.entities.ProductImage.filter({ product_id: wishlistIds }, '-created_date'),
      ]);
      const imgMap = {};
      for (const img of imgs) { if (!imgMap[img.product_id] || img.is_primary) imgMap[img.product_id] = img.url; }
      const imagesByProduct = buildImagesByProduct(imgs);
      return prods
        .filter(p => wishlistIds.includes(p.id))
        .map(p => ({ ...p, primaryImage: imgMap[p.id] || null, images: imagesByProduct[p.id] || [] }));
    },
    enabled: wishlistIds.length > 0,
  });

  if (!currentUser) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Heart className="w-12 h-12 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">{t('Log in to save your wishlist.', 'سجّل الدخول لحفظ مفضلتك.')}</p>
        <button onClick={() => base44.auth.redirectToLogin('/wishlist')}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm">
          {t('Log In', 'تسجيل الدخول')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-6 flex items-center gap-2">
          <Heart className="w-6 h-6 text-rose-500 fill-rose-500" /> {t('My Wishlist', 'مفضلتي')}
        </h1>
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="aspect-square bg-muted rounded-3xl animate-pulse" />)}
          </div>
        )}
        {!isLoading && products.length === 0 && (
          <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-4">
            <Heart className="w-12 h-12 opacity-30" />
            <p>{t('Your wishlist is empty.', 'مفضلتك فارغة.')}</p>
            <Link to="/shop" className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm">
              {t('Explore Products', 'اكتشف المنتجات')}
            </Link>
          </div>
        )}
        {products.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}