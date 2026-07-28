import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, Truck, CreditCard, Baby } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useCmsSection } from '@/hooks/useCmsSection';
import AnnouncementBar from '@/components/home/AnnouncementBar';
import HeroSection from '@/components/home/HeroSection';
import TrustStrip from '@/components/home/TrustStrip';
import FeaturedCategories from '@/components/home/FeaturedCategories';
import ProductRow from '@/components/home/ProductRow';
import PromoStripBanner from '@/components/home/PromoStripBanner';
import DualBanners from '@/components/home/DualBanners';
import GiftingCallout from '@/components/home/GiftingCallout';
import MidPageCta from '@/components/home/MidPageCta';
import SaleCampaignBanner from '@/components/home/SaleCampaignBanner';
import StoryBlock from '@/components/home/StoryBlock';
import ReviewsCarousel from '@/components/home/ReviewsCarousel';
import InstagramStrip from '@/components/home/InstagramStrip';
import NewsletterStrip from '@/components/home/NewsletterStrip';
import FloatingWhatsApp from '@/components/home/FloatingWhatsApp';

const QUICK_CATEGORY_LINKS = [
  { key: 'newborn', en: 'Newborn', ar: 'حديثو الولادة', to: '/shop?age=Newborn' },
  { key: 'baby-girl', en: 'Baby Girl', ar: 'بنات بيبي', to: '/shop?gender=Girls&age=Baby' },
  { key: 'baby-boy', en: 'Baby Boy', ar: 'أولاد بيبي', to: '/shop?gender=Boys&age=Baby' },
  { key: 'toddler', en: 'Toddler', ar: 'تودلر', to: '/shop?age=Toddler' },
  { key: 'gift-sets', en: 'Gift Sets', ar: 'هدايا جاهزة', to: '/gifts' },
  { key: 'new-arrivals', en: 'New Arrivals', ar: 'وصولات جديدة', to: '/shop?sort=new' },
];

const BENEFITS = [
  { icon: Truck, en: 'Delivery across Lebanon', ar: 'توصيل لكل لبنان' },
  { icon: CreditCard, en: 'Cash on Delivery', ar: 'الدفع عند الاستلام' },
  { icon: ShieldCheck, en: 'Trusted by Lebanese parents', ar: 'موثوق من أهالي لبنان' },
  { icon: Baby, en: 'Soft premium fabrics for daily comfort', ar: 'أقمشة ناعمة ومريحة يومياً' },
];

