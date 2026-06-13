import React, { useState } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSiteSettings } from '@/hooks/useSiteSettings';

const CATEGORY_ORDER = ['Orders', 'Shipping & Delivery', 'Payment', 'Returns & Exchanges', 'Products & Sizing', 'Account'];

function FaqItem({ faq, lang }) {
  const [open, setOpen] = useState(false);
  const question = lang === 'ar' ? (faq.question_ar || faq.question) : faq.question;
  const answer   = lang === 'ar' ? (faq.answer_ar   || faq.answer)   : faq.answer;

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/50 transition-colors"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <span className="font-medium text-foreground text-sm leading-snug">{question}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqPage() {
  const { lang, t } = useLang();
  const settings = useSiteSettings();

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ['faqs-public'],
    queryFn: () => base44.entities.Faq.filter({ is_active: true }, 'sort_order', 100),
    staleTime: 60_000,
  });

  // Group by category, respecting CATEGORY_ORDER
  const grouped = {};
  for (const faq of faqs) {
    const cat = faq.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(faq);
  }
  const orderedKeys = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  const categoryLabels = {
    'Orders':             t('Orders', 'الطلبات'),
    'Shipping & Delivery':t('Shipping & Delivery', 'الشحن والتوصيل'),
    'Payment':            t('Payment', 'الدفع'),
    'Returns & Exchanges':t('Returns & Exchanges', 'الإرجاع والاستبدال'),
    'Products & Sizing':  t('Products & Sizing', 'المنتجات والمقاسات'),
    'Account':            t('Account', 'الحساب'),
  };

  return (
    <div className="min-h-screen bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          {t('Back to Home', 'العودة للرئيسية')}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold text-foreground mb-2">
            {t('Frequently Asked Questions', 'الأسئلة الشائعة')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("Can't find your answer? We're always here to help.", 'لا تجد إجابتك؟ نحن هنا دائمًا للمساعدة.')}
          </p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && (
          <div className="space-y-8">
            {orderedKeys.map(cat => (
              <div key={cat}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
                  {categoryLabels[cat] || cat}
                </h2>
                <div className="space-y-2">
                  {grouped[cat].map(faq => (
                    <FaqItem key={faq.id} faq={faq} lang={lang} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 bg-primary/5 border border-primary/20 rounded-3xl p-6 text-center">
          <p className="font-heading font-semibold text-foreground mb-1">
            {t('Still have a question?', 'لا يزال لديك سؤال؟')}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {t("We're happy to help — just send us a message.", 'يسعدنا المساعدة — فقط أرسل لنا رسالة.')}
          </p>
          {settings.whatsappNumber && (
            <a
              href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              {t('Chat on WhatsApp', 'تحدّث معنا على واتساب')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}