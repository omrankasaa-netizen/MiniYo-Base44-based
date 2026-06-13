import React from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

export default function AboutPage() {
  const { lang, t } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'page_about'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'page_about' }, 'sort_order', 1),
    staleTime: 60_000,
  });

  const section = sections[0];
  const content = section
    ? (lang === 'ar' ? (section.body_ar || section.body) : section.body)
    : null;

  return (
    <div className="min-h-screen bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Hero band */}
      <div className="bg-primary text-primary-foreground py-16 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/15 rounded-3xl mb-5">
            <Heart className="w-7 h-7 fill-white/60 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-3">
            {t('Our Story', 'قصتنا')}
          </h1>
          <p className="text-primary-foreground/70 text-sm max-w-md mx-auto">
            {t(
              'A small family, a big dream, and a lot of love — from Tripoli, for Lebanon\'s little ones.',
              'عائلة صغيرة، حلم كبير، وكثير من المحبة — من طرابلس، لصغار لبنان.'
            )}
          </p>
        </motion.div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          {t('Back to Home', 'العودة للرئيسية')}
        </Link>

        {content ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="prose prose-sm max-w-none text-foreground
              prose-headings:font-heading prose-headings:text-foreground
              prose-p:text-muted-foreground prose-li:text-muted-foreground
              prose-strong:text-foreground prose-hr:border-border
              prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground"
          >
            <ReactMarkdown>{content}</ReactMarkdown>
          </motion.div>
        ) : (
          /* Fallback hard-coded story (EN) */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-6 text-muted-foreground text-sm leading-relaxed"
          >
            <p>
              MiniYo was born out of one of the hardest chapters of our lives — and somehow became
              the most meaningful thing we've ever built.
            </p>
            <p>
              We're a small family from Tripoli. Like so many people across Lebanon, the events of the
              past few years hit us harder than we ever expected. We lost our jobs. The stability we'd
              worked toward disappeared almost overnight.
            </p>
            <p>
              We were left with two young children, a lot of uncertainty — and a choice: let it break us,
              or build something new.
            </p>
            <hr className="border-border" />
            <h2 className="text-lg font-heading font-bold text-foreground">Why Clothes?</h2>
            <p>
              As parents of two little ones, we kept searching for baby clothes that were soft enough,
              affordable enough, and actually beautiful — and kept coming up short. Parents in Lebanon
              deserve better. So we decided to create it ourselves.
            </p>
            <hr className="border-border" />
            <h2 className="text-lg font-heading font-bold text-foreground">What MiniYo Means</h2>
            <p>
              <strong>MiniYo</strong> started as a nickname for our youngest — our little <em>mini me</em>.
              It stuck. And it felt right for a brand built around one idea: children bring joy, and they
              deserve to wear it too.
            </p>
            <hr className="border-border" />
            <p className="text-foreground font-medium">
              Thank you for being part of our story. 🤍
            </p>
            <p className="text-xs text-muted-foreground">— The MiniYo Family</p>
          </motion.div>
        )}

        {/* CTA */}
        <div className="mt-12 flex flex-col sm:flex-row gap-3">
          <Link to="/shop"
            className="flex-1 text-center py-3 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
            {t('Shop Now', 'تسوق الآن')}
          </Link>
          <Link to="/legal/contact"
            className="flex-1 text-center py-3 border border-border rounded-full text-sm font-medium text-foreground hover:bg-muted transition-colors">
            {t('Contact Us', 'تواصل معنا')}
          </Link>
        </div>
      </div>
    </div>
  );
}