import { queryRecords } from './db.js';

// ─── Dashboard aggregates ────────────────────────────────────────────────────
// All KPI/aggregate computation lives here so the financial figures (revenue,
// AOV, COGS, potential revenue, margin, per-order totals) can be STRIPPED
// server-side for non-super-admin callers — money never reaches their browser.
// A small in-memory TTL cache avoids recomputing the full snapshot on every poll.

const REVENUE_STATUSES = ['Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
const OPEN_STATUSES = ['New', 'Confirmed', 'Packed', 'Out for Delivery'];
const ALL_STATUSES = ['New', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'];

const ms = (days) => days * 24 * 60 * 60 * 1000;
const orderTime = (o) => new Date(o.order_date || o.created_date).getTime();

function isSuper(user) {
  return !!user && user.role === 'super_admin';
}

// ── TTL cache for the full (super-admin-complete) snapshot ───────────────────
const CACHE_TTL_MS = 45_000; // never serve data older than ~45s
let _cache = null; // { at:number, snapshot:object }

export function invalidateDashboardCache() {
  _cache = null;
}

// Build the complete snapshot (always includes money). Role-based stripping is
// applied afterwards by shapeForRole().
function computeSnapshot() {
  const orders = queryRecords('Order', { sort: '-created_date', limit: 1000 });
  const products = queryRecords('Product', { limit: 2000 });
  const variants = queryRecords('ProductVariant', { limit: 5000 });
  const categories = queryRecords('Category', { limit: 1000 });
  const customers = queryRecords('Customer', { limit: 5000 });
  const orderItems = queryRecords('OrderItem', { limit: 10000 });

  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const todayMs = startToday.getTime();

  const revenueOrders = orders.filter((o) => REVENUE_STATUSES.includes(o.order_status));

  const windowStats = (fromMs, toMs) => {
    let count = 0; let revenue = 0;
    for (const o of revenueOrders) {
      const t = orderTime(o);
      if (t >= fromMs && t < toMs) { count++; revenue += (o.grand_total_usd || 0); }
    }
    return { count, revenue };
  };

  const today = windowStats(todayMs, now + 1);
  const yesterday = windowStats(todayMs - ms(1), todayMs);
  const last7 = windowStats(now - ms(7), now + 1);
  const prev7 = windowStats(now - ms(14), now - ms(7));
  const last30 = windowStats(now - ms(30), now + 1);
  const prev30 = windowStats(now - ms(60), now - ms(30));

  const aov30 = last30.count > 0 ? last30.revenue / last30.count : 0;
  const aovPrev = prev30.count > 0 ? prev30.revenue / prev30.count : 0;

  // 14-day sparkline buckets (oldest → newest)
  const sparkOrders = []; const sparkRevenue = [];
  for (let i = 13; i >= 0; i--) {
    const from = todayMs - ms(i);
    const s = windowStats(from, from + ms(1));
    sparkOrders.push(s.count);
    sparkRevenue.push(s.revenue);
  }

  const statusCounts = {};
  for (const st of ALL_STATUSES) statusCounts[st] = 0;
  for (const o of orders) {
    statusCounts[o.order_status] = (statusCounts[o.order_status] || 0) + 1;
  }
  const openCount = OPEN_STATUSES.reduce((s, st) => s + (statusCounts[st] || 0), 0);

  // Inventory
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);
  const stockOf = (p) => {
    const pvs = variantsByProduct[p.id] || [];
    return (p.has_variants && pvs.length > 0)
      ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
      : (p.stock_quantity || 0);
  };

  let totalStock = 0; let lowStockCount = 0; let outOfStockCount = 0;
  let inventoryCost = 0; let potentialRevenue = 0;
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
  const grossMarginPct = potentialRevenue > 0
    ? ((potentialRevenue - inventoryCost) / potentialRevenue) * 100
    : null;

  const activeProducts = products.filter((p) => (p.status || 'Active') === 'Active').length;
  const activeCategories = categories.filter((c) => c.is_active !== false).length;

  const lowStockList = products.filter((p) => {
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) return pvs.some((v) => (v.qty_on_hand || 0) <= (p.reorder_level || 3));
    return (p.stock_quantity || 0) <= (p.reorder_level || 3);
  }).slice(0, 6).map((p) => ({
    id: p.id, name: p.name, sku: p.sku,
    qty: stockOf(p), reorder_level: p.reorder_level || 3,
  }));

  const newCustomers30 = customers.filter((c) => new Date(c.created_date).getTime() >= now - ms(30)).length;
  const repeatCustomers = customers.filter((c) => (c.total_orders || 0) > 1).length;

  // Top sellers (30d by units)
  const recentRevenueOrderIds = new Set(
    revenueOrders.filter((o) => orderTime(o) >= now - ms(30)).map((o) => o.id),
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

  const recent = [...orders]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 8)
    .map((o) => ({
      id: o.id,
      order_number: o.order_number || String(o.id).slice(0, 8),
      customer_name: o.customer_name || '',
      order_status: o.order_status,
      grand_total_usd: o.grand_total_usd || 0,
    }));

  return {
    generated_at: new Date(now).toISOString(),
    orders: {
      today, yesterday, last7, prev7, last30, prev30,
      aov30, aovPrev,
      spark: { orders: sparkOrders, revenue: sparkRevenue },
      status_counts: statusCounts,
      open_count: openCount,
      recent,
    },
    products: {
      active: activeProducts,
      total: products.length,
      categories_active: activeCategories,
      total_stock: totalStock,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      inventory_cost: inventoryCost,
      potential_revenue: potentialRevenue,
      gross_margin_pct: grossMarginPct,
      low_stock_list: lowStockList,
    },
    customers: { new30: newCustomers30, repeat: repeatCustomers },
    top_products: topProducts,
  };
}

