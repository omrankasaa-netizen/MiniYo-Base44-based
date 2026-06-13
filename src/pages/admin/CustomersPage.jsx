import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied from './AccessDenied';
import { Users, Search, Crown, Gift, Zap } from 'lucide-react';

const TIER_COLORS = {
  Bronze: 'bg-amber-50 text-amber-700 border-amber-200',
  Silver: 'bg-slate-50 text-slate-700 border-slate-200',
  Gold: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  VIP: 'bg-purple-50 text-purple-700 border-purple-200',
};

const TIER_ICONS = {
  Bronze: '⭐',
  Silver: '⭐⭐',
  Gold: '⭐⭐⭐',
  VIP: '👑',
};

export default function CustomersPage() {
  const { currentUser, canAccess } = useAuthUser();
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: () => base44.entities.Customer.list('-created_date', 500),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c => {
      if (q && !c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.phone?.includes(q)) return false;
      if (filterTier && c.membership_tier !== filterTier) return false;
      return true;
    });
  }, [customers, search, filterTier]);

  if (!canAccess('view_orders')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const tierStats = {
    Bronze: customers.filter(c => c.membership_tier === 'Bronze').length,
    Silver: customers.filter(c => c.membership_tier === 'Silver').length,
    Gold: customers.filter(c => c.membership_tier === 'Gold').length,
    VIP: customers.filter(c => c.membership_tier === 'VIP').length,
  };

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground">{customers.length} total registered</p>
          </div>
        </div>

        {/* Tier Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['Bronze', 'Silver', 'Gold', 'VIP'].map(tier => (
            <div key={tier} className={`rounded-xl border p-3 text-center ${TIER_COLORS[tier]}`}>
              <p className="text-lg font-bold">{tierStats[tier]}</p>
              <p className="text-xs font-medium">{TIER_ICONS[tier]} {tier}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="bg-transparent text-sm flex-1 outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={filterTier}
            onChange={e => setFilterTier(e.target.value)}
            className="px-3 py-2 bg-muted rounded-xl text-sm text-foreground outline-none border-0 cursor-pointer"
          >
            <option value="">All Tiers</option>
            <option value="Bronze">Bronze</option>
            <option value="Silver">Silver</option>
            <option value="Gold">Gold</option>
            <option value="VIP">VIP</option>
          </select>
        </div>

        {/* Customers Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Phone</th>
                  <th className="px-4 py-3 text-left">Tier</th>
                  <th className="px-4 py-3 text-center hidden sm:table-cell">Orders</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Total Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No customers found.
                    </td>
                  </tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {(c.name?.[0] || 'C').toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{c.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{c.email}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{c.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TIER_COLORS[c.membership_tier] || TIER_COLORS.Bronze}`}>
                        {TIER_ICONS[c.membership_tier]} {c.membership_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell text-foreground font-medium">
                      {c.total_orders || 0}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className="font-semibold text-primary">${(c.total_spent_usd || 0).toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Membership Tiers:</p>
          <ul className="space-y-1 ml-2">
            <li>🥉 <strong>Bronze:</strong> Default tier for all customers</li>
            <li>🥈 <strong>Silver:</strong> Earned after 3+ orders or $100+ spent</li>
            <li>🥇 <strong>Gold:</strong> Earned after 8+ orders or $300+ spent</li>
            <li>👑 <strong>VIP:</strong> Earned after 15+ orders or $750+ spent</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}