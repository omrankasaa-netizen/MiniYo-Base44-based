import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { User, ShoppingBag, MapPin, Heart, Star, LogOut } from 'lucide-react';

export default function AccountLayout() {
  const { currentUser, logout } = useAuthUser();
  const { t } = useLang();
  const location = useLocation();
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    if (currentUser?.email) {
      base44.entities.Customer.filter({ email: currentUser.email }, 'created_date', 1)
        .then(results => results[0] && setCustomer(results[0]))
        .catch(() => {});
    }
  }, [currentUser?.email]);

  if (!currentUser) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('Please log in to view your account.', 'الرجاء تسجيل الدخول.')}</p>
        <button onClick={() => base44.auth.redirectToLogin('/account')}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold text-sm">
          {t('Log In', 'تسجيل الدخول')}
        </button>
      </div>
    );
  }

  const links = [
    { to: '/account', label: t('Profile', 'الملف الشخصي'), icon: User, exact: true },
    { to: '/account/orders', label: t('My Orders', 'طلباتي'), icon: ShoppingBag },
    { to: '/account/addresses', label: t('Addresses', 'العناوين'), icon: MapPin },
    { to: '/wishlist', label: t('Wishlist', 'المفضلة'), icon: Heart },
    { to: '/account/membership', label: t('Membership', 'العضوية'), icon: Star },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-6 flex-col md:flex-row">
          {/* Sidebar */}
          <aside className="md:w-56 shrink-0">
            <div className="bg-card border border-border rounded-2xl p-4 space-y-1 sticky top-24">
              <div className="px-3 py-2 mb-2 border-b border-border">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-heading font-semibold text-foreground text-sm truncate">{currentUser.full_name}</p>
                </div>
                {customer?.membership_tier && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      customer.membership_tier === 'VIP' ? 'bg-purple-50 text-purple-700' :
                      customer.membership_tier === 'Gold' ? 'bg-yellow-50 text-yellow-700' :
                      customer.membership_tier === 'Silver' ? 'bg-slate-50 text-slate-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {customer.membership_tier === 'VIP' ? '👑' : '⭐'} {customer.membership_tier}
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
              </div>
              {links.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? location.pathname === to : location.pathname.startsWith(to);
                return (
                  <Link key={to} to={to}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                      ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
              <button onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors mt-2">
                <LogOut className="w-4 h-4" />
                {t('Log Out', 'تسجيل الخروج')}
              </button>
            </div>
          </aside>
          {/* Content */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}