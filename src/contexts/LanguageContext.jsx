import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('miniyo-lang') || 'en';
  });

  const isRTL = lang === 'ar';

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    html.setAttribute('lang', lang);
    localStorage.setItem('miniyo-lang', lang);
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