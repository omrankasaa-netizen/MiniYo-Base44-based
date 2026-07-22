import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

export default function MidPageCta() {
  const { lang } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'mid_page_cta'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'mid_page_cta' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  if (!section?.is_active) return null;

  const title = lang === 'ar' ? (section.title_ar || section.title) : section.title;
  const body = lang === 'ar' ? (section.body_ar || section.body) : section.body;

  const content = (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl overflow-hidden shadow-lg group cursor-pointer max-w-7xl mx-auto">
      <div className="aspect-[16/5] sm:aspect-[16/4] w-full bg-muted">
        {section.image_url
          ? <img src={cmsImageSrc(section.image_url, 'large')} alt={title} width={1280} height={320} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          : <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20" />}
      </div>
      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center px-6">
        {title && <h2 className="text-2xl sm:text-3xl font-heading font-bold drop-shadow-sm" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{title}</h2>}
        {body && <p className="text-sm mt-2 opacity-90 max-w-md" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{body}</p>}
        {section.link_url && (
          <div className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 bg-white text-foreground rounded-full text-sm font-semibold shadow-md group-hover:scale-105 transition-transform">
            Shop Now <ArrowRight className="w-4 h-4" />
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-4">
      {section.link_url ? <Link to={section.link_url}>{content}</Link> : content}
    </section>
  );
}