function parseListJson(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function MetaTrafficSection() {
  const { t } = useLang();
  const { section } = useCmsSection('home_meta_traffic');
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const source = (qs.get('utm_source') || '').toLowerCase();
  const medium = (qs.get('utm_medium') || '').toLowerCase();
  const isMetaTraffic = ['meta', 'facebook', 'instagram', 'ig', 'fb'].includes(source) || medium === 'paid_social';

  if (!isMetaTraffic) return null;
  if (section && section.is_active === false) return null;

  const heading = (section?.title || '').trim() || t('Shop the exact looks from our ad — ready to order', 'تسوّق نفس الإطلالات من الإعلان — جاهزة للطلب');
  const body = (section?.body || '').trim() || t('Soft essentials, gift-ready sets, and fast delivery across Lebanon.', 'أساسيات ناعمة، هدايا جاهزة، وتوصيل سريع لكل لبنان.');
  const headingAr = (section?.title_ar || '').trim() || t('Shop the exact looks from our ad — ready to order', 'تسوّق نفس الإطلالات من الإعلان — جاهزة للطلب');
  const bodyAr = (section?.body_ar || '').trim() || t('Soft essentials, gift-ready sets, and fast delivery across Lebanon.', 'أساسيات ناعمة، هدايا جاهزة، وتوصيل سريع لكل لبنان.');
  const ctaPrimary = section?.link_url || '/landing/meta';

  return (
    <section className="bg-card border-y border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-3xl border border-primary/20 bg-primary/[0.05] p-5 sm:p-7">
          <p className="text-[11px] sm:text-xs font-semibold text-primary uppercase tracking-wider mb-2">
            {t('Special offer for parents from Instagram & Facebook', 'عرض خاص للآباء والأمهات القادمين من إنستغرام وفيسبوك')}
          </p>
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-2">
            {t(heading, headingAr)}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {t(body, bodyAr)}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link to={ctaPrimary} className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              {t('Shop Ad Collection', 'تسوّق مجموعة الإعلان')}
            </Link>
            <Link to="/shop?sort=new" className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors">
              {t('See New Arrivals', 'شاهد الوصولات الجديدة')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickCategorySection() {
  const { t, lang } = useLang();
  const { section } = useCmsSection('home_quick_shop');
  if (section && section.is_active === false) return null;

  const cmsLinks = parseListJson(section?.body);
  const links = (cmsLinks || QUICK_CATEGORY_LINKS)
    .map((item, idx) => {
      if (cmsLinks) {
        return {
          key: String(item?.key || item?.to || idx),
          en: String(item?.en || item?.label || ''),
          ar: String(item?.ar || item?.label_ar || item?.en || ''),
          to: String(item?.to || '/shop'),
        };
      }
      return item;
    })
    .filter((item) => item.en && item.to);
  const heading = (section?.title || '').trim() || 'Shop by stage';
  const headingAr = (section?.title_ar || '').trim() || 'تسوّقي حسب المرحلة';
  const viewAll = section?.link_url || '/shop';

  return (
    <section className="bg-background py-8 sm:py-10 border-b border-border/40" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
            {t(heading, headingAr)}
          </h2>
          <Link to={viewAll} className="text-sm font-semibold text-primary hover:underline underline-offset-4">
            {t('View all', 'عرض الكل')}
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {links.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className="min-h-[50px] px-3 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-center flex items-center justify-center"
            >
              <span className="text-xs sm:text-sm font-semibold text-foreground">{lang === 'ar' ? item.ar : item.en}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function PremiumTrustSection() {
  const { t, lang } = useLang();
  const { section } = useCmsSection('home_premium_trust');
  const { section: trustItemsSection } = useCmsSection('home_premium_trust_items');
  if (section && section.is_active === false) return null;
  const heading = (section?.title || '').trim() || 'Why Lebanese parents trust MiniYo';
  const headingAr = (section?.title_ar || '').trim() || 'لماذا يثق أهالي لبنان بـ MiniYo';
  const subtext = (section?.body || '').trim() || 'Made for comfort, fast gifting, and stress-free daily wear.';
  const subtextAr = (section?.body_ar || '').trim() || 'مصمم للراحة، للهدايا السريعة، وللاستخدام اليومي بسهولة.';
  const cmsBenefits = (parseListJson(trustItemsSection?.body) || [])
    .map((item) => ({ en: String(item?.en || ''), ar: String(item?.ar || item?.en || '') }))
    .filter((item) => item.en || item.ar);
  const benefits = cmsBenefits.length > 0 ? cmsBenefits : BENEFITS;

  return (
    <section className="bg-card py-10 sm:py-12 border-y border-border/50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-2 text-center">
          {t(heading, headingAr)}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {t(subtext, subtextAr)}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {benefits.map(({ icon: Icon = Baby, en, ar }, idx) => (
            <div key={`${en || ar || 'benefit'}-${idx}`} className="rounded-2xl border border-border bg-background p-4 flex gap-3 items-start">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{lang === 'ar' ? (ar || en || `${idx + 1}`) : (en || ar || `${idx + 1}`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeFaq() {
  const { t, lang } = useLang();
  const { section } = useCmsSection('home_faq');
  const { data: faqs = [] } = useQuery({
    queryKey: ['home-faqs'],
    queryFn: () => base44.entities.Faq.filter({ is_active: true }, 'sort_order', 6),
    staleTime: 60_000,
  });
  const heading = (section && (lang === 'ar' ? (section.title_ar || section.title) : section.title))
    || t('Quick answers before you checkout', 'إجابات سريعة قبل إتمام الطلب');

  if (section && section.is_active === false) return null;

  const rows = faqs.length > 0 ? faqs : [
    {
      question: t('How fast is delivery in Lebanon?', 'كم تستغرق مدة التوصيل داخل لبنان؟'),
      answer: t('Most orders are delivered quickly across Lebanon, and we confirm details with you before dispatch.', 'معظم الطلبات يتم توصيلها بسرعة داخل لبنان، ونؤكد التفاصيل معك قبل الشحن.'),
      question_ar: t('How fast is delivery in Lebanon?', 'كم تستغرق مدة التوصيل داخل لبنان؟'),
      answer_ar: t('Most orders are delivered quickly across Lebanon, and we confirm details with you before dispatch.', 'معظم الطلبات يتم توصيلها بسرعة داخل لبنان، ونؤكد التفاصيل معك قبل الشحن.'),
    },
  ];
  return (
    <section className="bg-background py-10 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-5 text-center">
          {heading}
        </h2>
        <div className="space-y-3">
          {rows.map((f, idx) => (
            <div key={f.id || idx} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm sm:text-base font-semibold text-foreground mb-1.5">{lang === 'ar' ? (f.question_ar || f.question) : f.question}</h3>
              <p className="text-sm text-muted-foreground">{lang === 'ar' ? (f.answer_ar || f.answer) : f.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileStickyShopCta() {
  const { t, lang } = useLang();
  const { section } = useCmsSection('home_sticky_cta');
  if (section && section.is_active === false) return null;
  const primaryLabel = (lang === 'ar' ? (section?.title_ar || section?.title) : section?.title) || t('Shop Now', 'تسوّقي الآن');
  const secondaryLabel = (lang === 'ar' ? (section?.body_ar || section?.body) : section?.body) || t('Gift Sets', 'هدايا جاهزة');
  const primaryLink = section?.link_url || '/shop?sort=new';
  const secondaryLink = '/gifts';
  return (
    <div className="sm:hidden fixed inset-x-0 bottom-3 z-40 px-4">
      <div className="rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg p-2 flex gap-2">
        <Link to={primaryLink} className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center">
          {primaryLabel}
        </Link>
        <Link to={secondaryLink} className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-semibold inline-flex items-center justify-center text-foreground">
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const { section: featuredProductsSection } = useCmsSection('featured_products');
  const featuredProductIds = React.useMemo(() => {
    const parsed = parseListJson(featuredProductsSection?.body);
    return (parsed || []).map((id) => String(id)).filter(Boolean);
  }, [featuredProductsSection?.body]);

  return (
    <div className="flex flex-col pb-24 sm:pb-0">
      <AnnouncementBar />
      <HeroSection />
      <TrustStrip />
      <ProductRow
        title="Bestsellers"
        titleAr="الأكثر مبيعاً"
        filter={{ is_featured: true, status: 'Active' }}
        viewAllLink="/shop?featured=true"
        productIds={featuredProductIds}
      />
      <SaleCampaignBanner />
      <ProductRow
        title="New Arrivals"
        titleAr="الوصولات الجديدة"
        filter={{ is_new: true, status: 'Active' }}
        viewAllLink="/shop?sort=new"
      />
      <FeaturedCategories />
      <ReviewsCarousel />
      <HomeFaq />
      <InstagramStrip />
      <NewsletterStrip />
      <FloatingWhatsApp />
      <MobileStickyShopCta />
    </div>
  );
}