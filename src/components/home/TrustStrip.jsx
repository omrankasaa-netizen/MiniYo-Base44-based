import React from 'react';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { useCmsSection } from '@/hooks/useCmsSection';
import { Truck, CreditCard, Sparkles, MessageCircle } from 'lucide-react';

export default function TrustStrip() {
  const { t } = useLang();
  const { section } = useCmsSection('home_trust_strip');

  function parseTrustItems() {
    try {
      const parsed = section?.body ? JSON.parse(section.body) : null;
      if (Array.isArray(parsed)) {
        return parsed
          .map((it) => ({ en: String(it?.en || ''), ar: String(it?.ar || '') }))
          .filter((it) => it.en || it.ar);
      }
    } catch {
      // Keep resilient fallback below.
    }
    return null;
  }

  const cmsItems = parseTrustItems();
  const defaultItems = [
    { en: 'Cash on Delivery', ar: 'الدفع عند الاستلام' },
    { en: 'Fast delivery across Lebanon', ar: 'توصيل سريع في كل لبنان' },
    { en: 'Soft, safe fabrics', ar: 'أقمشة ناعمة وآمنة' },
    { en: 'WhatsApp support', ar: 'دعم عبر واتساب' },
  ];
  const labels = cmsItems?.length ? cmsItems : defaultItems;
  const iconByIndex = [CreditCard, Truck, Sparkles, MessageCircle];

  if (section && section.is_active === false) return null;

  return (
    <section className="py-6 sm:py-8 bg-card border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {labels.slice(0, 4).map(({ en, ar }, i) => {
            const Icon = iconByIndex[i] || Sparkles;
            return (
            <motion.div
              key={en}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="flex flex-col sm:flex-row items-center gap-2.5 text-center sm:text-start"
            >
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">{t(en, ar)}</span>
            </motion.div>
          )})}
        </div>
      </div>
    </section>
  );
}