import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Star, ChevronLeft, ChevronRight, Heart } from 'lucide-react';

function StarRating({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

export default function ReviewsCarousel() {
  const { t, lang } = useLang();
  const [idx, setIdx] = useState(0);

  const { data: reviews = [] } = useQuery({
    queryKey: ['published-reviews'],
    queryFn: () => base44.entities.Review.filter({ is_published: true }, '-created_date', 20),
    staleTime: 60_000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_reviews'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_reviews' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  const shown = reviews.filter(r => r.body);
  const total = shown.length;

  if (section && section.is_active === false) return null;

  const heading = section
    ? (lang === 'ar' ? (section.title_ar || section.title) : section.title) || t('Loved by parents', 'يحبه الأهالي')
    : t('Loved by parents', 'يحبه الأهالي');
  const emptyMsg = section && (lang === 'ar' ? (section.body_ar || section.body) : section.body)
    ? (lang === 'ar' ? (section.body_ar || section.body) : section.body)
    : t('Real reviews coming soon — be our first 🤍', 'تقييمات حقيقية قريبًا — كن أول من يقيّم 🤍');

  function prev() { setIdx(i => (i - 1 + total) % total); }
  function next() { setIdx(i => (i + 1) % total); }

  return (
    <section className="py-14 sm:py-20 bg-card border-y border-border/40" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-2xl sm:text-3xl font-heading font-bold text-foreground text-center mb-10"
        >
          {heading}
        </motion.h2>

        {total === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-col items-center gap-4 py-8 text-center"
          >
            <div className="w-16 h-16 bg-accent/30 rounded-full flex items-center justify-center">
              <Heart className="w-7 h-7 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm">{emptyMsg}</p>
          </motion.div>
        ) : (
          <div className="relative max-w-2xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="bg-background rounded-3xl p-8 shadow-sm border border-border/60 text-center"
              >
                <StarRating rating={shown[idx].rating} />
                <p className="mt-4 text-foreground leading-relaxed text-base italic">"{shown[idx].body}"</p>
                <p className="mt-4 text-sm font-semibold text-muted-foreground">{shown[idx].customer_name || t('Verified customer', 'عميل موثق')}</p>
              </motion.div>
            </AnimatePresence>
            {total > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button onClick={prev} aria-label={t('Previous review', 'التقييم السابق')} className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <span className="text-xs text-muted-foreground">{idx + 1} / {total}</span>
                <button onClick={next} aria-label={t('Next review', 'التقييم التالي')} className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}