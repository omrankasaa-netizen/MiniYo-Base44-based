import React from 'react';
import { useAuthUser, ADMIN_ROLES, ROLES } from '@/contexts/AuthUserContext';
import AccessDenied from './AccessDenied';

export default function AdminGuard({ children, requireSuperAdmin = false }) {
  const { currentUser, loading } = useAuthUser();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser || !ADMIN_ROLES.includes(currentUser.role)) {
    return <AccessDenied />;
  }

  if (requireSuperAdmin && currentUser.role !== ROLES.SUPER_ADMIN) {
    return <AccessDenied />;
  }

  return children;
}