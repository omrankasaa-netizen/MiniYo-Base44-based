import React from 'react';
import { useAuthUser, ADMIN_ROLES } from '@/contexts/AuthUserContext';
import AccessDenied from './AccessDenied';

export default function AdminGuard({ children }) {
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

  return children;
}