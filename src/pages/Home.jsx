import React from 'react';
import AnnouncementBar from '@/components/home/AnnouncementBar';
import HeroSection from '@/components/home/HeroSection';
import TrustStrip from '@/components/home/TrustStrip';
import FeaturedCategories from '@/components/home/FeaturedCategories';
import ProductRow from '@/components/home/ProductRow';
import PromoStripBanner from '@/components/home/PromoStripBanner';
import DualBanners from '@/components/home/DualBanners';
import MidPageCta from '@/components/home/MidPageCta';
import SaleCampaignBanner from '@/components/home/SaleCampaignBanner';
import StoryBlock from '@/components/home/StoryBlock';
import GiftingCallout from '@/components/home/GiftingCallout';
import ReviewsCarousel from '@/components/home/ReviewsCarousel';
import InstagramStrip from '@/components/home/InstagramStrip';
import NewsletterStrip from '@/components/home/NewsletterStrip';
import FloatingWhatsApp from '@/components/home/FloatingWhatsApp';

export default function Home() {
  return (
    <div className="flex flex-col">
      <AnnouncementBar />
      <SaleCampaignBanner />
      <HeroSection />
      <TrustStrip />
      <FeaturedCategories />
      <DualBanners />
      <ProductRow
        title="New Arrivals"
        titleAr="الوصولات الجديدة"
        filter={{ is_new: true, status: 'Active' }}
        viewAllLink="/shop?sort=new"
      />
      <PromoStripBanner />
      <StoryBlock />
      <MidPageCta />
      <ProductRow
        title="Loved by parents"
        titleAr="يحبه الأهالي"
        filter={{ is_featured: true, status: 'Active' }}
        viewAllLink="/shop?featured=true"
      />
      <GiftingCallout />
      <ReviewsCarousel />
      <InstagramStrip />
      <NewsletterStrip />
      <FloatingWhatsApp />
    </div>
  );
}