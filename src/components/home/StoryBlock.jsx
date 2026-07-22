import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

export default function StoryBlock() {
  const { t, lang } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_story'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_story' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  const title  = section ? (lang === 'ar' ? (section.title_ar || section.title) : section.title) : t('Made with love for Lebanon\'s little ones.', 'صُنع بحب لصغار لبنان.');
  const body   = section ? (lang === 'ar' ? (section.body_ar  || section.body)  : section.body)  : t('Soft fabrics, honest prices, delivered to your door. MiniYo is built for the parents of Lebanon — because your little ones deserve the best.', 'أقمشة ناعمة، أسعار صادقة، وتوصيل إلى بابك. ميني يو مبني لأهالي لبنان — لأن صغاركم يستاهلون الأفضل.');
  const imgUrl = section?.image_url || null;

  return (
    <section className="py-14 sm:py-20 bg-accent/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex flex-col ${imgUrl ? 'md:flex-row' : ''} items-center gap-10 md:gap-14`}>
          {imgUrl && (
            <motion.div
              initial={{ opacity: 0, x: lang === 'ar' ? 24 : -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex-1 w-full max-w-sm"
            >
              <div className="rounded-3xl overflow-hidden shadow-xl aspect-square">
                <img src={cmsImageSrc(imgUrl, 'large')} alt={title} width={800} height={800} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover" />
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex-1 text-center md:text-start max-w-xl"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-2xl mb-5">
              <Heart className="w-6 h-6 text-primary fill-primary/30" />
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-foreground leading-tight mb-4">{title}</h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-7">{body}</p>
            <Link to="/about"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm">
              {t('Our story →', 'قصتنا →')}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}