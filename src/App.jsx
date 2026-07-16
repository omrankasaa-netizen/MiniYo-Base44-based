import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from '@/components/ScrollToTop';
import PixelPageView from '@/lib/pixel';
import ConsentBanner from '@/components/ConsentBanner';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ErrorBoundary from '@/components/ErrorBoundary';
import RouteFallback from '@/components/RouteFallback';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthUserProvider } from '@/contexts/AuthUserContext';
import { CartProvider } from '@/contexts/CartContext';
import { DiscountProvider } from '@/contexts/DiscountContext';
import { WishlistProvider } from '@/contexts/WishlistContext';

// Layout
import Layout from '@/components/layout/Layout';

// Critical-path storefront pages (home / shop / product detail) — kept eager
// so they ship in the initial bundle for fastest first paint.
import Home from '@/pages/Home';
import ShopPage from '@/pages/ShopPage';
import ProductPage from '@/pages/ProductPage';

// Non-critical storefront pages — lazy-loaded on demand.
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const WishlistPage = lazy(() => import('@/pages/WishlistPage'));
const TrackOrderPage = lazy(() => import('@/pages/TrackOrderPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const FaqPage = lazy(() => import('@/pages/FaqPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const GiftGuidePage = lazy(() => import('@/pages/GiftGuidePage'));

// Auth pages
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

// Account pages
const AccountLayout = lazy(() => import('@/pages/account/AccountLayout'));
const ProfilePage = lazy(() => import('@/pages/account/ProfilePage'));
const OrderHistoryPage = lazy(() => import('@/pages/account/OrderHistoryPage'));
const AddressesPage = lazy(() => import('@/pages/account/AddressesPage'));
const MembershipPage = lazy(() => import('@/pages/account/MembershipPage'));

// Admin pages
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminGuard = lazy(() => import('@/pages/admin/AdminGuard'));
const TeamManagement = lazy(() => import('@/pages/admin/TeamManagement'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const InventoryPage = lazy(() => import('@/pages/admin/InventoryPage'));
const ProductsPage = lazy(() => import('@/pages/admin/ProductsPage'));
const OrdersPage = lazy(() => import('@/pages/admin/OrdersPage'));
const FinancesPage = lazy(() => import('@/pages/admin/FinancesPage'));
const BulkImportPage = lazy(() => import('@/pages/admin/BulkImportPage'));
const CmsPage = lazy(() => import('@/pages/admin/CmsPage'));
const SiteSettingsPage = lazy(() => import('@/pages/admin/SiteSettingsPage'));
const PromoCodesPage = lazy(() => import('@/pages/admin/PromoCodesPage'));
const DiscountsPage = lazy(() => import('@/pages/admin/DiscountsPage'));
const CampaignsPage = lazy(() => import('@/pages/admin/CampaignsPage'));
const CategoriesPage = lazy(() => import('@/pages/admin/CategoriesPage'));
const CustomersPage = lazy(() => import('@/pages/admin/CustomersPage'));
const AdminMembershipPage = lazy(() => import('@/pages/admin/MembershipPage'));
const EmailLogPage = lazy(() => import('@/pages/admin/EmailLogPage'));
const ShippingPage = lazy(() => import('@/pages/admin/ShippingPage'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-body">MiniYo</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      {/* Storefront */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/track" element={<TrackOrderPage />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/gifts" element={<GiftGuidePage />} />

        {/* Account area */}
        <Route path="/account" element={<AccountLayout />}>
          <Route index element={<ProfilePage />} />
          <Route path="orders" element={<OrderHistoryPage />} />
          <Route path="addresses" element={<AddressesPage />} />
          <Route path="membership" element={<MembershipPage />} />
        </Route>
      </Route>

      {/* Auth pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Admin auth */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Admin panel — guarded */}
      <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
      <Route path="/admin/team" element={<AdminGuard requireSuperAdmin><TeamManagement /></AdminGuard>} />
      <Route path="/admin/settings" element={<AdminGuard><AdminSettings /></AdminGuard>} />
      <Route path="/admin/audit" element={<AdminGuard><AuditLogPage /></AdminGuard>} />
      <Route path="/admin/inventory" element={<AdminGuard><InventoryPage /></AdminGuard>} />
      <Route path="/admin/products" element={<AdminGuard><ProductsPage /></AdminGuard>} />
      <Route path="/admin/categories" element={<AdminGuard><CategoriesPage /></AdminGuard>} />
      <Route path="/admin/orders" element={<AdminGuard><OrdersPage /></AdminGuard>} />
      <Route path="/admin/finances" element={<AdminGuard requireSuperAdmin><FinancesPage /></AdminGuard>} />
      <Route path="/admin/bulk-import" element={<AdminGuard><BulkImportPage /></AdminGuard>} />
      <Route path="/admin/cms" element={<AdminGuard><CmsPage /></AdminGuard>} />
      <Route path="/admin/site-settings" element={<AdminGuard><SiteSettingsPage /></AdminGuard>} />
      <Route path="/admin/promo-codes" element={<AdminGuard><PromoCodesPage /></AdminGuard>} />
      <Route path="/admin/discounts" element={<AdminGuard><DiscountsPage /></AdminGuard>} />
      <Route path="/admin/campaigns" element={<AdminGuard><CampaignsPage /></AdminGuard>} />
      <Route path="/admin/customers" element={<AdminGuard><CustomersPage /></AdminGuard>} />
      <Route path="/admin/membership" element={<AdminGuard><AdminMembershipPage /></AdminGuard>} />
      <Route path="/admin/email-log" element={<AdminGuard><EmailLogPage /></AdminGuard>} />
      <Route path="/admin/site-settings/shipping" element={<AdminGuard><ShippingPage /></AdminGuard>} />

      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <AuthUserProvider>
            <WishlistProvider>
              <QueryClientProvider client={queryClientInstance}>
                <CartProvider>
                  <DiscountProvider>
                    <Router>
                      <ScrollToTop />
                      <PixelPageView />
                      <AuthenticatedApp />
                      <ConsentBanner />
                    </Router>
                    <Toaster />
                  </DiscountProvider>
                </CartProvider>
              </QueryClientProvider>
            </WishlistProvider>
          </AuthUserProvider>
        </LanguageProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;