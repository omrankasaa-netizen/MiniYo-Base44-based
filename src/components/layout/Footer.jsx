import React from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { Heart, Lock, MessageCircle, Instagram, Facebook } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { trackContact } from '@/lib/metaPixel';
import { ttContact } from '@/lib/tiktokPixel';

export default function Footer() {
  const { t, lang } = useLang();
  const settings = useSiteSettings();

  return (
    <footer className="bg-primary text-primary-foreground mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid sm:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <p className="font-heading font-bold text-lg">MiniYo</p>
            <p className="text-xs opacity-75 leading-relaxed">
              {t("Soft, thoughtful clothing for Lebanon's little ones.", 'ملابس ناعمة ومدروسة لصغار لبنان.')}
            </p>
            <div className="flex gap-3 mt-1">
              {settings.whatsappNumber && (
                <a href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g,'')}`} target="_blank" rel="noopener"
                  aria-label={t('Chat with us on WhatsApp', 'تواصل معنا عبر واتساب')}
                  onClick={() => { trackContact('WhatsApp'); ttContact('WhatsApp'); }}
                  className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              {settings.instagramUrl && (
                <a href={settings.instagramUrl} target="_blank" rel="noopener"
                  aria-label={t('MiniYo on Instagram', 'ميني يو على إنستغرام')}
                  className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {settings.facebookUrl && (
                <a href={settings.facebookUrl} target="_blank" rel="noopener"
                  aria-label={t('MiniYo on Facebook', 'ميني يو على فيسبوك')}
                  className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                  <Facebook className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
          {/* Links */}
          <div>
            <p className="font-semibold text-sm mb-3 opacity-90">{t('Shop', 'المتجر')}</p>
            <div className="flex flex-col gap-2">
              <Link to="/shop" className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('All Products', 'جميع المنتجات')}</Link>
              <Link to="/shop?gender=Girls" className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Girls', 'بنات')}</Link>
              <Link to="/shop?gender=Boys" className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Boys', 'أولاد')}</Link>
              <Link to="/shop?gender=Unisex" className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Unisex', 'للجنسين')}</Link>
            </div>
          </div>
          {/* Support */}
          <div>
            <p className="font-semibold text-sm mb-3 opacity-90">{t('Support', 'الدعم')}</p>
            <div className="flex flex-col gap-2">
              {settings.whatsappNumber && (
                <a href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g,'')}`} target="_blank" rel="noopener"
                  onClick={() => { trackContact('WhatsApp'); ttContact('WhatsApp'); }}
                  className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">
                  {t('WhatsApp Us', 'تواصل عبر واتساب')}
                </a>
              )}
              <Link to="/track" className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Track Your Order', 'تتبع طلبك')}</Link>
              <span className="text-xs opacity-70">{t('Cash on Delivery', 'الدفع عند الاستلام')}</span>
              <span className="text-xs opacity-70">{t('Delivery across Lebanon', 'توصيل في كل لبنان')}</span>
            </div>
          </div>

          {/* Info */}
          <div>
            <p className="font-semibold text-sm mb-3 opacity-90">{t('Info', 'معلومات')}</p>
            <div className="flex flex-col gap-2">
              <Link to="/about"          className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Our Story', 'قصتنا')}</Link>
              <Link to="/faq"            className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('FAQs', 'الأسئلة الشائعة')}</Link>
              <Link to="/legal/contact"  className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Contact Us', 'تواصل معنا')}</Link>
              <Link to="/legal/shipping" className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Shipping Policy', 'سياسة الشحن')}</Link>
              <Link to="/legal/returns"  className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Returns & Exchanges', 'الإرجاع والاستبدال')}</Link>
              <Link to="/legal/privacy"  className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Privacy Policy', 'سياسة الخصوصية')}</Link>
              <Link to="/legal/terms"    className="inline-block py-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity">{t('Terms', 'الشروط والأحكام')}</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs opacity-60">© {new Date().getFullYear()} MiniYo. {t('All rights reserved.', 'جميع الحقوق محفوظة.')}</p>
          <p className="text-xs opacity-60 flex items-center gap-1">
            {t('Made with', 'صنع بـ')} <Heart className="w-3 h-3 text-blush fill-blush" /> {t("for Lebanon's little ones", 'لصغار لبنان')}
          </p>
          <Link to="/admin/login" className="opacity-20 hover:opacity-60 transition-opacity" title="Staff access">
            <Lock className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </footer>
  );
}