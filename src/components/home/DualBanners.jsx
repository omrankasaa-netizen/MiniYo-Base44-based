import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

function DualCard({ section }) {
  const { lang } = useLang();
  if (!section?.is_active) return null;
  const title = lang === 'ar' ? (section.title_ar || section.title) : section.title;

  const inner = (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-3xl overflow-hidden shadow-md group cursor-pointer flex-1">
      <div className="aspect-square sm:aspect-[4/3] w-full bg-muted">
        {section.image_url
          ? <img src={cmsImageSrc(section.image_url, 'large')} alt={title} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full bg-gradient-to-br from-accent/30 to-secondary/20" />}
      </div>
      {title && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
          <p className="text-white font-heading font-bold text-lg drop-shadow" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{title}</p>
        </div>
      )}
    </motion.div>
  );

  return section.link_url ? <Link to={section.link_url} className="flex-1">{inner}</Link> : <div className="flex-1">{inner}</div>;
}

export default function DualBanners() {
  const { data: sections = [] } = useQuery({
    queryKey: ['cms-dual-banners'],
    queryFn: () => base44.entities.CmsSection.filter({}, 'section_key', 10),
    staleTime: 60_000,
    select: data => data.filter(s => s.section_key === 'dual_banner_left' || s.section_key === 'dual_banner_right'),
  });

  const left = sections.find(s => s.section_key === 'dual_banner_left');
  const right = sections.find(s => s.section_key === 'dual_banner_right');

  if (!left?.is_active && !right?.is_active) return null;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto w-full">
      <div className="flex gap-3 sm:gap-4">
        {left?.is_active && <DualCard section={left} />}
        {right?.is_active && <DualCard section={right} />}
      </div>
    </section>
  );
}