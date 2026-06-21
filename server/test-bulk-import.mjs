// Ad-hoc end-to-end test for the bulk import system. Uses a throwaway DB.
// Run: MINIYO_DB_PATH=/tmp/bulk-test.db node server/test-bulk-import.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';

const DB = '/tmp/bulk-test.db';
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.rmSync(DB + s, { force: true }); } catch {} }
process.env.MINIYO_DB_PATH = DB;

const { initSchema, createRecord, queryRecords, countRecords } = await import('./db.js');
const { bulkImportProducts, cleanupSeedProducts } = await import('./bulkImport.js');

initSchema();

// Seed: 1 category + 2 "seed" products (mimicking seed.js markers).
createRecord('Category', { slug: 'bodysuits', name: 'Bodysuits', is_active: true, source: 'seed' });
createRecord('Product', { slug: 'seed-a', sku: 'SEED-A', name: 'Seed A', price_usd: 5, source: 'seed', category_id: null });
createRecord('Product', { slug: 'seed-b', sku: 'SEED-B', name: 'Seed B', price_usd: 6, source: 'seed' });
// A manual product (NO seed marker) that must survive cleanup.
createRecord('Product', { slug: 'manual-keep', sku: 'MANUAL-1', name: 'Manual Keeper', price_usd: 9 });

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok:', msg); };

// Build a tiny xlsx in memory.
function makeSheet(rows) {
  const header = ['sku','handle','name_en','name_ar','description_en','description_ar','short_description_en','short_description_ar','category','subcategory','gender','age_group','price','compare_at_price','cost','is_new','is_trending','is_featured','is_active','video_url','tags','sizes','images'];
  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf.toString('base64');
}

// 2-image zip (1x1 png bytes).
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c63f80f00010101001b03c2e30000000049454e44ae426082', 'hex');
const zip = new AdmZip();
zip.addFile('NEW1_1.jpg', png);
zip.addFile('NEW1_2.jpg', png);
const zipB64 = zip.toBuffer().toString('base64');

// Row 1: brand new product w/ variants + 2 images + new category.
// Row 2: update existing manual product (price change, blank images => preserve).
// Row 3: bad row (no price).
const rowsV1 = [
  ['NEW1','bunny','Bunny Bodysuit','بدلة أرنب','desc','وصف','short','قصير','Bodysuits','','Girls','Newborn','12.99','15.99','5','yes','no','no','yes','','cotton','0-3M:5, 3-6M:8','NEW1_1.jpg, NEW1_2.jpg'],
  ['MANUAL-1','','Manual Keeper Updated','','','','','','Bodysuits','','Unisex','Baby','11','','','no','no','yes','yes','','','', ''],
  ['','','No SKU No Price','','','','','','Hats','','','','','','','','','','','','','',''],
];

// DRY RUN
let r = await bulkImportProducts({ spreadsheet: { base64: makeSheet(rowsV1), filename: 'p.xlsx' }, imagesZip: { base64: zipB64, filename: 'i.zip' }, dryRun: true });
console.log('\n[dry-run]', JSON.stringify(r.summary));
assert(r.summary.toCreate === 1, 'dry-run: 1 to create');
assert(r.summary.toUpdate === 1, 'dry-run: 1 to update (MANUAL-1)');
assert(r.summary.errorRows === 1, 'dry-run: 1 error row');
assert(countRecords('Product') === 3, 'dry-run wrote nothing (still 3 products)');

