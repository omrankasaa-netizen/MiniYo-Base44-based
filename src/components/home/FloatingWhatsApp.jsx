import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { MessageCircle, X } from 'lucide-react';

export default function FloatingWhatsApp() {
  const { t } = useLang();
  const settings = useSiteSettings();
  const [show, setShow] = useState(true);

  if (!settings.whatsappNumber) return null;

  const waLink = `https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(t('Hi MiniYo! I need help.', 'أهلاً ميني يو! أحتاج مساعدة.'))}`;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            className="bg-card border border-border rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 max-w-[220px]"
          >
            <p className="text-xs text-muted-foreground leading-tight flex-1">{t('Need help? Chat with us!', 'تحتاج مساعدة؟ راسلنا!')}</p>
            <button onClick={() => setShow(false)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.a
        href={waLink}
        target="_blank"
        rel="noopener"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="w-14 h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-shadow"
        aria-label="WhatsApp"
      >
        <MessageCircle className="w-7 h-7 fill-white" />
      </motion.a>
    </div>
  );
}