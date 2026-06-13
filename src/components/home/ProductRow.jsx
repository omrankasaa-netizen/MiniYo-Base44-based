import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import ProductCard from '@/components/storefront/ProductCard';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export default function ProductRow({ title, titleAr, filter, viewAllLink }) {
  const { t, lang } = useLang();
  const scrollRef = useRef(null);

  const { data: rawProducts = [] } = useQuery({
    queryKey: ['home-products', JSON.stringify(filter)],
    queryFn: () => base44.entities.Product.filter(filter, '-created_date', 12),
    staleTime: 60_000,
  });

  const { data: allImages = [] } = useQuery({
    queryKey: ['product-images-home', rawProducts.map(p => p.id).join(',')],
    queryFn: async () => {
      if (rawProducts.length === 0) return [];
      return base44.entities.ProductImage.filter({ is_primary: true }, 'sort_order', 100);
    },
    enabled: rawProducts.length > 0,
    staleTime: 60_000,
  });

  const imgMap = {};
  for (const img of allImages) {
    if (!imgMap[img.product_id]) imgMap[img.product_id] = img.url;
  }

  const products = rawProducts.map(p => ({ ...p, primaryImage: imgMap[p.id] || null }));

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
          className="lg:hidden flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map(p => (
            <div key={p.id} className="snap-start shrink-0 w-[220px]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}