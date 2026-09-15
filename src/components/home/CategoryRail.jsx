import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { cmsImageSrc, cmsImageSrcSet, handleImageError } from '@/lib/imageFraming';

// Curated "line" of the five core merchandising categories, shown directly
// under the SeasonalDuo. Tiles link to tag-filtered shop views (the shop
// understands ?tag=…), so they work even before matching DB categories exist.
// Photos are hotlinked from the store's own product catalog CDN.
const TILES = [
  {
    key: 'accessories',
    en: 'Accessories',
    ar: 'أكسسوارات',
    tag: 'accessories',
    img: 'https://images.miniyokids.com/products/1782306117539-47611708-BSU2488-GRP_2/card.webp',
  },
  {
    key: 'hospital-sets',
    en: 'Hospital Sets',
    ar: 'أطقم الاستقبال',
    tag: 'hospital sets',
    img: 'https://images.miniyokids.com/products/1782506224695-dc953f8a-HOSP-HORSE-BEIGE-10PC_CORR_1/card.webp',
  },
  {
    key: 'rompers',
    en: 'Rompers',
    ar: 'رومبرات',
    tag: 'romper',
    img: 'https://images.miniyokids.com/products/TONGS-5900-SAGE-GREEN_1.webp',
  },
  {
    key: 'bodysuits',
    en: 'Bodysuits',
    ar: 'بوديسوت',
    tag: 'bodysuits',
    img: 'https://images.miniyokids.com/products/1782314347161-6cd59204-BE2084-GRP_2/card.webp',
  },
  {
    key: 'comfort-sets',
    en: 'Comfort Sets',
    ar: 'أطقم مريحة',
    tag: 'comfort set',
    img: 'https://images.miniyokids.com/products/1789396442705-45c32c37-CRM-FLOWERPRINTEDZCOMFORTSETPINK-002/card.webp',
  },
];

export default function CategoryRail() {
  const { t, lang } = useLang();
  const scrollRef = useRef(null);

  function scroll(dir) {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  return (
    <section className="bg-background pt-4 pb-8 sm:pt-6 sm:pb-10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-5"
        >
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
            {t('Shop by category', 'تسوّقي حسب الفئة')}
          </h2>
          <div className="flex items-center gap-2">
            <Link to="/shop" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
              {t('View all', 'عرض الكل')}
            </Link>
            <div className="hidden sm:flex gap-1.5">
              <button onClick={() => scroll(-1)} aria-label={t('Scroll categories back', 'مرر الفئات للخلف')} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => scroll(1)} aria-label={t('Scroll categories forward', 'مرر الفئات للأمام')} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Mobile: snap rail | Desktop: even 5-up grid */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 mobile-rail lg:grid lg:grid-cols-5 lg:overflow-visible lg:gap-5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {TILES.map((tile, i) => (
            <motion.div
              key={tile.key}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="snap-start shrink-0"
            >
              <Link
                to={`/shop?tag=${encodeURIComponent(tile.tag)}`}
                className="group flex flex-col items-center gap-3 w-36 sm:w-44 lg:w-auto"
              >
                <div className="w-36 h-36 sm:w-44 sm:h-44 lg:w-full lg:h-auto lg:aspect-square rounded-3xl overflow-hidden bg-accent/20 border border-border/60 shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all duration-300">
                  <img
                    src={cmsImageSrc(tile.img, 'card')}
                    srcSet={cmsImageSrcSet(tile.img)}
                    sizes="(max-width: 640px) 144px, (max-width: 1024px) 176px, 240px"
                    alt={lang === 'ar' ? tile.ar : tile.en}
                    width={240}
                    height={240}
                    loading="lazy"
                    decoding="async"
                    onError={handleImageError}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <span className="text-sm font-semibold text-foreground text-center leading-tight">
                  {lang === 'ar' ? tile.ar : tile.en}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
