import React, { createContext, useContext } from 'react';
import { useAuth } from '@/lib/AuthContext';

const AuthUserContext = createContext();

// Role hierarchy
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
};

export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF];

export function AuthUserProvider({ children }) {
  // Reuse the single /api/auth/me fetch in AuthProvider to avoid duplicate
  // session probes on every page load.
  const { user, isLoadingAuth, logout: authLogout, checkUserAuth } = useAuth();
  const currentUser = user;
  const loading = isLoadingAuth;

  function logout() {
    authLogout(false);
    window.location.href = '/';
  }

  // Permission helpers
  function hasRole(...roles) {
    return currentUser && roles.includes(currentUser.role);
  }

  function isAdminUser() {
    return hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF);
  }

  function isSuperAdmin() {
    return hasRole(ROLES.SUPER_ADMIN);
  }

  function canAccess(permission) {
    if (!currentUser) return false;
    const role = currentUser.role;
    const matrix = {
      // Products
      view_products: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
      edit_products: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
      // Orders
      view_orders: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
      edit_orders: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
      // Inventory
      manage_inventory: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
      // Finances — super admin only (revenue/cost/profit data is owner-only)
      view_finances: [ROLES.SUPER_ADMIN],
      // Promo / Discounts
      manage_promos: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      manage_discounts: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      // CMS
      manage_cms: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
      // Settings
      manage_settings: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      // Team management
      manage_team: [ROLES.SUPER_ADMIN],
      // Audit log
      view_audit_log: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    };
    return (matrix[permission] || []).includes(role);
  }

  return (
    <AuthUserContext.Provider value={{ currentUser, loading, logout, hasRole, isAdminUser, isSuperAdmin, canAccess, refreshUser: checkUserAuth }}>
      {children}
    </AuthUserContext.Provider>
  );
}

export function useAuthUser() {
  const ctx = useContext(AuthUserContext);
  if (!ctx) throw new Error('useAuthUser must be inside AuthUserProvider');
  return ctx;
}