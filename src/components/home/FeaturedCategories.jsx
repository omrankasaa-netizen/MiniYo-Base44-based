import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cmsImageSrc } from '@/lib/imageFraming';

export default function FeaturedCategories() {
  const { t, lang } = useLang();
  const scrollRef = useRef(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'sort_order', 20),
    staleTime: 60_000,
  });

  if (categories.length === 0) return null;

  function scroll(dir) {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

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
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            {t('Shop by category', 'تسوق حسب الفئة')}
          </h2>
          <div className="hidden sm:flex gap-2">
            <button onClick={() => scroll(-1)} className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={() => scroll(1)} className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categories.map((cat, i) => {
            const name = lang === 'ar' ? (cat.name_ar || cat.name) : cat.name;
            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="snap-start shrink-0"
              >
                <Link
                  to={`/shop?category=${cat.id}`}
                  className="group flex flex-col items-center gap-3 w-36 sm:w-44"
                >
                  <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl overflow-hidden bg-accent/20 border border-border/60 shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300">
                    {cat.image_url
                      ? <img src={cmsImageSrc(cat.image_url, 'card')} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">👶</div>}
                  </div>
                  <span className="text-sm font-semibold text-foreground text-center leading-tight">{name}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}