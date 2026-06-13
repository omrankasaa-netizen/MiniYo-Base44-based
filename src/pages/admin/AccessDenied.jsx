import React from 'react';
import { ShieldX } from 'lucide-react';

export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-2xl mb-4">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-sm mb-6">
          You don't have permission to access the admin panel.
        </p>
        <a
          href="/"
          className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Back to Store
        </a>
      </div>
    </div>
  );
}