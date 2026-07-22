import React from 'react';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Instagram } from 'lucide-react';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

export default function InstagramStrip() {
  const { t, lang } = useLang();
  const settings = useSiteSettings();

  const { data: assets = [] } = useQuery({
    queryKey: ['media-instagram'],
    queryFn: () => base44.entities.MediaAsset.filter({ type: 'other', is_active: true }, '-created_date', 8),
    staleTime: 60_000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_instagram'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_instagram' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];
  if (section && section.is_active === false) return null;

  const heading = (section && (lang === 'ar' ? (section.title_ar || section.title) : section.title)) || t('Our community', 'مجتمعنا');
  const handle = (section && (lang === 'ar' ? (section.body_ar || section.body) : section.body)) || t('Follow @miniyo.store.lb', 'تابع @miniyo.store.lb');
  const igUrl = section?.link_url || settings.instagramUrl;

  // Photos are manually curated in the CMS (Homepage Sections → Instagram Strip)
  // and stored as a JSON array of image URLs in gallery_json. These do NOT sync
  // from Instagram. Fall back to legacy MediaAsset rows, then blush placeholders.
  let gallery = [];
  try { gallery = section?.gallery_json ? JSON.parse(section.gallery_json) : []; } catch { gallery = []; }
  const galleryUrls = (Array.isArray(gallery) ? gallery : []).filter(Boolean);
  const sourceUrls = galleryUrls.length
    ? galleryUrls
    : assets.slice(0, 6).map(a => a?.url).filter(Boolean);

  // Show up to 6 tiles; fill remainder with blush placeholders
  const tiles = [...sourceUrls.slice(0, 6)];
  while (tiles.length < 6) tiles.push(null);

  return (
    <section className="py-12 sm:py-16 bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-7"
        >
          <div className="flex items-center gap-2.5">
            <Instagram className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground">{heading}</h2>
          </div>
          {igUrl && (
            <a href={igUrl} target="_blank" rel="noopener"
              className="flex items-center gap-2 text-sm text-primary font-medium hover:underline underline-offset-4">
              {handle}
              <Instagram className="w-4 h-4" />
            </a>
          )}
        </motion.div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {tiles.map((url, i) => {
            const tile = (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="aspect-square rounded-2xl overflow-hidden bg-accent/25 group cursor-pointer"
              >
                {url
                  ? <img src={cmsImageSrc(url, 'card')} alt="" width={320} height={320} loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : (
                    <div className="w-full h-full flex items-center justify-center bg-accent/20 group-hover:bg-accent/35 transition-colors">
                      <Instagram className="w-6 h-6 text-muted-foreground/30" />
                    </div>
                  )
                }
              </motion.div>
            );
            // Make populated tiles open the Instagram profile in a new tab.
            return url && igUrl
              ? <a key={i} href={igUrl} target="_blank" rel="noopener" aria-label={handle} className="block">{tile}</a>
              : tile;
          })}
        </div>
      </div>
    </section>
  );
}