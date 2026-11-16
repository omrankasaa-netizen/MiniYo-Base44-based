import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import ProductCard from '@/components/storefront/ProductCard';
import { buildImagesByProduct } from '@/lib/imageFraming';
import { productAvailableQty } from '@/lib/inventory';
import { buildColorSwatches } from '@/lib/colorSwatches';
import { ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * Merchandising rules for a rail (all optional):
 *   minPriceUsd     – hide low-price accessories (socks, tights, headbands…)
 *   hideOutOfStock  – hide products with nothing left to order
 *   featuredFirst   – products marked Featured in the admin lead the rail
 *   topUpFilter     – when fewer than 4 products pass, fill up from this
 *                     broader filter (same rules apply)
 */
export default function ProductRow({
  title, titleAr, filter, viewAllLink, productIds = [],
  minPriceUsd = 0, hideOutOfStock = false, featuredFirst = false, topUpFilter = null,
}) {
  const { t, lang } = useLang();
  const scrollRef = useRef(null);
  const pinnedIds = Array.isArray(productIds) ? productIds.map(String).filter(Boolean) : [];
  const hasPinned = pinnedIds.length > 0;

  const merchandised = minPriceUsd > 0 || hideOutOfStock || featuredFirst || !!topUpFilter;
  const { data: rawProducts = [] } = useQuery({
    queryKey: ['home-products', JSON.stringify(filter), pinnedIds.join(','), minPriceUsd, featuredFirst, JSON.stringify(topUpFilter)],
    queryFn: async () => {
      if (hasPinned) {
        try {
          const pinned = await base44.entities.Product.filter({ id: pinnedIds, status: 'Active' }, '-created_date', 24);
          const order = new Map(pinnedIds.map((id, idx) => [id, idx]));
          return pinned.sort((a, b) => (order.get(String(a.id)) ?? 9999) - (order.get(String(b.id)) ?? 9999)).slice(0, 12);
        } catch {
          // id-array filter unsupported on older deployments — fall through to generic filter
        }
      }
      // Live API rejects boolean bindings in `q` filters on some deployments.
      // Query with server-safe fields, then apply boolean predicates client-side.
      const fetchMatching = async (f) => {
        const apiFilter = { ...f };
        const boolPredicates = [];
        for (const [k, v] of Object.entries(f || {})) {
          if (typeof v === 'boolean') {
            delete apiFilter[k];
            boolPredicates.push([k, v]);
          }
        }
        const base = await base44.entities.Product.filter(apiFilter, '-created_date', merchandised ? 200 : 48);
        return boolPredicates.length
          ? base.filter((p) => boolPredicates.every(([k, v]) => Boolean(p?.[k]) === v))
          : base;
      };
      if (!merchandised) return (await fetchMatching(filter)).slice(0, 12);

      // Merchandised rail: drop cheap accessories, then (optionally) put
      // Featured products first. Newest-first order is kept within each group.
      const passesPrice = (p) => Number(p?.price_usd || 0) >= minPriceUsd;
      let picked = (await fetchMatching(filter)).filter(passesPrice);
      if (picked.length < 4 && topUpFilter) {
        const seen = new Set(picked.map((p) => p.id));
        const extra = (await fetchMatching(topUpFilter)).filter((p) => passesPrice(p) && !seen.has(p.id));
        picked = picked.concat(extra);
      }
      if (featuredFirst) {
        picked = [...picked.filter((p) => p.is_featured), ...picked.filter((p) => !p.is_featured)];
      }
      // Keep extra candidates so out-of-stock items can be dropped later
      // without leaving the rail short.
      return picked.slice(0, 24);
    },
    staleTime: 60_000,
  });

  const productEntityIds = rawProducts.map(p => p.id);

  const { data: allImages = [] } = useQuery({
    queryKey: ['product-images-home', productEntityIds.join(',')],
    queryFn: async () => {
      if (productEntityIds.length === 0) return [];
      return base44.entities.ProductImage.filter({ product_id: productEntityIds }, 'sort_order');
    },
    enabled: productEntityIds.length > 0,
    staleTime: 60_000,
  });

  // Variant stock enrichment (mirrors ShopPage): without availableStock,
  // ProductCard can't flag out-of-stock variant products on the rails.
  const { data: variants = [], isFetched: variantsFetched } = useQuery({
    queryKey: ['rail-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 3000),
    enabled: productEntityIds.length > 0,
    staleTime: 60_000,
  });

  const variantsByProduct = React.useMemo(() => {
    const m = {};
    for (const v of variants) {
      if (!m[v.product_id]) m[v.product_id] = [];
      m[v.product_id].push(v);
    }
    return m;
  }, [variants]);

  const imagesByProduct = buildImagesByProduct(allImages);
  const enriched = rawProducts.map(p => {
    const imgs = imagesByProduct[p.id] || [];
    const pvs = variantsByProduct[p.id] || [];
    return {
      ...p,
      images: imgs,
      primaryImage: imgs[0]?.url || null,
      availableStock: productAvailableQty(p, pvs),
      colorSwatches: buildColorSwatches(p, pvs),
    };
  });
  // Stock is only known for variant products once their variants loaded.
  const products = (hideOutOfStock
    ? enriched.filter((p) => (p.has_variants && !variantsFetched) || p.availableStock > 0)
    : enriched
  ).slice(0, 12);

  if (products.length === 0) return null;

  function scroll(dir) {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir * 260, behavior: 'smooth' });
  }

  const heading = lang === 'ar' ? titleAr : title;

  return (
    <section className="py-12 sm:py-16 bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-7"
        >
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">{heading}</h2>
          <div className="flex items-center gap-2">
            <Link to={viewAllLink} className="text-sm text-primary font-medium hover:underline underline-offset-4">
              {t('View all', 'عرض الكل')}
            </Link>
            <div className="hidden sm:flex gap-1.5">
              <button onClick={() => scroll(-1)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => scroll(1)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Mobile: horizontal scroll | Desktop: 4-up grid */}
        <div className="hidden lg:grid grid-cols-4 gap-5">
          {products.slice(0, 8).map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }}>
              <ProductCard product={p} />
            </motion.div>
          ))}
        </div>
        <div
          ref={scrollRef}
          className="lg:hidden flex gap-3 overflow-x-auto pb-2 mobile-rail"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map(p => (
            <div key={p.id} className="snap-start shrink-0 w-[46vw] min-w-[170px] max-w-[205px]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
