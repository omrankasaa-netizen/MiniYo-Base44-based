import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Truck, CreditCard, Baby } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
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

function MetaTrafficSection() {
  const { t } = useLang();
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const source = (qs.get('utm_source') || '').toLowerCase();
  const medium = (qs.get('utm_medium') || '').toLowerCase();
  const isMetaTraffic = ['meta', 'facebook', 'instagram', 'ig', 'fb'].includes(source) || medium === 'paid_social';

  if (!isMetaTraffic) return null;

  return (
    <section className="bg-card border-y border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-3xl border border-primary/20 bg-primary/[0.05] p-5 sm:p-7">
          <p className="text-[11px] sm:text-xs font-semibold text-primary uppercase tracking-wider mb-2">
            {t('Special offer for parents from Instagram & Facebook', 'عرض خاص للآباء والأمهات القادمين من إنستغرام وفيسبوك')}
          </p>
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-2">
            {t('Shop the exact looks from our ad — ready to order', 'تسوّق نفس الإطلالات من الإعلان — جاهزة للطلب')}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {t('Soft essentials, gift-ready sets, and fast delivery across Lebanon.', 'أساسيات ناعمة، هدايا جاهزة، وتوصيل سريع لكل لبنان.')}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/landing/meta" className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
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
  return (
    <section className="bg-background py-8 sm:py-10 border-b border-border/40" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
            {t('Shop by stage', 'تسوّقي حسب المرحلة')}
          </h2>
          <Link to="/shop" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
            {t('View all', 'عرض الكل')}
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {QUICK_CATEGORY_LINKS.map((item) => (
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
  return (
    <section className="bg-card py-10 sm:py-12 border-y border-border/50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-2 text-center">
          {t('Why Lebanese parents trust MiniYo', 'لماذا يثق أهالي لبنان بـ MiniYo')}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {t('Made for comfort, fast gifting, and stress-free daily wear.', 'مصمم للراحة، للهدايا السريعة، وللاستخدام اليومي بسهولة.')}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {BENEFITS.map(({ icon: Icon, en, ar }) => (
            <div key={en} className="rounded-2xl border border-border bg-background p-4 flex gap-3 items-start">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{lang === 'ar' ? ar : en}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeFaq() {
  const { t } = useLang();
  const faqs = [
    {
      q: t('How fast is delivery in Lebanon?', 'كم تستغرق مدة التوصيل داخل لبنان؟'),
      a: t('Most orders are delivered quickly across Lebanon, and we confirm details with you before dispatch.', 'معظم الطلبات يتم توصيلها بسرعة داخل لبنان، ونؤكد التفاصيل معك قبل الشحن.'),
    },
    {
      q: t('Do you offer Cash on Delivery?', 'هل يتوفر الدفع عند الاستلام؟'),
      a: t('Yes. Cash on Delivery is available where applicable.', 'نعم، الدفع عند الاستلام متاح حسب المنطقة.'),
    },
    {
      q: t('How do I choose the right size?', 'كيف أختار المقاس المناسب؟'),
      a: t('Each product includes size guidance by age/stage, and you can message us on WhatsApp for quick help.', 'كل منتج يتضمن إرشادات مقاسات حسب العمر/المرحلة، ويمكنك مراسلتنا على واتساب للمساعدة السريعة.'),
    },
  ];
  return (
    <section className="bg-background py-10 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-5 text-center">
          {t('Quick answers before you checkout', 'إجابات سريعة قبل إتمام الطلب')}
        </h2>
        <div className="space-y-3">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm sm:text-base font-semibold text-foreground mb-1.5">{f.q}</h3>
              <p className="text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileStickyShopCta() {
  const { t } = useLang();
  return (
    <div className="sm:hidden fixed inset-x-0 bottom-3 z-40 px-4">
      <div className="rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg p-2 flex gap-2">
        <Link to="/shop?sort=new" className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center">
          {t('Shop Now', 'تسوّقي الآن')}
        </Link>
        <Link to="/gifts" className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-semibold inline-flex items-center justify-center text-foreground">
          {t('Gift Sets', 'هدايا جاهزة')}
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col pb-24 sm:pb-0">
      <AnnouncementBar />
      <PromoStripBanner />
      <HeroSection />
      <SaleCampaignBanner />
      <MetaTrafficSection />
      <QuickCategorySection />
      <TrustStrip />
      <PremiumTrustSection />
      <FeaturedCategories />
      <ProductRow
        title="Top Picks"
        titleAr="أفضل الاختيارات"
        filter={{ status: 'Active' }}
        viewAllLink="/shop"
      />
      <ProductRow
        title="New Arrivals"
        titleAr="الوصولات الجديدة"
        filter={{ is_new: true, status: 'Active' }}
        viewAllLink="/shop?sort=new"
      />
      <DualBanners />
      <ProductRow
        title="Loved by parents"
        titleAr="يحبه الأهالي"
        filter={{ is_featured: true, status: 'Active' }}
        viewAllLink="/shop?featured=true"
      />
      <MidPageCta />
      <StoryBlock />
      <GiftingCallout />
      <ReviewsCarousel />
      <HomeFaq />
      <InstagramStrip />
      <NewsletterStrip />
      <FloatingWhatsApp />
      <MobileStickyShopCta />
    </div>
  );
}