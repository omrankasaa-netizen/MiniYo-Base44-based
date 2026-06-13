import React, { createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { getBestDiscount, applyDiscountToPrice, isDiscountLive, isCampaignLive } from '@/lib/discounts';

const DiscountContext = createContext({});

export function DiscountProvider({ children }) {
  const { data: discounts = [] } = useQuery({
    queryKey: ['active-discounts'],
    queryFn: () => base44.entities.Discount.filter({ is_active: true }, '-created_date', 100),
    staleTime: 60_000,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['active-campaigns'],
    queryFn: () => base44.entities.Campaign.filter({ is_active: true }, '-starts_at', 50),
    staleTime: 60_000,
  });

  const liveDiscounts = discounts.filter(isDiscountLive);
  const liveCampaigns = campaigns.filter(isCampaignLive);

  function getProductDiscount(product) {
    return getBestDiscount(liveDiscounts, product);
  }

  function getDiscountedPrice(product) {
    const d = getProductDiscount(product);
    if (!d) return product.price_usd;
    return applyDiscountToPrice(d, product.price_usd);
  }

  function getCampaignForPlacement(placement) {
    return liveCampaigns.find(c => c.placement === placement) || null;
  }

  return (
    <DiscountContext.Provider value={{ liveDiscounts, liveCampaigns, getProductDiscount, getDiscountedPrice, getCampaignForPlacement }}>
      {children}
    </DiscountContext.Provider>
  );
}

export function useDiscounts() {
  return useContext(DiscountContext);
}