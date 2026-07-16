import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLang } from '@/contexts/LanguageContext';
import ProductCard from '@/components/storefront/ProductCard';
import { buildImagesByProduct } from '@/lib/imageFraming';

/**
 * "You might also like" — recommended products shown under a product card.
 *
 * Selection logic (best-effort, no extra backend endpoint needed):
 *   1. Same subcategory as the current product (closest match)
 *   2. Then same category
 *   3. Then same gender / age group
 *   4. Backfilled with newest active products
 * The current product is always excluded, results are de-duplicated, and the
 * list is capped. Images/variants are enriched the same way ShopPage does so
 * each ProductCard renders its own correct photo + stock.
 */
export default function RelatedProducts({ product, limit = 4 }) {
  const { t } = useLang();

  const { data: products = [] } = useQuery({
    queryKey: ['related-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, '-created_date', 500),
    enabled: !!product?.id,
    staleTime: 60_000,
  });

  // Selection depends only on the product list + the current product's facets, so
  // the picked set is known before any image/variant fetch. This lets us scope
  // those fetches to exactly the products we'll render instead of the whole table.
  const picked = useMemo(() => {
    if (!product?.id) return [];
    const others = products.filter(p => p.id !== product.id);

    const scored = others.map(p => {
      let score = 0;
      if (product.subcategory_id && p.subcategory_id === product.subcategory_id) score += 8;
      if (product.category_id && p.category_id === product.category_id) score += 4;
      if (product.gender && p.gender === product.gender) score += 2;
      if (product.age_group && p.age_group === product.age_group) score += 1;
      return { p, score };
    });

    // Prefer relevant matches first; ties broken by newest (list already -created_date).
    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.p).slice(0, limit);
  }, [products, product?.id, product?.subcategory_id, product?.category_id, product?.gender, product?.age_group, limit]);

  const pickedIds = useMemo(() => picked.map(p => p.id), [picked]);
  const pickedKey = pickedIds.join(',');

  const { data: images = [] } = useQuery({
    queryKey: ['related-product-images', pickedKey],
    queryFn: () => pickedIds.length === 0
      ? []
      : base44.entities.ProductImage.filter({ product_id: pickedIds }, '-created_date'),
    enabled: !!product?.id && pickedIds.length > 0,
    staleTime: 60_000,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['related-variants', pickedKey],
    queryFn: () => pickedIds.length === 0
      ? []
      : base44.entities.ProductVariant.filter({ product_id: pickedIds }, '-created_date'),
    enabled: !!product?.id && pickedIds.length > 0,
    staleTime: 60_000,
  });

  const imagesByProduct = useMemo(() => buildImagesByProduct(images), [images]);

  const imgMap = useMemo(() => {
    const m = {};
    for (const img of images) {
      if (!img.url) continue;
      if (!m[img.product_id] || img.is_primary) m[img.product_id] = img.url;
    }
    return m;
  }, [images]);

  const variantsByProduct = useMemo(() => {
    const m = {};
    for (const v of variants) { if (!m[v.product_id]) m[v.product_id] = []; m[v.product_id].push(v); }
    return m;
  }, [variants]);

  const recommended = useMemo(() => {
    // Enrich exactly like ShopPage so ProductCard gets per-product images + stock.
    return picked.map(p => {
      const pvs = variantsByProduct[p.id] || [];
      const totalStock = p.has_variants && pvs.length > 0
        ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
        : (p.stock_quantity || 0);
      return { ...p, primaryImage: imgMap[p.id] || null, images: imagesByProduct[p.id] || [], totalStock };
    });
  }, [picked, imgMap, imagesByProduct, variantsByProduct]);

  if (recommended.length === 0) return null;

  return (
    <div className="border-t border-border pt-8 mt-8">
      <h3 className="text-lg font-heading font-bold text-foreground mb-6">
        {t('You might also like', 'قد يعجبك أيضاً')}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
        {recommended.map(p => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
