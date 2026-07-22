// One-time, boot-time R2 public-host migration (idempotent).
//
// Product/CMS/review image URLs are stored in the DB as ABSOLUTE URLs baked at
// upload time (server/imageOptimize.js → storage.publicUrl()). Early uploads
// were stored with the bucket's auto-generated raw r2.dev public host:
//   https://pub-a73adc77083a4bdc89b8ad4e7eba0e1c.r2.dev
// The custom domain served by R2_PUBLIC_BASE_URL (https://images.miniyokids.com)
// now fronts the SAME bucket — and has Cloudflare Image Resizing + a 30-day
// edge-cache rule — so every previously stored URL can be fixed with a pure
// string-prefix swap. Object KEYS are identical on both hosts.
//
// Design (same pattern as Aura-wear-lb PR #44 / Trending-stores-ecommerce PR #36):
//  • Runs at every boot, after schema init + seed. Idempotent: once no doc
//    contains the old prefix, every subsequent boot updates 0 rows.
//  • Driven by the RUNTIME R2_PUBLIC_BASE_URL — the same var new uploads use,
//    so config can never drift between "where new URLs point" and "where old
//    URLs were rewritten to". Skips silently when the var is unset (local dev
//    / disk backend) or already equal to the legacy host.
//  • Raw SQL REPLACE on the doc column only; ids and updated_date are left
//    untouched so this stays invisible to the storefront and admin audit.
//  • Never throws: a failure logs a warning and boot continues (the old r2.dev
//    URLs still serve, so a skipped migration is degraded, not fatal).

import { db } from './db.js';

// Legacy auto-generated R2 dev hosts previously baked into stored URLs. The
// r2.dev host is bucket-specific and public (not a secret).
const LEGACY_PUBLIC_BASES = [
  'https://pub-a73adc77083a4bdc89b8ad4e7eba0e1c.r2.dev',
];

// Content tables whose docs can carry image URLs:
//   Product        image_url + gallery arrays
//   ProductImage   url + variants { large, card, thumb }
//   ProductVariant image_url overrides per variant
//   Category       tile image_url
//   Collection     collection artwork
//   CmsSection     hero/banner image_url, gallery_json (Instagram strip), bodies
//   MediaAsset     curated asset url (Instagram strip legacy source)
//   SiteSetting    logos / social share images
//   Review         customer photo attachments
//   Campaign       campaign artwork
// Order/OrderItem/EmailLog/AuditLog etc. are intentionally excluded: they are
// records of past events, not storefront content, and must never be rewritten.
const IMAGE_TABLES = [
  'e_Product',
  'e_ProductImage',
  'e_ProductVariant',
  'e_Category',
  'e_Collection',
  'e_CmsSection',
  'e_MediaAsset',
  'e_SiteSetting',
  'e_Review',
  'e_Campaign',
];

function trimSlashes(s) {
  return String(s || '').replace(/\/+$/, '');
}

export function runR2HostMigration(env = process.env, log = console.log) {
  try {
    const newBase = trimSlashes(env.R2_PUBLIC_BASE_URL);
    if (!newBase) return { migrated: false, rows: 0, skipped: 'R2_PUBLIC_BASE_URL unset' };

    const legacyBases = LEGACY_PUBLIC_BASES.filter((b) => b !== newBase);
    if (legacyBases.length === 0) return { migrated: false, rows: 0, skipped: 'nothing to rewrite' };

    let total = 0;
    for (const table of IMAGE_TABLES) {
      let perTable = 0;
      for (const legacy of legacyBases) {
        // SQLite REPLACE() is a literal string replace over the whole JSON doc,
        // so it covers image_url, variants/image_variants maps, gallery_json,
        // CMS bodies, review photos, and any future image-bearing field without
        // an explicit column list.
        const { changes } = db
          .prepare(`UPDATE ${table} SET doc = REPLACE(doc, ?, ?) WHERE instr(doc, ?) > 0`)
          .run(legacy, newBase, legacy);
        perTable += changes;
      }
      if (perTable > 0) {
        log(`[r2-host-migration] ${table}: rewrote ${perTable} row(s) -> ${newBase}`);
        total += perTable;
      }
    }
    if (total > 0) {
      log(`[r2-host-migration] done: ${total} row(s) now on ${newBase}`);
    }
    return { migrated: total > 0, rows: total };
  } catch (e) {
    console.warn(`[r2-host-migration] skipped after error: ${e?.message}`);
    return { migrated: false, rows: 0, error: e?.message };
  }
}
