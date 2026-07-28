#!/usr/bin/env node

const baseUrl = (process.argv[2] || 'https://miniyokids.com').replace(/\/+$/, '');

function buildEntityUrl(entity, { q, sort, limit } = {}) {
  const u = new URL(`${baseUrl}/api/entities/${entity}`);
  if (q) u.searchParams.set('q', JSON.stringify(q));
  if (sort) u.searchParams.set('sort', sort);
  if (limit != null) u.searchParams.set('limit', String(limit));
  return u.toString();
}

async function getJson(url) {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function pickProducts(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((p) => p && p.slug && p.status === 'Active')
    .slice(0, 10);
}

async function getTopProducts() {
  const featuredUrl = buildEntityUrl('Product', {
    q: { status: 'Active', is_featured: true },
    limit: 10,
  });
  let featured = [];
  try {
    featured = pickProducts(await getJson(featuredUrl));
  } catch {
    featured = [];
  }
  if (featured.length > 0) return featured;

  const fallbackUrl = buildEntityUrl('Product', {
    q: { status: 'Active' },
    limit: 10,
  });
  return pickProducts(await getJson(fallbackUrl));
}

async function hitUrl(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const cfCache = res.headers.get('cf-cache-status') || '-';
    return { url, ok: res.ok, status: res.status, cfCache };
  } catch (error) {
    return { url, ok: false, status: 'ERR', cfCache: '-', error: error?.message || String(error) };
  }
}

function productWarmUrls(product) {
  const urls = [];
  urls.push(`${baseUrl}/product/${encodeURIComponent(product.slug)}`);
  urls.push(buildEntityUrl('Product', { q: { slug: product.slug }, limit: 1 }));
  urls.push(buildEntityUrl('ProductImage', { q: { product_id: product.id }, sort: 'sort_order', limit: 20 }));
  urls.push(buildEntityUrl('ProductVariant', { q: { product_id: product.id }, sort: 'size', limit: 50 }));
  return urls;
}

async function main() {
  const urls = new Set([
    buildEntityUrl('CmsSection', { limit: 50 }),
    buildEntityUrl('SiteSetting', { limit: 100 }),
    buildEntityUrl('Category', { limit: 20 }),
  ]);

  const topProducts = await getTopProducts();
  for (const product of topProducts) {
    for (const u of productWarmUrls(product)) urls.add(u);
  }

  const allUrls = [...urls];
  const results = await Promise.all(allUrls.map((url) => hitUrl(url)));

  let okCount = 0;
  for (const r of results) {
    if (r.ok) okCount += 1;
    const status = String(r.status).padStart(3, ' ');
    console.log(`${status} | cf-cache-status=${r.cfCache} | ${r.url}`);
    if (r.error) console.log(`ERR | ${r.error}`);
  }
  console.log(`Done: ${okCount}/${results.length} successful requests.`);
}

main().catch((error) => {
  console.error(`[warm-cache] failed: ${error?.message || error}`);
  process.exit(1);
});
