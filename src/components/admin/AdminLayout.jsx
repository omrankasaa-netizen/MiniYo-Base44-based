import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import {
  LayoutDashboard, Package, ShoppingBag, BarChart2, Tag, Settings,
  Users, FileText, LogOut, Menu, X, ChevronRight, ChevronDown,
  Warehouse, Languages, ExternalLink, Percent, Megaphone, FolderTree, User, Crown, Mail, Truck,
  FileSpreadsheet, SlidersHorizontal, Star,
} from 'lucide-react';

// Flat, top-level nav entries (rendered above the Settings group).
const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin', permission: null },
  { label: 'Products',  icon: Package,         path: '/admin/products',    permission: 'view_products' },
  { label: 'Categories',icon: FolderTree,      path: '/admin/categories',  permission: 'manage_cms' },
  { label: 'Customers', icon: User,            path: '/admin/customers',   permission: 'view_orders' },
  { label: 'Orders',    icon: ShoppingBag,     path: '/admin/orders',      permission: 'view_orders' },
  { label: 'Reviews',   icon: Star,            path: '/admin/reviews',     permission: 'view_orders' },
  { label: 'Membership',icon: Crown,           path: '/admin/membership',  permission: 'manage_settings' },
  { label: 'Inventory', icon: Warehouse,       path: '/admin/inventory',   permission: 'manage_inventory' },
  { label: 'Finances',  icon: BarChart2,       path: '/admin/finances',    permission: 'view_finances' },

  { label: 'Promo Codes', icon: Tag,           path: '/admin/promo-codes',  permission: 'manage_discounts' },
  { label: 'Discounts',   icon: Percent,       path: '/admin/discounts',    permission: 'manage_discounts' },
  { label: 'Campaigns',   icon: Megaphone,     path: '/admin/campaigns',    permission: 'manage_discounts' },
  { label: 'Bulk Import', icon: FileSpreadsheet, path: '/admin/bulk-import', permission: 'edit_products' },
  { label: 'Team',        icon: Users,         path: '/admin/team',         permission: 'manage_team' },
];

// Collapsible "Settings" group — store config + content/operational logs live here.
const settingsGroup = {
  label: 'Settings',
  icon: Settings,
  children: [
    { label: 'Site Settings', icon: SlidersHorizontal, path: '/admin/site-settings',          permission: 'manage_settings' },
    { label: 'CMS',           icon: FileText,           path: '/admin/cms',                    permission: 'manage_cms' },
    { label: 'Shipping',      icon: Truck,              path: '/admin/site-settings/shipping', permission: 'manage_settings' },
    { label: 'Email Log',     icon: Mail,               path: '/admin/email-log',              permission: 'manage_settings' },
    { label: 'Audit Log',     icon: FileText,           path: '/admin/audit',                  permission: 'view_audit_log' },
  ],
};

const roleLabel = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff' };

export default function AdminLayout({ children }) {
  const { currentUser, logout, canAccess } = useAuthUser();
  const { lang, toggleLang } = useLang();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNav = navItems.filter(item =>
    item.permission === null || canAccess(item.permission)
  );

  const visibleSettings = settingsGroup.children.filter(item =>
    item.permission === null || canAccess(item.permission)
  );
  const settingsActive = visibleSettings.some(item => location.pathname === item.path);
  // Keep the Settings group expanded whenever one of its pages is open.
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);
  useEffect(() => { if (settingsActive) setSettingsOpen(true); }, [settingsActive]);

  const initials = currentUser?.full_name
    ? currentUser.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : currentUser?.email?.[0]?.toUpperCase() || '?';

  function SidebarContent() {
    return (
      <>
        {/* Logo */}
        <div className="px-5 pt-5 pb-4 border-b border-border flex items-center justify-between">
          <div>
            <span className="font-heading font-bold text-foreground text-xl tracking-tight">MiniYo</span>
            <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <button className="lg:hidden p-1 rounded-lg hover:bg-muted" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {visibleNav.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group ${
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-60" />}
              </Link>
            );
          })}

          {/* Settings group — collapsible */}
          {visibleSettings.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setSettingsOpen(o => !o)}
                aria-expanded={settingsOpen}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  settingsActive && !settingsOpen ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
                }`}
              >
                <settingsGroup.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{settingsGroup.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>
              {settingsOpen && (
                <div className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                  {visibleSettings.map(item => {
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                          active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {active && <ChevronRight className="w-3 h-3 opacity-60" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-border space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50">
            <div className="w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-xs font-bold text-primary shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{currentUser?.full_name || currentUser?.email}</p>
              <p className="text-xs text-muted-foreground">{roleLabel[currentUser?.role] || currentUser?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex" dir="ltr">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — desktop static, mobile slide-over */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col
        transition-transform duration-200
        lg:translate-x-0 lg:static lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <SidebarContent />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center gap-3 px-4 shrink-0">
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-muted -ml-1">
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          {/* Mobile logo */}
          <span className="lg:hidden font-heading font-bold text-foreground text-base flex-1">MiniYo</span>

          {/* Desktop spacer */}
          <div className="hidden lg:block flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {/* View Store */}
            <Link
              to="/"
              target="_blank"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Store
            </Link>

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Languages className="w-3.5 h-3.5" />
              {lang === 'en' ? 'ع' : 'EN'}
            </button>

            {/* Log out — icon only on small screens */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}