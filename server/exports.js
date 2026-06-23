import { queryRecords } from './db.js';

// ─── CSV / export builders + customer aggregation ────────────────────────────
// All builders take the calling `user` and OMIT every monetary field for
// non-super-admins (consistent with the dashboard money lockdown in
// dashboard.js): cost, stock value, total spent, and AOV never reach a regular
// admin's browser. Operational columns are returned to any admin.

function isSuper(user) {
  return !!user && user.role === 'super_admin';
}

const NON_SPEND_STATUSES = new Set(['Cancelled']);

// ── CSV primitives ───────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) { return cells.map(csvCell).join(','); }
function stamp() { return new Date().toISOString().slice(0, 10); }

// ── Stock helpers (mirror dashboard/inventory logic) ─────────────────────────
function variantsByProductMap(variants) {
  const map = {};
  for (const v of variants) (map[v.product_id] ||= []).push(v);
  return map;
}
function stockOf(p, pvs) {
  return (p.has_variants && pvs.length > 0)
    ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
    : (p.stock_quantity || 0);
}

// ── Products CSV ─────────────────────────────────────────────────────────────
// Selling price is public (shown on the storefront) so it is included for any
// admin. Cost and cost-based stock value are owner-only.
export function buildProductsCsv(user, opts = {}) {
  const showMoney = isSuper(user);
  const products = queryRecords('Product', { sort: '-created_date', limit: 5000 });
  const variants = queryRecords('ProductVariant', { limit: 20000 });
  const categories = queryRecords('Category', { limit: 2000 });
  const images = queryRecords('ProductImage', { limit: 20000 });

  const byProduct = variantsByProductMap(variants);
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const imgByProduct = {};
  for (const img of images) {
    const cur = imgByProduct[img.product_id];
    if (!cur || (img.is_primary && !cur.is_primary)) imgByProduct[img.product_id] = img;
  }

  const header = ['SKU', 'Name (EN)', 'Name (AR)', 'Category', 'Gender', 'Age Group',
    'Selling Price (USD)', 'Compare-at (USD)', 'Stock', 'Active', 'Slug', 'Image URL'];
  if (showMoney) header.push('Cost (USD)', 'Stock Value at Cost (USD)');

  const lines = [csvRow(header)];
  for (const p of products) {
    const pvs = byProduct[p.id] || [];
    const units = stockOf(p, pvs);
    const row = [
      p.sku || '',
      p.name || '',
      p.name_ar || '',
      catName[p.category_id] || '',
      p.gender || '',
      p.age_group || '',
      Number(p.price_usd || 0).toFixed(2),
      p.compare_at_price_usd ? Number(p.compare_at_price_usd).toFixed(2) : '',
      units,
      (p.status || 'Active') === 'Active' ? 'Yes' : 'No',
      p.slug || '',
      imgByProduct[p.id]?.url || '',
    ];
    if (showMoney) {
      row.push(Number(p.cost_usd || 0).toFixed(2), (Number(p.cost_usd || 0) * units).toFixed(2));
    }
    lines.push(csvRow(row));
  }
  const scope = showMoney ? 'financial' : 'operational';
  return { filename: `miniyo-products-${scope}-${stamp()}.csv`, csv: lines.join('\n'), rows: products.length };
}

