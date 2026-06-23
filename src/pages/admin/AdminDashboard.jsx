import React from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import AdminLayout from '@/components/admin/AdminLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package, ShoppingBag, TrendingUp, TrendingDown, AlertTriangle, XCircle, BarChart2,
  ArrowRight, Tag, Percent, Megaphone, FolderTree, Users, Boxes, DollarSign, Wallet, Award,
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

const REVENUE_STATUSES = ['Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
const OPEN_STATUSES = ['New', 'Confirmed', 'Packed', 'Out for Delivery'];

// The global QueryClient disables refetchOnWindowFocus and sets no staleTime,
// so dashboard data is kept fresh with per-query live options (see PR #26).
const LIVE = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
};

const ms = (days) => days * 24 * 60 * 60 * 1000;
const orderTime = (o) => new Date(o.order_date || o.created_date).getTime();

// Percent change vs the previous equal-length window. null when there's no base.
function trend(curr, prev) {
  if (!prev) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
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

export default function AdminDashboard() {
  const { currentUser, canAccess } = useAuthUser();
  const navigate = useNavigate();
  // Financial figures (revenue, cost, profit) are owner-only; view_finances is
  // restricted to super_admin, so this also gates the dashboard money KPIs.
  const showMoney = canAccess('view_finances');

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['dash-orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 500),
    ...LIVE,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['dash-products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
    ...LIVE,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['dash-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 1000),
    ...LIVE,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['dash-categories'],
    queryFn: () => base44.entities.Category.list('-created_date', 500),
    ...LIVE,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['dash-customers'],
    queryFn: () => base44.entities.Customer.list('-created_date', 1000),
    ...LIVE,
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['dash-order-items'],
    queryFn: () => base44.entities.OrderItem.list('-created_date', 2000),
    ...LIVE,
  });

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

  // ── Time-windowed order metrics ──────────────────────────────────────────────
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const todayMs = startToday.getTime();

  const revenueOrders = orders.filter(o => REVENUE_STATUSES.includes(o.order_status));

  // Count + revenue inside [from, to)
  function windowStats(fromMs, toMs) {
    let count = 0, revenue = 0;
    for (const o of revenueOrders) {
      const t = orderTime(o);
      if (t >= fromMs && t < toMs) { count++; revenue += (o.grand_total_usd || 0); }
    }
    return { count, revenue };
  }

  const today = windowStats(todayMs, now + 1);
  const yesterday = windowStats(todayMs - ms(1), todayMs);
  const last7 = windowStats(now - ms(7), now + 1);
  const prev7 = windowStats(now - ms(14), now - ms(7));
  const last30 = windowStats(now - ms(30), now + 1);
  const prev30 = windowStats(now - ms(60), now - ms(30));

  const aov30 = last30.count > 0 ? last30.revenue / last30.count : 0;
  const aovPrev = prev30.count > 0 ? prev30.revenue / prev30.count : 0;

  // 14-day sparkline buckets (oldest → newest)
  const spark = { orders: [], revenue: [] };
  for (let i = 13; i >= 0; i--) {
    const from = todayMs - ms(i);
    const to = from + ms(1);
    const s = windowStats(from, to);
    spark.orders.push(s.count);
    spark.revenue.push(s.revenue);
  }

  // ── Orders by status (open pipeline) ─────────────────────────────────────────
  const statusCounts = {};
  for (const o of orders) statusCounts[o.order_status] = (statusCounts[o.order_status] || 0) + 1;
  const openCount = OPEN_STATUSES.reduce((s, st) => s + (statusCounts[st] || 0), 0);

  // ── Inventory ────────────────────────────────────────────────────────────────
  const variantsByProduct = {};
  for (const v of variants) {
    (variantsByProduct[v.product_id] ||= []).push(v);
  }
  const stockOf = (p) => {
    const pvs = variantsByProduct[p.id] || [];
    return (p.has_variants && pvs.length > 0)
      ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
      : (p.stock_quantity || 0);
  };

  let totalStock = 0, lowStockCount = 0, outOfStockCount = 0, inventoryCost = 0, potentialRevenue = 0;
  for (const p of products) {
    const reorder = p.reorder_level || 3;
    const pvs = variantsByProduct[p.id] || [];
    const units = stockOf(p);
    totalStock += units;
    inventoryCost += (p.cost_usd || 0) * units;
    potentialRevenue += (p.price_usd || 0) * units;
    if (p.has_variants && pvs.length > 0) {
      for (const v of pvs) {
        const q = v.qty_on_hand || 0;
        if (q <= 0) outOfStockCount++;
        else if (q <= reorder) lowStockCount++;
      }
    } else {
      const q = p.stock_quantity || 0;
      if (q <= 0) outOfStockCount++;
      else if (q <= reorder) lowStockCount++;
    }
  }

  const activeProducts = products.filter(p => (p.status || 'Active') === 'Active').length;
  const activeCategories = categories.filter(c => c.is_active !== false).length;

  const lowStockProducts = products.filter(p => {
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) return pvs.some(v => (v.qty_on_hand || 0) <= (p.reorder_level || 3));
    return (p.stock_quantity || 0) <= (p.reorder_level || 3);
  }).slice(0, 6);

  // ── New / repeat customers ───────────────────────────────────────────────────
  const newCustomers30 = customers.filter(c => new Date(c.created_date).getTime() >= now - ms(30)).length;
  const repeatCustomers = customers.filter(c => (c.total_orders || 0) > 1).length;

  // ── Top-selling products (30d, by units) ─────────────────────────────────────
  const recentRevenueOrderIds = new Set(
    revenueOrders.filter(o => orderTime(o) >= now - ms(30)).map(o => o.id)
  );
  const sales = {};
  for (const it of orderItems) {
    if (!recentRevenueOrderIds.has(it.order_id)) continue;
    const key = it.product_name || it.product_id || 'Unknown';
    if (!sales[key]) sales[key] = { name: key, qty: 0, revenue: 0 };
    sales[key].qty += (it.quantity || 0);
    sales[key].revenue += (it.line_total_usd || 0);
  }
  const topProducts = Object.values(sales).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const maxTopQty = topProducts.length ? topProducts[0].qty : 0;

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 8);

  // Active promotions
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

  const money = (n) => `$${(n || 0).toFixed(2)}`;

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

        {/* Operational KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard icon={ShoppingBag} label="Orders Today" value={today.count}
            trendPct={trend(today.count, yesterday.count)} sub="vs yesterday"
            color="bg-blue-50 text-blue-600" loading={loadingOrders}
            spark={spark.orders} sparkColor="#2F5D57" />
          <KpiCard icon={ShoppingBag} label="Orders (7d)" value={last7.count}
            trendPct={trend(last7.count, prev7.count)} sub="vs prior 7 days"
            color="bg-indigo-50 text-indigo-600" loading={loadingOrders} />
          <KpiCard icon={ShoppingBag} label="Orders (30d)" value={last30.count}
            trendPct={trend(last30.count, prev30.count)} sub="vs prior 30 days"
            color="bg-violet-50 text-violet-600" loading={loadingOrders} />
          <KpiCard icon={Boxes} label="Open Orders" value={openCount}
            sub="awaiting fulfilment" color="bg-amber-50 text-amber-600" loading={loadingOrders} />

          <KpiCard icon={Package} label="Active Products" value={activeProducts}
            sub={`${products.length} total`} color="bg-primary/10 text-primary" loading={loadingProducts} />
          <KpiCard icon={FolderTree} label="Categories" value={activeCategories}
            color="bg-secondary/20 text-secondary" loading={loadingProducts} />
          <KpiCard icon={Boxes} label="Units in Stock" value={totalStock}
            color="bg-teal-50 text-teal-700" loading={loadingProducts} />
          <KpiCard icon={Users} label="New Customers (30d)" value={newCustomers30}
            sub={`${repeatCustomers} repeat buyers`} color="bg-pink-50 text-pink-600" />

          <KpiCard icon={AlertTriangle} label="Low Stock" value={lowStockCount}
            color="bg-amber-50 text-amber-600" loading={loadingProducts} />
          <KpiCard icon={XCircle} label="Out of Stock" value={outOfStockCount}
            color="bg-destructive/10 text-destructive" loading={loadingProducts} />
        </div>

        {/* Financial KPIs — super admin only */}
        {showMoney && (
          <div>
            <h2 className="text-sm font-heading font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <KpiCard icon={DollarSign} label="Revenue Today" value={money(today.revenue)}
                trendPct={trend(today.revenue, yesterday.revenue)} sub="vs yesterday"
                color="bg-green-50 text-green-700" loading={loadingOrders}
                spark={spark.revenue} sparkColor="#2F5D57" />
              <KpiCard icon={DollarSign} label="Revenue (7d)" value={money(last7.revenue)}
                trendPct={trend(last7.revenue, prev7.revenue)} sub="vs prior 7 days"
                color="bg-green-50 text-green-700" loading={loadingOrders} />
              <KpiCard icon={DollarSign} label="Revenue (30d)" value={money(last30.revenue)}
                trendPct={trend(last30.revenue, prev30.revenue)} sub="vs prior 30 days"
                color="bg-green-50 text-green-700" loading={loadingOrders} />
              <KpiCard icon={Award} label="Avg Order Value" value={money(aov30)}
                trendPct={trend(aov30, aovPrev)} sub="last 30 days"
                color="bg-violet-50 text-violet-700" loading={loadingOrders} />
              <KpiCard icon={Wallet} label="Inventory Value (COGS)" value={money(inventoryCost)}
                sub="cost of current stock" color="bg-orange-50 text-orange-700" loading={loadingProducts} />
              <KpiCard icon={BarChart2} label="Potential Revenue" value={money(potentialRevenue)}
                sub="stock at retail price" color="bg-emerald-50 text-emerald-700" loading={loadingProducts} />
              <KpiCard icon={TrendingUp} label="Gross Margin (stock)"
                value={potentialRevenue > 0 ? `${(((potentialRevenue - inventoryCost) / potentialRevenue) * 100).toFixed(0)}%` : '—'}
                sub="potential vs cost" color="bg-sky-50 text-sky-700" loading={loadingProducts} />
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
                {topProducts.map((p, i) => (
                  <div key={p.name} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-sm font-medium text-foreground truncate">
                        <span className="text-muted-foreground mr-2">{i + 1}.</span>{p.name}
                      </p>
                      <span className="text-sm font-semibold text-foreground shrink-0">{p.qty} sold</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${maxTopQty ? (p.qty / maxTopQty) * 100 : 0}%`, backgroundColor: '#7FA99B' }} />
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
                        {order.order_number || order.id.slice(0, 8)}
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
                {lowStockProducts.map(p => {
                  const qty = stockOf(p);
                  const st = stockStatus(qty, p.reorder_level);
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color} shrink-0`}>{qty} left</span>
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
