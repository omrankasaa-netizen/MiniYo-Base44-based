import React, { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Star, Trash2, ExternalLink, BadgeCheck, ChevronDown, ChevronUp } from 'lucide-react';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'published', label: 'Published' },
];

function Stars({ rating }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: () => base44.entities.Review.list('-created_date', 1000),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['admin-review-products'],
    queryFn: () => base44.entities.Product.list('-created_date', 2000),
  });
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  if (!canAccess('view_orders')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const published = reviews.filter(r => r.is_published);
  const awaiting = reviews.filter(r => !r.is_published);
  const avgRating = published.length
    ? published.reduce((s, r) => s + (Number(r.rating) || 0), 0) / published.length
    : 0;

  const visible = filter === 'awaiting' ? awaiting : filter === 'published' ? published : reviews;

  async function togglePublished(review) {
    await base44.entities.Review.update(review.id, { is_published: !review.is_published });
    await logAction({ action: 'updated', entity: 'Review', entity_id: review.id, details: review.is_published ? 'unpublished' : 'published', userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-reviews'] });
  }

  async function toggleVerified(review) {
    await base44.entities.Review.update(review.id, { is_verified: !review.is_verified });
    qc.invalidateQueries({ queryKey: ['admin-reviews'] });
  }

  async function handleDelete(review) {
    if (!confirm(`Delete review by ${review.customer_name || 'anonymous'}? This cannot be undone.`)) return;
    await base44.entities.Review.delete(review.id);
    await logAction({ action: 'deleted', entity: 'Review', entity_id: review.id, details: review.title || review.customer_name || '', userName: currentUser?.email });
    qc.invalidateQueries({ queryKey: ['admin-reviews'] });
  }

  const stats = [
    { label: 'Total', value: reviews.length },
    { label: 'Awaiting review', value: awaiting.length },
    { label: 'Published', value: published.length },
    { label: 'Average rating', value: published.length ? avgRating.toFixed(1) : '—' },
  ];

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Star className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Reviews</h1>
            <p className="text-sm text-muted-foreground">Moderate customer reviews — publish, verify, or remove</p>
          </div>
        </div>

        {/* Stats header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="bg-card border border-border rounded-2xl px-4 py-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
              {f.label}
              {f.key === 'awaiting' && awaiting.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">{awaiting.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          {isLoading && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {filter === 'all' ? 'No reviews yet.' : `No ${filter === 'awaiting' ? 'awaiting' : 'published'} reviews.`}
            </p>
          )}
          {!isLoading && visible.length > 0 && (
            <div className="divide-y divide-border">
              {visible.map(r => {
                const product = productById[r.product_id];
                const isOpen = !!expanded[r.id];
                const longBody = (r.body || '').length > 160;
                return (
                  <div key={r.id} className="px-4 py-4 flex flex-col gap-2 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{r.customer_name || 'Anonymous'}</span>
                          <Stars rating={r.rating} />
                          {r.is_verified && (
                            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <BadgeCheck className="w-3 h-3" /> Verified Buyer
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.is_published ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                            {r.is_published ? 'Published' : 'Awaiting review'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          {product ? (
                            <a href={`/product/${product.slug}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline">
                              {product.name} <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span>Product {r.product_id?.slice(0, 8)}…</span>
                          )}
                          <span>·</span>
                          <span>{r.created_date ? new Date(r.created_date).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <button onClick={() => togglePublished(r)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${r.is_published ? 'border border-border text-muted-foreground hover:bg-muted' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                          {r.is_published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button onClick={() => toggleVerified(r)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${r.is_verified ? 'border-green-200 bg-green-50 text-green-700' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                          {r.is_verified ? 'Verified ✓' : 'Mark Verified'}
                        </button>
                        <button onClick={() => handleDelete(r)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {(r.title || r.body) && (
                      <div>
                        {r.title && <p className="text-sm font-medium text-foreground">{r.title}</p>}
                        {r.body && (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {isOpen || !longBody ? r.body : `${r.body.slice(0, 160)}…`}
                            {longBody && (
                              <button onClick={() => setExpanded(p => ({ ...p, [r.id]: !isOpen }))}
                                className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                                {isOpen ? <>Less <ChevronUp className="w-3 h-3" /></> : <>More <ChevronDown className="w-3 h-3" /></>}
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
