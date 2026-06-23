import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import CmsHomepageBanners from '@/components/admin/cms/CmsHomepageBanners';
import CmsFeatured from '@/components/admin/cms/CmsFeatured';
import CmsHomeSections from '@/components/admin/cms/CmsHomeSections';
import CmsMediaLibrary from '@/components/admin/cms/CmsMediaLibrary';
import CmsFaqs from '@/components/admin/cms/CmsFaqs';
import CmsLegal from '@/components/admin/cms/CmsLegal';
import CmsPaymentMethods from '@/components/admin/cms/CmsPaymentMethods';
import { Image, Star, LayoutTemplate, FolderOpen, HelpCircle, Scale, CreditCard } from 'lucide-react';

const TABS = [
  { key: 'banners', label: 'Homepage Banners', icon: Image },
  { key: 'featured', label: 'Featured', icon: Star },
  { key: 'sections', label: 'Homepage Sections', icon: LayoutTemplate },
  { key: 'media', label: 'Media Library', icon: FolderOpen },
  { key: 'faqs', label: 'FAQs', icon: HelpCircle },
  { key: 'legal', label: 'Legal Pages', icon: Scale },
  { key: 'payments', label: 'Payments', icon: CreditCard },
];

export default function CmsPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [tab, setTab] = useState('banners');

  const { data: sections = [], isLoading: loadingSections } = useQuery({
    queryKey: ['cms-sections'],
    queryFn: () => base44.entities.CmsSection.list('sort_order', 200),
  });

  const { data: mediaAssets = [], isLoading: loadingMedia } = useQuery({
    queryKey: ['cms-media'],
    queryFn: () => base44.entities.MediaAsset.list('-created_date', 200),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['cms-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, 'name', 200),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['cms-categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: faqs = [] } = useQuery({
    queryKey: ['cms-faqs'],
    queryFn: () => base44.entities.Faq.list('sort_order', 100),
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['cms-campaigns'],
    queryFn: () => base44.entities.Campaign.filter({ is_active: true }, '-starts_at', 30),
  });

  const sectionMap = useMemo(() => {
    const m = {};
    for (const s of sections) m[s.section_key] = s;
    return m;
  }, [sections]);

  async function upsertSection(key, data) {
    const existing = sectionMap[key];
    if (existing) {
      await base44.entities.CmsSection.update(existing.id, data);
    } else {
      await base44.entities.CmsSection.create({ section_key: key, ...data });
    }
    await logAction({ action: 'cms_updated', entity: 'CmsSection', details: key, userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['cms-sections'] });
  }

  if (!canAccess('manage_cms')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const ActiveTab = TABS.find(t => t.key === tab);

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">CMS Console</h1>
          <p className="text-sm text-muted-foreground">Manage storefront content — changes apply immediately.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 flex-wrap bg-muted p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                ${tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {loadingSections && <div className="text-sm text-muted-foreground">Loading…</div>}

        {!loadingSections && (
          <>
            {tab === 'banners' && (
              <CmsHomepageBanners
                sections={sections}
                onSave={upsertSection}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['cms-sections'] })}
                currentUser={currentUser}
                campaigns={campaigns}
              />
            )}
            {tab === 'featured' && <CmsFeatured sectionMap={sectionMap} products={products} categories={categories} onSave={upsertSection} />}
            {tab === 'sections' && <CmsHomeSections sectionMap={sectionMap} onSave={upsertSection} />}
            {tab === 'media' && <CmsMediaLibrary assets={mediaAssets} onRefresh={() => qc.invalidateQueries({ queryKey: ['cms-media'] })} currentUser={currentUser} />}
            {tab === 'faqs' && <CmsFaqs faqs={faqs} onRefresh={() => qc.invalidateQueries({ queryKey: ['cms-faqs'] })} currentUser={currentUser} />}
            {tab === 'legal' && <CmsLegal sectionMap={sectionMap} onSave={upsertSection} />}
            {tab === 'payments' && <CmsPaymentMethods currentUser={currentUser} />}
          </>
        )}
      </div>
    </AdminLayout>
  );
}