// COMMIT
r = await bulkImportProducts({ spreadsheet: { base64: makeSheet(rowsV1), filename: 'p.xlsx' }, imagesZip: { base64: zipB64, filename: 'i.zip' } });
console.log('[commit]', JSON.stringify(r.summary));
assert(r.summary.created === 1, 'commit: 1 created');
assert(r.summary.updated === 1, 'commit: 1 updated');
const newProd = queryRecords('Product', { query: { sku: 'NEW1' } })[0];
assert(!!newProd, 'NEW1 product exists');
assert(newProd.has_variants === true, 'NEW1 has_variants true');
assert(newProd.category_id, 'NEW1 has a category_id (Bodysuits matched)');
const newVariants = queryRecords('ProductVariant', { query: { product_id: newProd.id } });
assert(newVariants.length === 2, 'NEW1 has 2 variants');
assert(newVariants.reduce((s,v)=>s+v.qty_on_hand,0) === 13, 'NEW1 variant stock totals 13');
const newImgs = queryRecords('ProductImage', { query: { product_id: newProd.id } });
assert(newImgs.length === 2, 'NEW1 has 2 images');
assert(newImgs.find(i=>i.is_primary), 'NEW1 has a primary image');
assert(newProd.image_url && newProd.image_url.startsWith('/uploads/'), 'NEW1 image_url synced to primary');
const updated = queryRecords('Product', { query: { sku: 'MANUAL-1' } })[0];
assert(updated.price_usd === 11, 'MANUAL-1 price updated to 11');
assert(updated.name === 'Manual Keeper Updated', 'MANUAL-1 name updated');

// RE-IMPORT (correct the same NEW1 row): price change + stock change, no dup.
const rowsV2 = [
  ['NEW1','bunny','Bunny Bodysuit','بدلة أرنب','desc','وصف','short','قصير','Bodysuits','','Girls','Newborn','10.50','','5','yes','no','no','yes','','cotton','0-3M:2, 3-6M:1','NEW1_1.jpg'],
];
const before = countRecords('Product');
r = await bulkImportProducts({ spreadsheet: { base64: makeSheet(rowsV2), filename: 'p.xlsx' }, imagesZip: { base64: zipB64, filename: 'i.zip' } });
console.log('[re-import]', JSON.stringify(r.summary));
assert(countRecords('Product') === before, 're-import did NOT duplicate (count unchanged)');
const reNew = queryRecords('Product', { query: { sku: 'NEW1' } })[0];
assert(reNew.price_usd === 10.50, 're-import updated NEW1 price to 10.50');
const reVars = queryRecords('ProductVariant', { query: { product_id: reNew.id } });
assert(reVars.find(v=>v.size==='0-3M').qty_on_hand === 2, 're-import updated 0-3M stock to 2');
const reImgs = queryRecords('ProductImage', { query: { product_id: reNew.id } });
assert(reImgs.length === 1, 're-import replaced images (now 1)');

// Blank-images preservation: re-import NEW1 with blank images keeps the 1 image.
const rowsBlank = [['NEW1','bunny','Bunny Bodysuit','','','','','','Bodysuits','','Girls','Newborn','10.50','','','','','','yes','','','0-3M:2','']];
await bulkImportProducts({ spreadsheet: { base64: makeSheet(rowsBlank), filename: 'p.xlsx' } });
assert(queryRecords('ProductImage', { query: { product_id: reNew.id } }).length === 1, 'blank images column preserved existing images');

// CLEANUP — only seed products go; manual + imported survive.
let c = cleanupSeedProducts({ dryRun: true });
console.log('[cleanup dry]', JSON.stringify(c));
assert(c.productsToDelete === 2, 'cleanup dry-run reports 2 seed products');
c = cleanupSeedProducts({});
console.log('[cleanup]', JSON.stringify(c));
assert(c.productsDeleted === 2, 'cleanup deleted 2 seed products');
assert(queryRecords('Product', { query: { sku: 'SEED-A' } }).length === 0, 'SEED-A gone');
assert(queryRecords('Product', { query: { sku: 'MANUAL-1' } }).length === 1, 'MANUAL-1 survived');
assert(queryRecords('Product', { query: { sku: 'NEW1' } }).length === 1, 'imported NEW1 survived');
// Idempotent second run.
c = cleanupSeedProducts({});
assert(c.productsDeleted === 0, 'cleanup is idempotent (0 on second run)');

console.log('\nALL TESTS PASSED');
