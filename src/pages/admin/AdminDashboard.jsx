import React, { useState, useMemo } from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import AdminLayout from '@/components/admin/AdminLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package, ShoppingBag, TrendingUp, TrendingDown, AlertTriangle, XCircle, BarChart2,
  ArrowRight, Tag, Percent, Megaphone, FolderTree, Users, Boxes, DollarSign, Wallet, Award,
  Download, CalendarRange,
} from 'lucide-react';
import { stockStatus } from '@/lib/inventory';
import { isDiscountLive, isCampaignLive } from '@/lib/discounts';

const STATUS_COLORS = {
  New:                'bg-blue-50 text-blue-700',
  Confirmed:          'bg-indigo-50 text-indigo-700',
  Packed:             'bg-violet-50 text-violet-700',
  'Out for Delivery': 'bg-amber-50 text-amber-700',
  Delivered:          'bg-green-50 text-green-700',
  Cancelled:          'bg-destructive/10 text-destructive',
};

// The global QueryClient disables refetchOnWindowFocus and sets no staleTime,
// so dashboard data is kept fresh with per-query live options (see PR #26).
const LIVE = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
};

const ms = (days) => days * 24 * 60 * 60 * 1000;

// Percent change vs the previous equal-length window. null when there's no base.
function trend(curr, prev) {
  if (!prev) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

// Resolve a preset/custom selection into an ISO [from,to] window for the metrics
// query and CSV export. Returns null for "all" (no range block / full CSV).
function resolveRange(preset, customFrom, customTo) {
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  if (preset === 'today') return { from: startToday, to: endOfToday };
  if (preset === '7d') return { from: new Date(now.getTime() - ms(7)), to: endOfToday };
  if (preset === '30d') return { from: new Date(now.getTime() - ms(30)), to: endOfToday };
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null;
    const from = new Date(customFrom + 'T00:00:00');
    const to = new Date(customTo + 'T23:59:59');
    if (isNaN(from) || isNaN(to) || to < from) return null;
    return { from, to };
  }
  return null;
}

function Sparkline({ values, color = '#2F5D57', height = 32 }) {
  if (!values || values.length === 0) return null;
  const w = 100, h = height;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity="0.08" stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, loading, trendPct, spark, sparkColor }) {
  const up = trendPct != null && trendPct >= 0;
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-muted-foreground font-medium leading-tight">{label}</span>
      </div>
      <div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-heading font-bold text-foreground">
            {loading ? <span className="inline-block w-12 h-6 bg-muted rounded animate-pulse" /> : (value ?? '—')}
          </p>
          {trendPct != null && !loading && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-green-700' : 'text-destructive'}`}>
              {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {Math.abs(trendPct).toFixed(0)}%
            </span>
          )}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {spark && !loading && <div className="mt-2"><Sparkline values={spark} color={sparkColor} /></div>}
      </div>
    </div>
  );
}

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'custom', label: 'Custom' },
];

