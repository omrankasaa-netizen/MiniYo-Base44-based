import React, { createContext, useContext, useState, useEffect } from 'react';
import { safeLocalStorage } from '@/lib/safeStorage';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  // Runs during render — must never throw (FB/IG in-app WebView can throw on
  // storage access), so it goes through the safe helper.
  const [lang, setLang] = useState(() => {
    return safeLocalStorage.getItem('miniyo-lang') || 'en';
  });

  const isRTL = lang === 'ar';

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    html.setAttribute('lang', lang);
    safeLocalStorage.setItem('miniyo-lang', lang);
  }, [lang, isRTL]);

  const toggleLang = () => setLang(prev => (prev === 'en' ? 'ar' : 'en'));

  // Helper: pick the right value based on current lang
  const t = (en, ar) => (lang === 'ar' ? ar : en);

  return (
    <LanguageContext.Provider value={{ lang, isRTL, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be inside LanguageProvider');
  return ctx;
}