// ── Inventory CSV ────────────────────────────────────────────────────────────
// One row per variant (or per product when it has no variants). Cost, price and
// stock value are owner-only per the money lockdown.
export function buildInventoryCsv(user, opts = {}) {
  const showMoney = isSuper(user);
  const products = queryRecords('Product', { sort: '-created_date', limit: 5000 });
  const variants = queryRecords('ProductVariant', { limit: 20000 });
  const byProduct = variantsByProductMap(variants);

  const header = ['Product', 'SKU', 'Variant', 'Qty on Hand', 'Product Total Stock',
    'Reorder Level', 'Low Stock'];
  if (showMoney) header.push('Unit Cost (USD)', 'Unit Price (USD)', 'Stock Value at Cost (USD)');

  const lines = [csvRow(header)];
  let rowCount = 0;
  for (const p of products) {
    const pvs = byProduct[p.id] || [];
    const reorder = p.reorder_level ?? 3;
    const total = stockOf(p, pvs);
    const cost = Number(p.cost_usd || 0);
    const price = Number(p.price_usd || 0);

    const emit = (variantLabel, sku, qty) => {
      const row = [p.name || '', sku || '', variantLabel || '', qty, total, reorder,
        qty <= reorder ? 'Yes' : 'No'];
      if (showMoney) row.push(cost.toFixed(2), price.toFixed(2), (cost * qty).toFixed(2));
      lines.push(csvRow(row));
      rowCount++;
    };

    if (p.has_variants && pvs.length > 0) {
      for (const v of pvs) {
        emit([v.size, v.color].filter(Boolean).join(' / '), v.variant_sku || p.sku, v.qty_on_hand || 0);
      }
    } else {
      emit('', p.sku, p.stock_quantity || 0);
    }
  }
  const scope = showMoney ? 'financial' : 'operational';
  return { filename: `miniyo-inventory-${scope}-${stamp()}.csv`, csv: lines.join('\n'), rows: rowCount };
}

// ── Customer aggregation (shared by list, detail and CSV) ────────────────────
// Indexes orders by customer_id and by lowercased email so both registered and
// guest-linked orders attach to the right customer.
function indexOrders(orders) {
  const byId = {};
  const byEmail = {};
  for (const o of orders) {
    if (o.customer_id) (byId[o.customer_id] ||= []).push(o);
    const em = (o.customer_email || '').toLowerCase();
    if (em) (byEmail[em] ||= []).push(o);
  }
  return { byId, byEmail };
}

function ordersForCustomer(customer, idx) {
  const fromId = idx.byId[customer.id] || [];
  if (fromId.length) return fromId;
  const em = (customer.email || '').toLowerCase();
  return em ? (idx.byEmail[em] || []) : [];
}

const orderTime = (o) => new Date(o.order_date || o.created_date || 0).getTime();
const spendOf = (orders) => orders
  .filter((o) => !NON_SPEND_STATUSES.has(o.order_status))
  .reduce((s, o) => s + (o.grand_total_usd || 0), 0);

// Enriched, money-gated customer list. Money fields (total_spent, aov) are
// omitted entirely for non-super-admins.
export function aggregateCustomers(user) {
  const showMoney = isSuper(user);
  const customers = queryRecords('Customer', { sort: '-created_date', limit: 5000 });
  const orders = queryRecords('Order', { limit: 20000 });
  const users = queryRecords('User', { limit: 5000 });
  const idx = indexOrders(orders);
  const accountEmails = new Set(users.map((u) => (u.email || '').toLowerCase()).filter(Boolean));

  const rows = customers.map((c) => {
    const co = ordersForCustomer(c, idx);
    const sorted = [...co].sort((a, b) => orderTime(b) - orderTime(a));
    const last = sorted[0];
    const orderCount = co.length || c.total_orders || 0;
    const spent = spendOf(co) || c.total_spent_usd || 0;
    const base = {
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      location: last ? [last.city, last.district].filter(Boolean).join(', ') : '',
      order_count: orderCount,
      last_order_date: last ? (last.order_date || last.created_date || '') : '',
      tier: c.current_tier || c.membership_tier || 'Bronze',
      is_account: accountEmails.has((c.email || '').toLowerCase()),
      tags: Array.isArray(c.tags) ? c.tags : [],
      notes: c.notes || '',
      is_blocked: !!c.is_blocked,
      block_reason: c.block_reason || '',
      created_date: c.created_date || '',
    };
    if (showMoney) {
      base.total_spent = spent;
      base.aov = orderCount > 0 ? spent / orderCount : 0;
    }
    return base;
  });
  return { show_money: showMoney, customers: rows };
}

