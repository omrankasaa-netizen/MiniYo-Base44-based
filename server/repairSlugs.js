// One-time, idempotent repair for duplicate product slugs.
//
// The product page looks a product up by slug (Product.filter({ slug }, …, 1)),
// so if two products share a slug the page silently shows the wrong product's
// photos and details. Past bulk imports / manual saves could create collisions
// because slugs were derived from the name with no uniqueness check.
//
// This runs at server startup. It scans every product, keeps the slug on the
// EARLIEST-created record in each colliding group (so existing/shared links keep
// pointing at the original item), and rewrites the slug on the newer duplicates
// to "<slug>-2", "<slug>-3", … choosing the first suffix that is globally free.
// It only writes when a change is needed, so repeated boots are no-ops.

import { queryRecords, updateRecord } from './db.js';

function createdAt(p) {
  // Fall back to id ordering when timestamps are missing so the result is stable.
  return p.created_date || p.created_at || p.createdAt || '';
}

export function repairDuplicateSlugs() {
  let products;
  try {
    products = queryRecords('Product', {});
  } catch (e) {
    console.error('[repairSlugs] could not read products:', e.message);
    return { scanned: 0, fixed: 0 };
  }

  // Group by current slug (lowercased). Empty/null slugs are left untouched here.
  const groups = new Map();
  for (const p of products) {
    const slug = (p.slug || '').toLowerCase();
    if (!slug) continue;
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(p);
  }

  // Every slug currently in use is "taken" (so new suffixes never collide with
  // an unrelated existing slug).
  const taken = new Set(groups.keys());

  let fixed = 0;
  for (const [slug, recs] of groups.entries()) {
    if (recs.length < 2) continue; // no collision
    // Keep the earliest-created record on the original slug.
    recs.sort((a, b) => String(createdAt(a)).localeCompare(String(createdAt(b)))
      || String(a.id).localeCompare(String(b.id)));
    const [, ...dupes] = recs;
    for (const dup of dupes) {
      let i = 2;
      while (taken.has(`${slug}-${i}`)) i += 1;
      const next = `${slug}-${i}`;
      taken.add(next);
      try {
        updateRecord('Product', dup.id, { slug: next });
        fixed += 1;
        console.log(`[repairSlugs] "${slug}" -> "${next}" (product ${dup.id}: ${dup.name || ''})`);
      } catch (e) {
        console.error(`[repairSlugs] failed to update product ${dup.id}:`, e.message);
      }
    }
  }

  if (fixed > 0) {
    console.log(`[repairSlugs] fixed ${fixed} duplicate slug(s) across ${products.length} products`);
  }
  return { scanned: products.length, fixed };
}
