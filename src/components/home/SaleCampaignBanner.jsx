import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

export default function SaleCampaignBanner() {
  const { lang } = useLang();

  const { data: bannerSections = [] } = useQuery({
    queryKey: ['cms-section', 'countdown_sale_banner'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'countdown_sale_banner' }, 'sort_order', 1),
    staleTime: 60_000,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns-live'],
    queryFn: () => base44.entities.Campaign.filter({ is_active: true }, '-starts_at', 20),
    staleTime: 60_000,
  });

  const section = bannerSections[0];
  if (!section?.is_active) return null;

  const now = new Date();
  const hasLiveCampaign = campaigns.some(c =>
    c.is_active && new Date(c.starts_at) <= now && new Date(c.ends_at) >= now
  );
  if (!hasLiveCampaign) return null;

  const title = lang === 'ar' ? (section.title_ar || section.title) : section.title;
  const body = lang === 'ar' ? (section.body_ar || section.body) : section.body;

  const content = (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl overflow-hidden shadow-lg group cursor-pointer max-w-7xl mx-auto">
      <div className="aspect-[16/4] sm:aspect-[16/3] w-full bg-muted">
        {section.image_url
          ? <img src={cmsImageSrc(section.image_url, 'large')} alt={title} width={1280} height={320} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full bg-gradient-to-r from-destructive/20 to-accent/30" />}
      </div>
      <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white text-center px-6">
        {title && <h2 className="text-xl sm:text-2xl font-heading font-bold drop-shadow" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{title}</h2>}
        {body && <p className="text-sm mt-1 opacity-90" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{body}</p>}
        {section.link_url && (
          <div className="mt-3 inline-flex items-center gap-2 px-5 py-2 bg-white text-foreground rounded-full text-xs font-semibold shadow">
            View Sale <ArrowRight className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-3">
      {section.link_url ? <Link to={section.link_url}>{content}</Link> : content}
    </section>
  );
}