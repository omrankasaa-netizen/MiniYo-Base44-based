import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { cmsImageSrc, cmsImageSrcSet, handleImageError } from '@/lib/imageFraming';

// Two large rounded promo cards directly under the hero/trust strip.
// Left card → Baby gift boxes (/gifts: ready-made boxes + gift box builder).
// Right card → New Season Collection (winter/autumn + non-discounted new items).
const CARDS = [
  {
    key: 'gift-boxes',
    to: '/gifts',
    img: 'https://images.miniyokids.com/products/1793910995717-3167a66f-1000104771/card.webp',
    eyebrowEn: 'Gift-wrapped & ready',
    eyebrowAr: 'مغلّفة وجاهزة',
    titleEn: 'Baby Gift Boxes',
    titleAr: 'علب هدايا للبيبي',
    subEn: 'Ready-made boxes, or pick the baby’s age and build your own in 3 taps.',
    subAr: 'علب جاهزة، أو اختاري عمر البيبي وحضّري علبتك بـ3 كبسات.',
    ctaEn: 'Choose a gift box',
    ctaAr: 'اختاري علبة هدية',
    badge: '🎁',
    badgeClass: 'bg-white text-foreground',
  },
  {
    key: 'new-season',
    to: '/shop?view=new-season',
    img: 'https://images.miniyokids.com/products/1789401112782-7903e80b-CRM-COMFORTFLEECESET-004/card.webp',
    eyebrowEn: 'Just landed',
    eyebrowAr: 'وصل حديثاً',
    titleEn: 'New Season Collection',
    titleAr: 'مجموعة الموسم الجديد',
    subEn: 'Cozy autumn & winter layers for the little ones.',
    subAr: 'طبقات الخريف والشتاء الدافئة لصغاركم.',
    ctaEn: 'Explore the collection',
    ctaAr: 'اكتشفي المجموعة',
    badge: null,
    badgeClass: '',
  },
];

function PromoCard({ card, lang, t, index }) {
  const isAr = lang === 'ar';
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Link
        to={card.to}
        className="group relative block overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] border border-border/60 shadow-sm hover:shadow-xl transition-shadow duration-300 aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-[400px]"
        aria-label={isAr ? card.titleAr : card.titleEn}
      >
        <img
          src={cmsImageSrc(card.img, 'large')}
          srcSet={cmsImageSrcSet(card.img)}
          sizes="(max-width: 1024px) 100vw, 50vw"
          alt={isAr ? card.titleAr : card.titleEn}
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
          onError={handleImageError}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
        />
        {/* Readability gradient — stronger at text side, RTL-aware */}
        <div className={`absolute inset-0 bg-gradient-to-t ${isAr ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-black/75 via-black/35 to-black/5`} />

        {card.badge && (
          <span className={`absolute top-4 sm:top-5 rounded-full px-3.5 py-1.5 text-sm sm:text-base font-bold shadow-lg ${isAr ? 'left-4 sm:left-5' : 'right-4 sm:right-5'} ${card.badgeClass}`}>
            {card.badge}
          </span>
        )}

        <div className={`absolute inset-x-0 bottom-0 p-5 sm:p-8 text-white ${isAr ? 'text-right' : 'text-left'}`}>
          <span className="inline-block bg-white/20 backdrop-blur-sm text-white text-[11px] sm:text-xs font-semibold px-3 py-1 rounded-full mb-2.5 tracking-wide">
            {isAr ? card.eyebrowAr : card.eyebrowEn}
          </span>
          <h3 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold leading-tight mb-1.5 drop-shadow-sm">
            {isAr ? card.titleAr : card.titleEn}
          </h3>
          <p className="text-sm sm:text-base text-white/85 mb-4 max-w-xs">
            {isAr ? card.subAr : card.subEn}
          </p>
          <span className="inline-flex items-center gap-2 bg-white text-foreground text-sm font-semibold px-5 py-2.5 rounded-full shadow-md group-hover:gap-3 transition-all">
            {isAr ? card.ctaAr : card.ctaEn}
            <Arrow className="w-4 h-4" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

export default function SeasonalDuo() {
  const { t, lang } = useLang();
  return (
    <section className="bg-background pt-8 pb-4 sm:pt-10 sm:pb-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {CARDS.map((card, i) => (
            <PromoCard key={card.key} card={card} lang={lang} t={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
