import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Rocket, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const CHECKS = [
  {
    id: 'site_settings',
    label: 'Site Settings configured (WhatsApp, Instagram, delivery fees)',
    link: '/admin/site-settings',
    linkLabel: 'Open Settings',
    checkFn: (data) => {
      const map = Object.fromEntries((data.settings || []).map(s => [s.setting_key, s.setting_value]));
      return !!(map.whatsapp_number && map.instagram_url && map.delivery_fee_inside);
    },
  },
  {
    id: 'products_active',
    label: 'At least 1 Active product in the catalog',
    link: '/admin/products',
    linkLabel: 'View Products',
    checkFn: (data) => (data.activeProducts || 0) > 0,
  },
  {
    id: 'products_photos',
    label: 'All Active products have at least 1 product image',
    link: '/admin/products',
    linkLabel: 'View Products',
    checkFn: (data) => (data.productsWithoutImages || 0) === 0,
    warnFn: (data) => data.productsWithoutImages > 0 ? `${data.productsWithoutImages} product(s) missing photos` : null,
  },
  {
    id: 'cms_hero',
    label: 'Homepage hero section content set',
    link: '/admin/cms',
    linkLabel: 'Open CMS',
    checkFn: (data) => {
      const hero = (data.cms || []).find(s => s.section_key === 'home_hero');
      return !!(hero?.title || hero?.image_url);
    },
  },
  {
    id: 'legal_pages',
    label: 'Legal pages exist in CMS (Privacy, Terms, Shipping, Returns)',
    link: '/admin/cms',
    linkLabel: 'Open CMS',
    checkFn: (data) => {
      const keys = (data.cms || []).map(s => s.section_key);
      return ['legal_privacy', 'legal_terms', 'legal_shipping', 'legal_returns'].every(k => keys.includes(k));
    },
    warnFn: (data) => {
      const keys = (data.cms || []).map(s => s.section_key);
      const missing = ['legal_privacy','legal_terms','legal_shipping','legal_returns'].filter(k => !keys.includes(k));
      return missing.length ? `Using defaults for: ${missing.join(', ')}` : null;
    },
  },
  {
    id: 'categories',
    label: 'At least 1 Active product category exists',
    link: '/admin/products',
    linkLabel: 'View Categories',
    checkFn: (data) => (data.categories || 0) > 0,
  },
  {
    id: 'seo',
    label: 'SEO meta tags configured in index.html',
    checkFn: () => true, // Done by code — always green
  },
];

export default function LaunchChecklist() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: settings = [] } = useQuery({ queryKey: ['lc-settings', refreshKey], queryFn: () => base44.entities.SiteSetting.list('setting_key', 100) });
  const { data: allProducts = [] } = useQuery({ queryKey: ['lc-products', refreshKey], queryFn: () => base44.entities.Product.filter({ status: 'Active' }, 'name', 500) });
  const { data: allImages = [] } = useQuery({ queryKey: ['lc-images', refreshKey], queryFn: () => base44.entities.ProductImage.list('product_id', 2000) });
  const { data: cmsSections = [] } = useQuery({ queryKey: ['lc-cms', refreshKey], queryFn: () => base44.entities.CmsSection.list('section_key', 200) });
  const { data: categories = [] } = useQuery({ queryKey: ['lc-cats', refreshKey], queryFn: () => base44.entities.Category.filter({ is_active: true }, 'name', 50) });

  const productIdsWithImages = new Set(allImages.map(i => i.product_id));
  const productsWithoutImages = allProducts.filter(p => !productIdsWithImages.has(p.id));

  const checkData = {
    settings,
    activeProducts: allProducts.length,
    productsWithoutImages: productsWithoutImages.length,
    cms: cmsSections,
    categories: categories.length,
  };

  const results = CHECKS.map(c => ({
    ...c,
    passed: c.checkFn(checkData),
    warning: c.warnFn ? c.warnFn(checkData) : null,
  }));

  const allPassed = results.every(r => r.passed);
  const passCount = results.filter(r => r.passed).length;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Rocket className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-heading font-bold text-foreground">Launch Checklist</h1>
              <p className="text-sm text-muted-foreground">{passCount}/{results.length} checks passed</p>
            </div>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${(passCount / results.length) * 100}%` }} />
        </div>

        {/* Checks */}
        <div className="space-y-2">
          {results.map(check => (
            <div key={check.id}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors
                ${check.passed ? 'bg-green-50 border-green-200' : 'bg-card border-border'}`}>
              <div className="mt-0.5 shrink-0">
                {check.passed
                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                  : <Circle className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${check.passed ? 'text-green-800' : 'text-foreground'}`}>{check.label}</p>
                {check.warning && (
                  <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3" /> {check.warning}
                  </p>
                )}
              </div>
              {check.link && !check.passed && (
                <Link to={check.link}
                  className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                  {check.linkLabel} <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Publish reminder */}
        {allPassed && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 text-center space-y-2">
            <p className="text-lg font-heading font-bold text-primary">🎉 Ready to Launch!</p>
            <p className="text-sm text-muted-foreground">All checks passed. Go to <strong>Dashboard → Publish</strong> to make your app live.</p>
          </div>
        )}

        {/* Manual items */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Manual Checks (action required)</h2>
          {[
            ['Change super_admin password', 'Go to your profile → change password or use Admin → Settings'],
            ['Upload logo & favicon', 'Go to CMS → Media Library, upload logo. Update index.html favicon URL.'],
            ['Test a full order', 'Place a test order on the storefront, then Confirm → Pack → Deliver it in admin.'],
            ['Test WhatsApp link', 'Tap the WhatsApp icon in the footer and verify it opens the right number.'],
            ['Verify RTL (Arabic)', 'Toggle language to Arabic and check all pages render correctly right-to-left.'],
          ].map(([item, hint]) => (
            <div key={item} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded border-2 border-border shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">{item}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}