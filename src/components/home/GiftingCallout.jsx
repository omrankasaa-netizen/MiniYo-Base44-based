import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

export default function GiftingCallout() {
  const { t, lang } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_gifting'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_gifting' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];
  if (section && section.is_active === false) return null;

  const title  = section ? (lang === 'ar' ? (section.title_ar || section.title) : section.title) : t('The perfect newborn gift.', 'الهدية المثالية للمولود الجديد.');
  const body   = section ? (lang === 'ar' ? (section.body_ar  || section.body)  : section.body)  : t('Curated gift sets for hospital visits, baby showers, and first-day celebrations. Wrapped with love.', 'طقم هدايا مختارة بعناية لزيارة المستشفى، حفلات الاستقبال، والمناسبات الأولى. مغلّفة بحب.');
  const imgUrl = section?.image_url || null;
  const link   = section?.link_url  || '/shop?category=sets';

  return (
    <section className="py-14 sm:py-20 bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative bg-gradient-to-br from-accent/30 via-accent/10 to-secondary/10 rounded-3xl overflow-hidden border border-border/40 shadow-sm"
        >
          <div className={`flex flex-col ${imgUrl ? 'md:flex-row' : ''} items-center gap-0`}>
            {imgUrl && (
              <div className="w-full md:w-2/5 aspect-video md:aspect-auto md:h-full overflow-hidden">
                <img src={cmsImageSrc(imgUrl, 'large')} alt={title} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover min-h-[220px]" />
              </div>
            )}
            <div className="flex-1 p-8 sm:p-12 text-center md:text-start">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold mb-5">
                <Gift className="w-3.5 h-3.5" />
                {t('Gift Sets', 'طقم هدايا')}
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-foreground leading-tight mb-4">{title}</h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-7 max-w-lg">{body}</p>
              <Link to={link}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-7 py-3.5 rounded-full font-semibold text-sm hover:bg-primary/90 transition-all shadow-md hover:shadow-lg active:scale-95">
                {t('Shop gift sets', 'تسوق طقم الهدايا')}
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}