// Full detail for one customer: profile, lifetime metrics (money gated) and the
// complete order history (operational always; per-order total gated).
export function getCustomerDetail(user, customerId) {
  const showMoney = isSuper(user);
  const customers = queryRecords('Customer', { query: { id: customerId } });
  const customer = customers[0] || queryRecords('Customer', { limit: 5000 }).find((c) => c.id === customerId);
  if (!customer) return { _status: 404, error: 'Customer not found' };

  const allOrders = queryRecords('Order', { limit: 20000 });
  const idx = indexOrders(allOrders);
  const co = ordersForCustomer(customer, idx).sort((a, b) => orderTime(b) - orderTime(a));
  const orderIds = new Set(co.map((o) => o.id));
  const items = queryRecords('OrderItem', { limit: 50000 }).filter((it) => orderIds.has(it.order_id));
  const itemsByOrder = {};
  for (const it of items) (itemsByOrder[it.order_id] ||= []).push(it);

  const users = queryRecords('User', { limit: 5000 });
  const isAccount = new Set(users.map((u) => (u.email || '').toLowerCase())).has((customer.email || '').toLowerCase());

  const orders = co.map((o) => {
    const its = itemsByOrder[o.id] || [];
    const row = {
      id: o.id,
      order_number: o.order_number || String(o.id).slice(0, 8),
      order_date: o.order_date || o.created_date || '',
      order_status: o.order_status || '',
      item_count: its.reduce((s, it) => s + (it.quantity || 0), 0),
      items: its.map((it) => ({
        product_name: it.product_name || '',
        size: it.size || '',
        color: it.color || '',
        quantity: it.quantity || 0,
      })),
    };
    if (showMoney) row.grand_total_usd = o.grand_total_usd || 0;
    return row;
  });

  const spent = spendOf(co);
  const profile = {
    id: customer.id,
    name: customer.name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    tier: customer.current_tier || customer.membership_tier || 'Bronze',
    is_account: isAccount,
    is_blocked: !!customer.is_blocked,
    block_reason: customer.block_reason || '',
    tags: Array.isArray(customer.tags) ? customer.tags : [],
    notes: customer.notes || '',
    created_date: customer.created_date || '',
    location: orders[0] ? '' : '',
  };
  const metrics = { order_count: co.length };
  if (showMoney) {
    metrics.total_spent = spent;
    metrics.aov = co.length > 0 ? spent / co.length : 0;
  }
  return { show_money: showMoney, profile, metrics, orders };
}

// ── Customers CSV ────────────────────────────────────────────────────────────
export function buildCustomersCsv(user, opts = {}) {
  const showMoney = isSuper(user);
  const { customers } = aggregateCustomers(user);
  const ids = Array.isArray(opts.ids) && opts.ids.length ? new Set(opts.ids) : null;
  const rows = ids ? customers.filter((c) => ids.has(c.id)) : customers;

  const header = ['Name', 'Email', 'Phone', 'Location', 'Orders', 'Last Order',
    'Type', 'Tier', 'Tags', 'Blocked', 'Created'];
  if (showMoney) header.splice(5, 0, 'Total Spent (USD)'); // after Orders

  const lines = [csvRow(header)];
  for (const c of rows) {
    const row = [
      c.name, c.email, c.phone, c.location, c.order_count,
      (c.last_order_date || '').slice(0, 10),
      c.is_account ? 'Account' : 'Guest',
      c.tier, (c.tags || []).join('; '),
      c.is_blocked ? 'Yes' : 'No',
      (c.created_date || '').slice(0, 10),
    ];
    if (showMoney) row.splice(5, 0, Number(c.total_spent || 0).toFixed(2));
    lines.push(csvRow(row));
  }
  const scope = showMoney ? 'financial' : 'operational';
  return { filename: `miniyo-customers-${scope}-${stamp()}.csv`, csv: lines.join('\n'), rows: rows.length };
}

// ── Customer emails CSV (name + email only) for Mailchimp/Brevo ──────────────
export function buildCustomerEmailsCsv(user, opts = {}) {
  const { customers } = aggregateCustomers(user);
  const ids = Array.isArray(opts.ids) && opts.ids.length ? new Set(opts.ids) : null;
  const rows = (ids ? customers.filter((c) => ids.has(c.id)) : customers)
    .filter((c) => c.email && !c.is_blocked);

  const lines = [csvRow(['Name', 'Email'])];
  for (const c of rows) lines.push(csvRow([c.name, c.email]));
  return { filename: `miniyo-customer-emails-${stamp()}.csv`, csv: lines.join('\n'), rows: rows.length };
}
