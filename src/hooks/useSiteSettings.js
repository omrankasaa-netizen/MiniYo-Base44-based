import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useSiteSettings() {
  const { data: settings = [] } = useQuery({
    queryKey: ['site-settings-public'],
    queryFn: () => base44.entities.SiteSetting.list('setting_key', 100),
    staleTime: 5 * 60_000,
  });

  const map = {};
  for (const s of settings) map[s.setting_key] = s.setting_value;

  return {
    storeName: map.store_name || 'MiniYo',
    currency: map.currency || 'USD',
    whatsappNumber: map.whatsapp_number || '',
    instagramUrl: map.instagram_url || '',
    facebookUrl: map.facebook_url || '',
    deliveryFeeInside: parseFloat(map.delivery_fee_inside || '3'),
    deliveryFeeOutside: parseFloat(map.delivery_fee_outside || '5'),
    freeShippingThreshold: parseFloat(map.free_shipping_threshold || '50'),
    defaultLanguage: map.default_language || 'en',
    paymentCodEnabled: map.payment_cod_enabled !== 'false',
    paymentWhishEnabled: map.payment_whish_enabled !== 'false',
    paymentCardEnabled: map.payment_card_enabled === 'true',
  };
}