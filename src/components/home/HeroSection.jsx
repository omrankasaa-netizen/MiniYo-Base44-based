import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { cmsImageSrc } from '@/lib/imageFraming';

export default function HeroSection() {
  const { lang, t } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_hero'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_hero' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  const title   = section ? (lang === 'ar' ? (section.title_ar   || section.title)  : section.title)  : t('Softness your baby deserves.', 'نعومة يستاهلها صغيرك.');
  const body    = section ? (lang === 'ar' ? (section.body_ar    || section.body)   : section.body)   : t("Gentle, organic-feel cotton for Lebanon's littlest ones.", 'قطن ناعم وطبيعي لأصغر أفراد عائلتك في لبنان.');
  const imgUrl  = section?.image_url || null;
  const linkUrl = section?.link_url  || '/shop';

  return (
    <section className="relative bg-background overflow-hidden">
      {/* Organic background shapes */}
      <div className="absolute top-0 right-0 w-[38vw] h-[38vw] max-w-sm max-h-sm bg-accent/25 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[32vw] h-[32vw] max-w-xs max-h-xs bg-secondary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24">
        <div className={`flex flex-col ${imgUrl ? 'lg:flex-row' : ''} items-center gap-10 lg:gap-16`}>
          {/* Text side */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className={`flex-1 text-center ${imgUrl ? 'lg:text-start' : ''} max-w-2xl`}
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
          >
            <span className="inline-block bg-accent/60 text-accent-foreground text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide">
              {t('🤍 Made with love · Lebanon', '🤍 صُنع بحب · لبنان')}
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold text-foreground leading-tight tracking-tight mb-5">
              {title}
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-8 max-w-md mx-auto lg:mx-0">
              {body}
            </p>

            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              <Link to={linkUrl}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-7 py-3.5 rounded-full font-semibold text-sm shadow-md hover:bg-primary/90 hover:shadow-lg transition-all duration-200 active:scale-95">
                {t('Shop the collection', 'تسوق المجموعة')}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/shop?sort=new"
                className="inline-flex items-center gap-2 text-primary font-medium text-sm hover:underline underline-offset-4 px-4 py-3.5">
                {t('New arrivals →', 'الوصولات الجديدة ←')}
              </Link>
            </div>

            <p className="mt-6 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 justify-center lg:justify-start">
              <span>{t('✓ Cash on Delivery', '✓ الدفع عند الاستلام')}</span>
              <span>{t('✓ Delivery across Lebanon', '✓ توصيل في كل لبنان')}</span>
              <span>{t('✓ Made with love', '✓ صُنع بحب')}</span>
            </p>
          </motion.div>

          {/* Image side */}
          {imgUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
              className="flex-1 w-full max-w-md lg:max-w-lg"
            >
              <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/5]">
                <img src={cmsImageSrc(imgUrl, 'large')} alt={title} loading="eager" decoding="async" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}