import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Mail, Check } from 'lucide-react';

export default function NewsletterStrip() {
  const { t, lang } = useLang();
  const settings = useSiteSettings();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_newsletter'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_newsletter' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  const heading = (section && (lang === 'ar' ? (section.title_ar || section.title) : section.title)) || t('Join the MiniYo family', 'انضم إلى عائلة ميني يو');
  const subtext = (section && (lang === 'ar' ? (section.body_ar || section.body) : section.body)) || t('Get new arrivals & exclusive offers. No spam, ever — we promise 🤍', 'احصل على الوصولات الجديدة والعروض الحصرية. بدون رسائل مزعجة أبدًا، وعدنا 🤍');

  function handleSubscribe(e) {
    e.preventDefault();
    if (!email) return;
    // Placeholder — wire to email backend when ready
    setSubscribed(true);
    setEmail('');
  }

  const waLink = settings.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(t('Hi MiniYo! I want to know about new arrivals.', 'أهلاً ميني يو! أريد معرفة المنتجات الجديدة.'))}`
    : null;

  if (section && section.is_active === false) return null;

  return (
    <section className="py-14 sm:py-20 bg-primary/5 border-y border-border/40" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mb-3">
            {heading}
          </h2>
          <p className="text-muted-foreground text-sm mb-7">
            {subtext}
          </p>

          {subscribed ? (
            <div className="flex items-center justify-center gap-2 text-primary font-semibold py-3">
              <Check className="w-5 h-5" />
              {t("You're in! We'll keep you posted 🤍", 'تم التسجيل! سنبقيك على علم 🤍')}
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex gap-2 max-w-md mx-auto mb-5">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('Your email address', 'بريدك الإلكتروني')}
                className="flex-1 px-4 py-3 rounded-full border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
                required
              />
              <button type="submit"
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-3 rounded-full font-semibold text-sm whitespace-nowrap hover:bg-primary/90 transition-colors shadow-sm">
                <Mail className="w-4 h-4" />
                {t('Subscribe', 'اشترك')}
              </button>
            </form>
          )}

          {waLink && (
            <a href={waLink} target="_blank" rel="noopener"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-full font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm">
              <MessageCircle className="w-4 h-4" />
              {t('Chat on WhatsApp', 'تحدث على واتساب')}
            </a>
          )}
        </motion.div>
      </div>
    </section>
  );
}