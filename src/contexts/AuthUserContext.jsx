import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

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
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await base44.auth.logout();
    setCurrentUser(null);
    window.location.href = '/';
  }

  // Permission helpers
  function hasRole(...roles) {
    return currentUser && roles.includes(currentUser.role);
  }

  function isAdminUser() {
    return hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF);
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
      // Finances / Promo / Discounts
      view_finances: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
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
    <AuthUserContext.Provider value={{ currentUser, loading, logout, hasRole, isAdminUser, canAccess, refreshUser: loadUser }}>
      {children}
    </AuthUserContext.Provider>
  );
}

export function useAuthUser() {
  const ctx = useContext(AuthUserContext);
  if (!ctx) throw new Error('useAuthUser must be inside AuthUserProvider');
  return ctx;
}