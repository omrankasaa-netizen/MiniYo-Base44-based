import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { pickLatestByKey } from '@/lib/entityRecords';

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useSiteSettings() {
  const { data: settings = [] } = useQuery({
    queryKey: ['site-settings-public'],
    queryFn: () => base44.entities.SiteSetting.list('setting_key', 500),
    staleTime: 5 * 60_000,
  });

  const latestByKey = pickLatestByKey(settings, 'setting_key');
  const map = {};
  for (const [key, setting] of Object.entries(latestByKey)) map[key] = setting.setting_value;

  return {
    storeName: map.store_name || 'MiniYo',
    currency: map.currency || 'USD',
    whatsappNumber: map.whatsapp_number || '',
    instagramUrl: map.instagram_url || '',
    facebookUrl: map.facebook_url || '',
    deliveryFeeInside: parseNumber(map.delivery_fee_inside, 3),
    deliveryFeeOutside: parseNumber(map.delivery_fee_outside, 5),
    freeShippingThreshold: parseNumber(map.free_shipping_threshold, 50),
    defaultLanguage: map.default_language || 'en',
    paymentCodEnabled: map.payment_cod_enabled !== 'false',
    paymentWhishEnabled: map.payment_whish_enabled !== 'false',
    paymentCardEnabled: map.payment_card_enabled === 'true',
  };
}