import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

function SinglePromoBanner({ section }) {
  const { lang } = useLang();
  if (!section?.is_active) return null;
  const title = lang === 'ar' ? (section.title_ar || section.title) : section.title;
  const body = lang === 'ar' ? (section.body_ar || section.body) : section.body;

  const inner = (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl overflow-hidden shadow-md group cursor-pointer">
      <div className="aspect-[16/5] sm:aspect-[16/4] w-full bg-muted">
        {section.image_url
          ? <img src={cmsImageSrc(section.image_url, 'large')} alt={title} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full bg-gradient-to-r from-accent/30 to-secondary/30" />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent flex items-center px-8">
        <div className="text-white max-w-md" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {title && <h2 className="text-xl sm:text-2xl font-heading font-bold drop-shadow-sm">{title}</h2>}
          {body && <p className="text-sm mt-1 opacity-90">{body}</p>}
          {section.link_url && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-white/20 border border-white/40 px-4 py-1.5 rounded-full backdrop-blur-sm">
              Shop Now <ArrowRight className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  return section.link_url ? <Link to={section.link_url}>{inner}</Link> : inner;
}

export default function PromoStripBanner() {
  const { data: sections = [] } = useQuery({
    queryKey: ['cms-promo-strips'],
    queryFn: () => base44.entities.CmsSection.filter({}, 'sort_order', 50),
    staleTime: 60_000,
    select: data => data.filter(s => s.section_key.startsWith('promo_strip_') && s.is_active),
  });

  if (!sections.length) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-4 space-y-3 max-w-7xl mx-auto w-full">
      {sections.map(s => <SinglePromoBanner key={s.id} section={s} />)}
    </section>
  );
}