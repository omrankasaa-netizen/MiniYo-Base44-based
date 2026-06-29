import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from '@/components/ScrollToTop';
import PixelPageView from '@/lib/pixel';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ErrorBoundary from '@/components/ErrorBoundary';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthUserProvider } from '@/contexts/AuthUserContext';
import { CartProvider } from '@/contexts/CartContext';
import { DiscountProvider } from '@/contexts/DiscountContext';
import { WishlistProvider } from '@/contexts/WishlistContext';

// Layout
import Layout from '@/components/layout/Layout';

// Storefront pages
import Home from '@/pages/Home';
import ShopPage from '@/pages/ShopPage';
import ProductPage from '@/pages/ProductPage';
import CartPage from '@/pages/CartPage';
import CheckoutPage from '@/pages/CheckoutPage';
import WishlistPage from '@/pages/WishlistPage';
import TrackOrderPage from '@/pages/TrackOrderPage';
import LegalPage from '@/pages/LegalPage';
import FaqPage from '@/pages/FaqPage';
import AboutPage from '@/pages/AboutPage';
import GiftGuidePage from '@/pages/GiftGuidePage';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Account pages
import AccountLayout from '@/pages/account/AccountLayout';
import ProfilePage from '@/pages/account/ProfilePage';
import OrderHistoryPage from '@/pages/account/OrderHistoryPage';
import AddressesPage from '@/pages/account/AddressesPage';
import MembershipPage from '@/pages/account/MembershipPage';

// Admin pages
import AdminLogin from '@/pages/admin/AdminLogin';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminGuard from '@/pages/admin/AdminGuard';
import TeamManagement from '@/pages/admin/TeamManagement';
import AdminSettings from '@/pages/admin/AdminSettings';
import AuditLogPage from '@/pages/admin/AuditLogPage';
import InventoryPage from '@/pages/admin/InventoryPage';
import ProductsPage from '@/pages/admin/ProductsPage';
import OrdersPage from '@/pages/admin/OrdersPage';
import FinancesPage from '@/pages/admin/FinancesPage';
import BulkImportPage from '@/pages/admin/BulkImportPage';
import CmsPage from '@/pages/admin/CmsPage';
import SiteSettingsPage from '@/pages/admin/SiteSettingsPage';
import PromoCodesPage from '@/pages/admin/PromoCodesPage';
import DiscountsPage from '@/pages/admin/DiscountsPage';
import CampaignsPage from '@/pages/admin/CampaignsPage';
import CategoriesPage from '@/pages/admin/CategoriesPage';
import CustomersPage from '@/pages/admin/CustomersPage';
import AdminMembershipPage from '@/pages/admin/MembershipPage';
import EmailLogPage from '@/pages/admin/EmailLogPage';
import ShippingPage from '@/pages/admin/ShippingPage';

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