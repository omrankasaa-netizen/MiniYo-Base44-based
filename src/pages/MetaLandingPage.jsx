import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Truck, CreditCard, Gift } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useCmsSection } from '@/hooks/useCmsSection';
import AnnouncementBar from '@/components/home/AnnouncementBar';
import ProductRow from '@/components/home/ProductRow';
import ReviewsCarousel from '@/components/home/ReviewsCarousel';
import FloatingWhatsApp from '@/components/home/FloatingWhatsApp';

const TRUST_POINTS = [
  { icon: Truck, en: 'Delivery across Lebanon', ar: 'توصيل إلى كل لبنان' },
  { icon: CreditCard, en: 'Cash on Delivery', ar: 'الدفع عند الاستلام' },
  { icon: ShieldCheck, en: 'Parent-trusted quality', ar: 'جودة موثوقة من الأهل' },
  { icon: Gift, en: 'Gift-ready options', ar: 'خيارات جاهزة للهدايا' },
];

export default function MetaLandingPage() {
  const { t, lang } = useLang();
  const { section } = useCmsSection('home_meta_traffic');
  const { section: trustPointsSection } = useCmsSection('home_meta_trust_points');
  const title = (lang === 'ar' ? (section?.title_ar || section?.title) : section?.title)
    || t('Soft premium looks for babies & kids — ready to shop now', 'إطلالات ناعمة وفاخرة للبيبي والأطفال — جاهزة للتسوّق الآن');
  const body = (lang === 'ar' ? (section?.body_ar || section?.body) : section?.body)
    || t('You clicked from our ad. Here are the exact collections parents in Lebanon love most.', 'وصلتِ من إعلاننا. هذه هي نفس المجموعات التي يحبّها الأهالي في لبنان.');
  const primaryLink = section?.link_url || '/shop?sort=new';
  let trustPoints = TRUST_POINTS;
  try {
    const parsed = trustPointsSection?.body ? JSON.parse(trustPointsSection.body) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      trustPoints = parsed
        .map((item) => ({ en: String(item?.en || ''), ar: String(item?.ar || item?.en || ''), icon: null }))
        .filter((item) => item.en || item.ar);
    }
  } catch {
    // Fall back to default trust points.
  }

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-0" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <AnnouncementBar />

      <section className="border-b border-border/50 bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary mb-2">
            {t('MiniYo × Instagram/Facebook', 'MiniYo × إنستغرام/فيسبوك')}
          </p>
          <h1 className="text-3xl sm:text-5xl font-heading font-bold text-foreground leading-tight max-w-3xl mb-3">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mb-6">
            {body}
          </p>
          <div className="flex flex-wrap gap-2.5 mb-6">
            <Link to={primaryLink} className="min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center">
              {t('Shop Now', 'تسوّقي الآن')}
            </Link>
            <Link to="/gifts" className="min-h-[44px] px-6 rounded-full border border-border text-sm font-semibold inline-flex items-center justify-center text-foreground">
              {t('Gift Sets', 'هدايا جاهزة')}
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {trustPoints.map(({ icon: Icon, en, ar }, idx) => (
              <div key={`${en || ar || 'trust'}-${idx}`} className="rounded-2xl border border-border bg-background p-3.5 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {(Icon || TRUST_POINTS[idx % TRUST_POINTS.length].icon) ? React.createElement(Icon || TRUST_POINTS[idx % TRUST_POINTS.length].icon, { className: 'w-4 h-4' }) : null}
                </span>
                <span className="text-xs sm:text-sm font-medium text-foreground">{lang === 'ar' ? ar : en}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProductRow
        title="Top picks right now"
        titleAr="أفضل الاختيارات الآن"
        filter={{ status: 'Active' }}
        viewAllLink="/shop"
      />
      <ProductRow
        title="Bestsellers from our ads"
        titleAr="الأكثر مبيعاً من الإعلانات"
        filter={{ is_featured: true, status: 'Active' }}
        viewAllLink="/shop?featured=true"
      />
      <ProductRow
        title="New arrivals this week"
        titleAr="وصولات هذا الأسبوع"
        filter={{ is_new: true, status: 'Active' }}
        viewAllLink="/shop?sort=new"
      />
      <ReviewsCarousel />
      <FloatingWhatsApp />

      <div className="sm:hidden fixed inset-x-0 bottom-3 z-40 px-4">
        <Link
          to="/shop?featured=true"
          className="w-full min-h-[48px] rounded-2xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center shadow-lg"
        >
          {t('Shop the Ad Collection', 'تسوّقي مجموعة الإعلان')}
        </Link>
      </div>
    </div>
  );
}
