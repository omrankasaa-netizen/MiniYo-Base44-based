import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { getConsentChoice, grantConsent, denyConsent, applyStoredConsent } from '@/lib/pixel';

// Bottom-anchored, RTL-aware cookie-consent banner. Shown only on first visit
// (no stored choice). Gates the Meta Pixel via Consent Mode: Accept grants,
// Decline keeps the default revoked state set in index.html. The choice is
// persisted in localStorage 'miniyo-consent' so the banner does not reappear.
export default function ConsentBanner() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Re-grant the Pixel on load when the visitor accepted previously; show the
    // banner only when no choice has been made yet.
    applyStoredConsent();
    setVisible(getConsentChoice() === null);
  }, []);

  if (!visible) return null;

  function accept() {
    grantConsent();
    setVisible(false);
  }

  function decline() {
    denyConsent();
    setVisible(false);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
      role="dialog"
      aria-live="polite"
      aria-label={t('Cookie consent', 'الموافقة على ملفات تعريف الارتباط')}
    >
      <div className="max-w-3xl mx-auto bg-card border border-border shadow-lg rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed flex-1">
          {t(
            'We use cookies to improve your experience and measure our ads.',
            'نستخدم ملفات تعريف الارتباط لتحسين تجربتك وقياس فعالية إعلاناتنا.'
          )}{' '}
          <Link
            to="/legal/privacy"
            className="text-primary font-medium underline underline-offset-2 whitespace-nowrap"
          >
            {t('Privacy Policy', 'سياسة الخصوصية')}
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="min-h-[44px] px-4 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            {t('Decline', 'رفض')}
          </button>
          <button
            onClick={accept}
            className="min-h-[44px] px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {t('Accept', 'قبول')}
          </button>
        </div>
      </div>
    </div>
  );
}