export default function AdminDashboard() {
  const { currentUser } = useAuthUser();
  const navigate = useNavigate();

  const [preset, setPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const rangeOpts = range
    ? { from: range.from.toISOString(), to: range.to.toISOString() }
    : {};

  // Single role-aware metrics endpoint. The server strips ALL monetary fields
  // for non-super-admins, so money never reaches this browser (Task 7). Money
  // KPIs render only when the server says show_money.
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dash-metrics', rangeOpts.from || null, rangeOpts.to || null],
    queryFn: async () => (await base44.functions.invoke('getDashboardMetrics', rangeOpts)).data,
    ...LIVE,
  });

  const showMoney = !!metrics?.show_money;
  const o = metrics?.orders || {};
  const p = metrics?.products || {};
  const cust = metrics?.customers || {};
  const topProducts = metrics?.top_products || [];
  const statusCounts = o.status_counts || {};
  const recentOrders = o.recent || [];
  const lowStockProducts = p.low_stock_list || [];
  const rangeBlock = metrics?.range || null;

  const today = o.today || { count: 0 };
  const yesterday = o.yesterday || { count: 0 };
  const last7 = o.last7 || { count: 0 };
  const prev7 = o.prev7 || { count: 0 };
  const last30 = o.last30 || { count: 0 };
  const prev30 = o.prev30 || { count: 0 };
  const sparkOrders = o.spark?.orders || [];
  const sparkRevenue = o.spark?.revenue || [];

  const maxTopQty = topProducts.length ? topProducts[0].qty : 0;
  const money = (n) => `$${(n || 0).toFixed(2)}`;

  // Active promotions — promo *config* (not financial-performance figures) and
  // visible to any admin, so still computed client-side from entity reads.
  const { data: promoCodes = [] } = useQuery({
    queryKey: ['dash-promo-codes'],
    queryFn: () => base44.entities.PromoCode.filter({ is_active: true }, '-created_date', 20),
    ...LIVE,
  });
  const { data: discounts = [] } = useQuery({
    queryKey: ['dash-discounts'],
    queryFn: () => base44.entities.Discount.filter({ is_active: true }, '-created_date', 20),
    ...LIVE,
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ['dash-campaigns'],
    queryFn: () => base44.entities.Campaign.filter({ is_active: true }, '-starts_at', 20),
    ...LIVE,
  });

  const now = Date.now();
  const activePromoCodes = promoCodes.filter(c => {
    if (!c.is_active) return false;
    if (c.valid_from && new Date(c.valid_from).getTime() > now) return false;
    if (c.valid_until && new Date(c.valid_until).getTime() < now) return false;
    if (c.usage_limit && c.times_used >= c.usage_limit) return false;
    return true;
  });
  const liveDiscounts = discounts.filter(isDiscountLive);
  const liveCampaigns = campaigns.filter(isCampaignLive);
  const hasActivePromos = activePromoCodes.length > 0 || liveDiscounts.length > 0 || liveCampaigns.length > 0;

  async function handleExportCsv() {
    setExporting(true);
    setExportErr('');
    try {
      const res = await base44.functions.invoke('exportOrdersCsv', rangeOpts);
      const { filename, csv } = res.data || {};
      const blob = new Blob([csv || ''], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'miniyo-orders.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportErr(err?.data?.data?.error || err?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const rangeLabel = range
    ? `${range.from.toLocaleDateString()} → ${range.to.toLocaleDateString()}`
    : 'All time';

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Welcome back{currentUser?.full_name ? `, ${currentUser.full_name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening at MiniYo today.</p>
        </div>

        {/* Date range filter + CSV export */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarRange className="w-4 h-4" /> Period
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(pr => (
              <button key={pr.id} onClick={() => setPreset(pr.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${preset === pr.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                {pr.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-input bg-background" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg border border-input bg-background" />
            </div>
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline">{rangeLabel}</span>
          <button onClick={handleExportCsv} disabled={exporting}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold bg-secondary/20 text-foreground px-3 py-1.5 rounded-lg hover:bg-secondary/30 transition-colors disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        {exportErr && (
          <p className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{exportErr}</p>
        )}

        {/* Selected-period summary */}
        {rangeBlock && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <KpiCard icon={ShoppingBag} label="Orders in period" value={rangeBlock.count}
              sub={rangeLabel} color="bg-blue-50 text-blue-600" loading={isLoading} />
            {showMoney && (
              <KpiCard icon={DollarSign} label="Revenue in period" value={money(rangeBlock.revenue)}
                sub={rangeLabel} color="bg-green-50 text-green-700" loading={isLoading} />
            )}
          </div>
        )}

        {/* Operational KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard icon={ShoppingBag} label="Orders Today" value={today.count}
            trendPct={trend(today.count, yesterday.count)} sub="vs yesterday"
            color="bg-blue-50 text-blue-600" loading={isLoading}
            spark={sparkOrders} sparkColor="#2F5D57" />
          <KpiCard icon={ShoppingBag} label="Orders (7d)" value={last7.count}
            trendPct={trend(last7.count, prev7.count)} sub="vs prior 7 days"
            color="bg-indigo-50 text-indigo-600" loading={isLoading} />
          <KpiCard icon={ShoppingBag} label="Orders (30d)" value={last30.count}
            trendPct={trend(last30.count, prev30.count)} sub="vs prior 30 days"
            color="bg-violet-50 text-violet-600" loading={isLoading} />
          <KpiCard icon={Boxes} label="Open Orders" value={o.open_count || 0}
            sub="awaiting fulfilment" color="bg-amber-50 text-amber-600" loading={isLoading} />

          <KpiCard icon={Package} label="Active Products" value={p.active || 0}
            sub={`${p.total || 0} total`} color="bg-primary/10 text-primary" loading={isLoading} />
          <KpiCard icon={FolderTree} label="Categories" value={p.categories_active || 0}
            color="bg-secondary/20 text-secondary" loading={isLoading} />
          <KpiCard icon={Boxes} label="Units in Stock" value={p.total_stock || 0}
            color="bg-teal-50 text-teal-700" loading={isLoading} />
          <KpiCard icon={Users} label="New Customers (30d)" value={cust.new30 || 0}
            sub={`${cust.repeat || 0} repeat buyers`} color="bg-pink-50 text-pink-600" loading={isLoading} />

          <KpiCard icon={AlertTriangle} label="Low Stock" value={p.low_stock_count || 0}
            color="bg-amber-50 text-amber-600" loading={isLoading} />
          <KpiCard icon={XCircle} label="Out of Stock" value={p.out_of_stock_count || 0}
            color="bg-destructive/10 text-destructive" loading={isLoading} />
        </div>

        {/* Financial KPIs — super admin only (server strips money for others) */}
        {showMoney && (
          <div>
            <h2 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <KpiCard icon={DollarSign} label="Revenue Today" value={money(today.revenue)}
                trendPct={trend(today.revenue, yesterday.revenue)} sub="vs yesterday"
                color="bg-green-50 text-green-700" loading={isLoading}
                spark={sparkRevenue} sparkColor="#2F5D57" />
              <KpiCard icon={DollarSign} label="Revenue (7d)" value={money(last7.revenue)}
                trendPct={trend(last7.revenue, prev7.revenue)} sub="vs prior 7 days"
                color="bg-green-50 text-green-700" loading={isLoading} />
              <KpiCard icon={DollarSign} label="Revenue (30d)" value={money(last30.revenue)}
                trendPct={trend(last30.revenue, prev30.revenue)} sub="vs prior 30 days"
                color="bg-green-50 text-green-700" loading={isLoading} />
              <KpiCard icon={Award} label="Avg Order Value" value={money(o.aov30)}
                trendPct={trend(o.aov30, o.aovPrev)} sub="last 30 days"
                color="bg-violet-50 text-violet-700" loading={isLoading} />
              <KpiCard icon={Wallet} label="Inventory Value (COGS)" value={money(p.inventory_cost)}
                sub="cost of current stock" color="bg-orange-50 text-orange-700" loading={isLoading} />
              <KpiCard icon={BarChart2} label="Potential Revenue" value={money(p.potential_revenue)}
                sub="stock at retail price" color="bg-emerald-50 text-emerald-700" loading={isLoading} />
              <KpiCard icon={TrendingUp} label="Gross Margin (stock)"
                value={p.gross_margin_pct != null ? `${p.gross_margin_pct.toFixed(0)}%` : '—'}
                sub="potential vs cost" color="bg-sky-50 text-sky-700" loading={isLoading} />
              <Link to="/admin/finances" className="bg-card border border-border rounded-2xl p-5 flex items-center justify-center gap-2 shadow-sm text-sm font-semibold text-primary hover:bg-muted/40 transition-colors">
                Full financials <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Active Promotions panel */}
        {hasActivePromos && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-heading font-semibold text-foreground">🎉 Active Promotions</h2>
            </div>
            <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveDiscounts.map(d => (
                <Link key={d.id} to="/admin/discounts" className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-xl p-3 hover:bg-green-100 transition-colors">
                  <Percent className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-green-800 truncate">{d.name}</p>
                    <p className="text-xs text-green-700">{d.type === 'percentage' ? `${d.value}% off` : `-$${d.value}`} · {d.applies_to?.replace(/_/g,' ')}</p>
                    {d.ends_at && <p className="text-xs text-green-600">ends {new Date(d.ends_at).toLocaleDateString()}</p>}
                  </div>
                </Link>
              ))}
              {activePromoCodes.map(c => (
                <Link key={c.id} to="/admin/promo-codes" className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 hover:bg-blue-100 transition-colors">
                  <Tag className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-800 font-mono">{c.code}</p>
                    <p className="text-xs text-blue-700">{c.type === 'free_shipping' ? 'Free shipping' : c.type === 'percentage' ? `${c.value}%` : `-$${c.value}`}</p>
                    <p className="text-xs text-blue-600">{c.times_used || 0}{c.usage_limit ? `/${c.usage_limit}` : ''} used</p>
                  </div>
                </Link>
              ))}
              {liveCampaigns.map(c => (
                <Link key={c.id} to="/admin/campaigns" className="flex items-start gap-2 bg-violet-50 border border-violet-100 rounded-xl p-3 hover:bg-violet-100 transition-colors">
                  <Megaphone className="w-4 h-4 text-violet-700 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-violet-800 truncate">{c.name}</p>
                    <p className="text-xs text-violet-700 capitalize">{c.placement?.replace(/_/g,' ')}</p>
                    {c.ends_at && <p className="text-xs text-violet-600">ends {new Date(c.ends_at).toLocaleDateString()}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Order pipeline + Top sellers */}
          <div className="space-y-6">
            {/* Order status pipeline */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-foreground">Order Pipeline</h2>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {['New', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'].map(st => (
                  <Link key={st} to="/admin/orders" className="rounded-xl border border-border p-3 hover:bg-muted/30 transition-colors">
                    <p className="text-xl font-heading font-bold text-foreground">{statusCounts[st] || 0}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[st] || 'bg-muted text-muted-foreground'}`}>{st}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Top sellers */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-foreground">Top Sellers <span className="text-xs text-muted-foreground font-normal">(30d)</span></h2>
                <Link to="/admin/products" className="text-xs text-primary hover:underline flex items-center gap-1">Products <ArrowRight className="w-3 h-3" /></Link>
              </div>
              <div className="divide-y divide-border">
                {topProducts.length === 0 && (
                  <p className="px-5 py-6 text-sm text-muted-foreground text-center">No sales in the last 30 days yet.</p>
                )}
                {topProducts.map((tp, i) => (
                  <div key={tp.name} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-sm font-medium text-foreground truncate">
                        <span className="text-muted-foreground mr-2">{i + 1}.</span>{tp.name}
                      </p>
                      <span className="text-sm font-semibold text-foreground shrink-0">{tp.qty} sold</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${maxTopQty ? (tp.qty / maxTopQty) * 100 : 0}%`, backgroundColor: '#7FA99B' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent orders + Low-stock alerts */}
          <div className="space-y-6">
            {/* Recent Orders */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-foreground">Recent Orders</h2>
                <Link to="/admin/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {recentOrders.length === 0 && (
                  <p className="px-5 py-6 text-sm text-muted-foreground text-center">No orders yet.</p>
                )}
                {recentOrders.map(order => (
                  <div key={order.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {order.order_number || String(order.id).slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {showMoney && <p className="text-sm font-semibold text-foreground">${(order.grand_total_usd || 0).toFixed(2)}</p>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted text-muted-foreground'}`}>
                        {order.order_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Low-stock alerts */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-foreground">Low-Stock Alerts</h2>
                <Link to="/admin/inventory" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Inventory <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {lowStockProducts.length === 0 && (
                  <p className="px-5 py-6 text-sm text-muted-foreground text-center">All products are well stocked ✓</p>
                )}
                {lowStockProducts.map(lp => {
                  const st = stockStatus(lp.qty, lp.reorder_level);
                  return (
                    <div key={lp.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{lp.name}</p>
                        <p className="text-xs text-muted-foreground">{lp.sku}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color} shrink-0`}>{lp.qty} left</span>
                      <button
                        onClick={() => navigate('/admin/inventory')}
                        className="text-xs text-primary font-medium hover:underline shrink-0"
                      >
                        Restock
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