function getCachedSnapshot() {
  const now = Date.now();
  if (_cache && (now - _cache.at) < CACHE_TTL_MS) return _cache.snapshot;
  const snapshot = computeSnapshot();
  _cache = { at: now, snapshot };
  return snapshot;
}

// Custom [from,to] window stats — computed fresh (not cached); used by the
// date-range filter. Includes revenue only; caller strips for non-super.
function rangeStats(fromMs, toMs) {
  const orders = queryRecords('Order', { limit: 5000 });
  let count = 0; let revenue = 0;
  for (const o of orders) {
    if (!REVENUE_STATUSES.includes(o.order_status)) continue;
    const t = orderTime(o);
    if (t >= fromMs && t < toMs) { count++; revenue += (o.grand_total_usd || 0); }
  }
  return { count, revenue };
}

// Remove EVERY monetary field for non-super-admins so money never reaches the
// browser, even via devtools/network. Returns a role-shaped copy.
function shapeForRole(snap, user, range) {
  const showMoney = isSuper(user);
  const stripWindow = (w) => (showMoney ? { count: w.count, revenue: w.revenue } : { count: w.count });

  const o = snap.orders;
  const shaped = {
    generated_at: snap.generated_at,
    show_money: showMoney,
    orders: {
      today: stripWindow(o.today),
      yesterday: stripWindow(o.yesterday),
      last7: stripWindow(o.last7),
      prev7: stripWindow(o.prev7),
      last30: stripWindow(o.last30),
      prev30: stripWindow(o.prev30),
      spark: { orders: o.spark.orders, ...(showMoney ? { revenue: o.spark.revenue } : {}) },
      status_counts: o.status_counts,
      open_count: o.open_count,
      recent: o.recent.map((r) => ({
        id: r.id,
        order_number: r.order_number,
        customer_name: r.customer_name,
        order_status: r.order_status,
        ...(showMoney ? { grand_total_usd: r.grand_total_usd } : {}),
      })),
      ...(showMoney ? { aov30: o.aov30, aovPrev: o.aovPrev } : {}),
    },
    products: {
      active: snap.products.active,
      total: snap.products.total,
      categories_active: snap.products.categories_active,
      total_stock: snap.products.total_stock,
      low_stock_count: snap.products.low_stock_count,
      out_of_stock_count: snap.products.out_of_stock_count,
      low_stock_list: snap.products.low_stock_list,
      ...(showMoney ? {
        inventory_cost: snap.products.inventory_cost,
        potential_revenue: snap.products.potential_revenue,
        gross_margin_pct: snap.products.gross_margin_pct,
      } : {}),
    },
    customers: snap.customers,
    top_products: snap.top_products.map((p) => ({
      name: p.name, qty: p.qty, ...(showMoney ? { revenue: p.revenue } : {}),
    })),
  };

  if (range) {
    shaped.range = {
      from: range.from, to: range.to, count: range.count,
      ...(showMoney ? { revenue: range.revenue } : {}),
    };
  }
  return shaped;
}

function parseMs(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

// Public: role-aware dashboard metrics. `opts.from`/`opts.to` (ISO or ms) add a
// custom date-range block. Guard (admin) is enforced by the central middleware.
export function getDashboardMetrics(user, opts = {}) {
  const snap = getCachedSnapshot();
  let range = null;
  const fromMs = parseMs(opts.from);
  const toMs = parseMs(opts.to);
  if (fromMs != null && toMs != null && toMs >= fromMs) {
    const r = rangeStats(fromMs, toMs);
    range = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), ...r };
  }
  return shapeForRole(snap, user, range);
}

// ─── CSV export ──────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) { return cells.map(csvCell).join(','); }

// Operational orders CSV for admins. Monetary columns (Subtotal/Delivery/Total)
// are included ONLY for super-admins — financial data is owner-only.
export function buildOrdersCsv(user, opts = {}) {
  const showMoney = isSuper(user);
  const fromMs = parseMs(opts.from);
  const toMs = parseMs(opts.to);

  const itemsByOrder = {};
  for (const it of queryRecords('OrderItem', { limit: 20000 })) {
    (itemsByOrder[it.order_id] ||= []).push(it);
  }

  let orders = queryRecords('Order', { sort: '-created_date', limit: 10000 });
  if (fromMs != null && toMs != null) {
    orders = orders.filter((o) => { const t = orderTime(o); return t >= fromMs && t < toMs; });
  }

  const header = ['Order Number', 'Date', 'Status', 'Customer', 'Phone', 'City', 'District', 'Items'];
  if (showMoney) header.push('Subtotal (USD)', 'Delivery Fee (USD)', 'Grand Total (USD)');

  const lines = [csvRow(header)];
  for (const o of orders) {
    const items = itemsByOrder[o.id] || [];
    const itemCount = items.reduce((s, it) => s + (it.quantity || 0), 0);
    const row = [
      o.order_number || String(o.id).slice(0, 8),
      (o.order_date || o.created_date || '').slice(0, 10),
      o.order_status || '',
      o.customer_name || '',
      o.customer_phone || '',
      o.city || '',
      o.district || '',
      itemCount,
    ];
    if (showMoney) {
      const grand = Number(o.grand_total_usd || 0);
      const delivery = Number(o.delivery_fee_usd || 0);
      const subtotal = Number(o.subtotal_usd != null ? o.subtotal_usd : Math.max(0, grand - delivery));
      row.push(subtotal.toFixed(2), delivery.toFixed(2), grand.toFixed(2));
    }
    lines.push(csvRow(row));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const scope = showMoney ? 'financial' : 'operational';
  return { filename: `miniyo-orders-${scope}-${stamp}.csv`, csv: lines.join('\n'), rows: orders.length };
}
