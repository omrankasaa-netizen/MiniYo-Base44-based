import React, { useState, useEffect } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Heart, User, Menu, X, Search } from 'lucide-react';
import { useCustomerTier } from '@/hooks/useCustomerTier';

const LOGO_URL = '/miniyo-logo.png';

export default function Header() {
  const { lang, toggleLang, t } = useLang();
  const { totalQty: count, setIsOpen } = useCart();
  const { currentUser } = useAuthUser();
  const { customer } = useCustomerTier(currentUser?.email);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      setHidden(y > lastY && y > 88);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
  { to: '/shop?sort=new', label: t('New Arrivals', 'الوصولات الجديدة') },
  { to: '/shop', label: t('Shop', 'المتجر') },
  { to: '/gifts', label: t('Gift Sets', 'هدايا جاهزة') },
  { to: '/track', label: t('Track Order', 'تتبع طلبك') }];


  return (
    <header className={`sticky top-0 z-50 border-b border-border/50 transition-transform duration-300 ${hidden ? '-translate-y-full' : 'translate-y-0'} ${scrolled ? 'bg-card shadow-sm' : 'bg-card/95'}`}>
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[30px] text-[11px] sm:text-xs flex items-center justify-center gap-3 sm:gap-5">
          <span>{t('Delivery across Lebanon', 'توصيل لكل لبنان')}</span>
          <span className="opacity-50">•</span>
          <span>{t('Cash on Delivery', 'الدفع عند الاستلام')}</span>
          <span className="opacity-50">•</span>
          <span>{t('Soft premium fabrics', 'أقمشة ناعمة وفاخرة')}</span>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between h-14 sm:h-20 gap-4 ${lang === 'ar' ? 'flex-row-reverse' : ''}`}>
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src={LOGO_URL} alt="MiniYo" width={215} height={200} className="h-10 sm:h-14 w-auto object-contain" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(({ to, label }) =>
            <Link key={to} to={to}
            className={`text-sm font-medium transition-colors ${location.pathname === to ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </Link>
            )}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-1.5">
            {/* Language Toggle */}
            <button onClick={toggleLang}
            className="relative flex items-center bg-muted rounded-full p-1 w-[72px] h-11 transition-all hover:shadow-sm"
            aria-label={t('Switch language', 'تغيير اللغة')}>
              <span className={`absolute top-1 w-8 h-9 bg-primary rounded-full transition-all duration-300 ease-out ${lang === 'ar' ? 'left-[calc(100%-2.25rem)]' : 'left-1'}`} />
              <span className={`relative z-10 flex-1 text-center text-xs font-semibold transition-colors ${lang === 'en' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>EN</span>
              <span className={`relative z-10 flex-1 text-center text-xs font-semibold transition-colors ${lang === 'ar' ? 'text-primary-foreground' : 'text-muted-foreground'}`} style={{ fontFamily: "'Cairo', sans-serif" }}>ع</span>
            </button>

            {/* Wishlist */}
            <Link to="/wishlist" aria-label={t('Wishlist', 'المفضلة')} className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors">
              <Heart className="w-4 h-4 text-muted-foreground" />
            </Link>

            {/* Search */}
            <Link to="/shop" aria-label={t('Search products', 'ابحث عن المنتجات')} className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors">
              <Search className="w-4 h-4 text-muted-foreground" />
            </Link>

            {/* Account with tier badge */}
            <Link to={currentUser ? '/account' : '/login'}
              aria-label={t('Account', 'الحساب')}
              className="flex items-center gap-1.5 rounded-full hover:bg-muted transition-colors px-1.5 min-h-[44px]">
              <span className="flex items-center justify-center w-7 h-7 rounded-full">
                <User className="w-4 h-4 text-muted-foreground" />
              </span>
              {currentUser && (customer?.current_tier || customer?.membership_tier) && (() => {
                const tier = customer.current_tier || customer.membership_tier;
                return (
                  <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    tier === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                    tier === 'Silver' ? 'bg-slate-200 text-slate-800' :
                    tier === 'VIP' ? 'bg-purple-100 text-purple-800' :
                    'bg-orange-100 text-orange-800'
                  }`}>
                    {tier === 'Gold' ? '🥇' : tier === 'Silver' ? '🥈' : tier === 'VIP' ? '👑' : '🥉'} {tier}
                  </span>
                );
              })()}
            </Link>

            {/* Cart */}
            <button onClick={() => setIsOpen(true)} aria-label={t('Cart', 'السلة')}
            className="relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors">
              <ShoppingBag className="w-4 h-4 text-muted-foreground" />
              {count > 0 &&
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {count > 9 ? '9+' : count}
                </span>
              }
            </button>

            {/* Mobile menu toggle */}
            <button onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? t('Close menu', 'إغلاق القائمة') : t('Open menu', 'فتح القائمة')}
              aria-expanded={mobileOpen}
              className="md:hidden flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted">
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen &&
        <div className="md:hidden border-t border-border pb-3 pt-2 space-y-0.5">
            {navLinks.map(({ to, label }) =>
          <Link key={to} to={to} onClick={() => setMobileOpen(false)}
          className="block px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                {label}
              </Link>
          )}
          </div>
        }
      </div>
    </header>);

}