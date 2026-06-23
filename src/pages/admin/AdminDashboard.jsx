import React from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import AdminLayout from '@/components/admin/AdminLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, TrendingUp, AlertTriangle, XCircle, BarChart2, ArrowRight, Tag, Percent, Megaphone } from 'lucide-react';
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

function KpiCard({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-muted-foreground font-medium leading-tight">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-heading font-bold text-foreground">
          {loading ? <span className="inline-block w-12 h-6 bg-muted rounded animate-pulse" /> : (value ?? '—')}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// The global QueryClient disables refetchOnWindowFocus and sets no staleTime,
// so once the dashboard's data was cached it never refreshed while the admin
// kept the SPA open — new orders, stock changes, etc. only appeared after a hard
// reload. These options make every dashboard query refetch on mount, on window
// focus, and on a 60s interval so the KPIs always reflect current data.
const LIVE = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
};

export default function AdminDashboard() {
  const { currentUser, canAccess } = useAuthUser();
  const navigate = useNavigate();

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

  // ── KPI calculations ─────────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const ordersThisMonth = orders.filter(o => new Date(o.order_date || o.created_date) >= monthStart);
  const revenueOrders = ordersThisMonth.filter(o => ['Confirmed', 'Packed', 'Out for Delivery', 'Delivered'].includes(o.order_status));
  const revenueThisMonth = revenueOrders.reduce((s, o) => s + (o.grand_total_usd || 0), 0);

  const deliveryFees = revenueOrders.reduce((s, o) => s + (o.delivery_fee_usd || 0), 0);
  const productsWithCost = products.filter(p => p.cost_usd > 0);
  const costDataComplete = productsWithCost.length === products.length;
  const avgCostRatio = products.length > 0 && productsWithCost.length > 0
    ? productsWithCost.reduce((s, p) => s + (p.cost_usd / Math.max(p.price_usd, 1)), 0) / productsWithCost.length
    : null;
  const estProfit = avgCostRatio !== null
    ? revenueThisMonth - deliveryFees - (revenueThisMonth * avgCostRatio)
    : null;

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  let totalStock = 0, lowStockCount = 0, outOfStockCount = 0;
  for (const p of products) {
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) {
      for (const v of pvs) {
        const q = v.qty_on_hand || 0;
        totalStock += q;
        if (q <= 0) outOfStockCount++;
        else if (q <= (p.reorder_level || 3)) lowStockCount++;
      }
    } else {
      const q = p.stock_quantity || 0;
      totalStock += q;
      if (q <= 0) outOfStockCount++;
      else if (q <= (p.reorder_level || 3)) lowStockCount++;
    }
  }

  const lowStockProducts = products.filter(p => {
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) return pvs.some(v => (v.qty_on_hand || 0) <= (p.reorder_level || 3));
    return (p.stock_quantity || 0) <= (p.reorder_level || 3);
  }).slice(0, 6);

  const recentOrders = [...orders].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 10);

  // Active promotions
  const activePromoCodes = promoCodes.filter(c => {
    if (!c.is_active) return false;
    if (c.valid_from && new Date(c.valid_from) > now) return false;
    if (c.valid_until && new Date(c.valid_until) < now) return false;
    if (c.usage_limit && c.times_used >= c.usage_limit) return false;
    return true;
  });
  const liveDiscounts = discounts.filter(isDiscountLive);
  const liveCampaigns = campaigns.filter(isCampaignLive);
  const hasActivePromos = activePromoCodes.length > 0 || liveDiscounts.length > 0 || liveCampaigns.length > 0;

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

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard icon={Package}       label="Total Products"       value={products.length}                          color="bg-primary/10 text-primary"                loading={loadingProducts} />
          <KpiCard icon={Package}       label="Items in Stock"        value={totalStock}                               color="bg-secondary/20 text-secondary"            loading={loadingProducts} />
          <KpiCard icon={AlertTriangle} label="Low Stock"             value={lowStockCount}                            color="bg-amber-50 text-amber-600"                loading={loadingProducts} />
          <KpiCard icon={XCircle}       label="Out of Stock"          value={outOfStockCount}                          color="bg-destructive/10 text-destructive"         loading={loadingProducts} />
          <KpiCard icon={ShoppingBag}   label="Orders This Month"     value={ordersThisMonth.length}                   color="bg-blue-50 text-blue-600"                  loading={loadingOrders} />
          {canAccess('view_finances') && (
            <>
              <KpiCard icon={TrendingUp}  label="Revenue This Month"    value={`$${revenueThisMonth.toFixed(2)}`}        color="bg-green-50 text-green-700"                loading={loadingOrders} />
              <KpiCard
                icon={BarChart2}
                label="Est. Gross Profit"
                value={estProfit !== null ? `$${estProfit.toFixed(2)}` : '—'}
                sub={!costDataComplete ? `Note: ${products.length - productsWithCost.length} products missing cost_usd` : undefined}
                color="bg-violet-50 text-violet-700"
                loading={loadingOrders || loadingProducts}
              />
            </>
          )}
        </div>

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
                    <p className="text-sm font-semibold text-foreground">${(order.grand_total_usd || 0).toFixed(2)}</p>
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
                const pvs = variantsByProduct[p.id] || [];
                const qty = (p.has_variants && pvs.length > 0)
                  ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
                  : (p.stock_quantity || 0);
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
    </AdminLayout>
  );
}