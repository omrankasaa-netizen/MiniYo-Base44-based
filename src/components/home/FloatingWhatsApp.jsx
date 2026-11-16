import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { trackContact } from '@/lib/metaPixel';
import { ttContact } from '@/lib/tiktokPixel';
import { MessageCircle, X } from 'lucide-react';

// `aboveStickyBar`: the page has a fixed bottom bar on phones (e.g. "Shop Now /
// Gift Sets"), so lift the button above it instead of covering its buttons.
export default function FloatingWhatsApp({ aboveStickyBar = false }) {
  const { t } = useLang();
  const settings = useSiteSettings();
  const [show, setShow] = useState(true);

  if (!settings.whatsappNumber) return null;

  const waLink = `https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(t('Hi MiniYo! I need help.', 'أهلاً ميني يو! أحتاج مساعدة.'))}`;

  return (
    <div className={`fixed right-3 sm:right-5 z-50 flex flex-col items-end gap-2 ${aboveStickyBar ? 'bottom-[5.5rem] sm:bottom-5' : 'bottom-5'}`}>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            className="hidden sm:flex bg-card border border-border rounded-2xl shadow-lg px-4 py-3 items-center gap-3 max-w-[220px]"
          >
            <p className="text-xs text-muted-foreground leading-tight flex-1">{t('Need help? Chat with us!', 'تحتاج مساعدة؟ راسلنا!')}</p>
            <button onClick={() => setShow(false)} aria-label={t('Dismiss chat prompt', 'إغلاق رسالة المحادثة')} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.a
        href={waLink}
        target="_blank"
        rel="noopener"
        onClick={() => { trackContact('WhatsApp'); ttContact('WhatsApp'); }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 sm:w-14 sm:h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-shadow"
        aria-label="WhatsApp"
      >
        <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 fill-white" />
      </motion.a>
    </div>
  );
}