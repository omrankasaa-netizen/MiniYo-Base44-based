// Generates the committed bulk-import templates (xlsx + csv) with example rows.
// Run from repo root: node scripts/make-bulk-template.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'bulk-import');
fs.mkdirSync(OUT, { recursive: true });

const HEADER = [
  'sku', 'handle', 'name_en', 'name_ar', 'description_en', 'description_ar',
  'short_description_en', 'short_description_ar', 'category', 'subcategory',
  'gender', 'age_group', 'price', 'compare_at_price', 'cost',
  'is_new', 'is_trending', 'is_featured', 'is_active',
  'video_url', 'tags', 'sizes', 'variants', 'stock_matrix', 'images',
];

// Clearly-sample rows (no real product data).
const ROWS = [
  ['SAMPLE-001', 'sample-bunny-bodysuit', 'SAMPLE Bunny Bodysuit', 'بدلة أرنب (عينة)',
    'Soft 100% cotton onesie with a bunny print.', 'قطعة قطنية ناعمة مع طبعة أرنب.',
    'Cute bunny print onesie', 'بودي سوت بطبعة أرنب',
    'Bodysuits', '', 'Girls', 'Newborn', '12', '15', '5',
    'yes', 'no', 'yes', 'yes', '', 'cotton,onesie',
    '0-3M:5, 3-6M:8, 6-9M:3', '', '', 'SAMPLE-001_1.jpg, SAMPLE-001_2.jpg'],
  ['SAMPLE-002', 'sample-snap-pajama', 'SAMPLE Snap Pajama Set', 'طقم بيجاما (عينة)',
    'Cozy cotton-blend snap pajama set.', 'طقم بيجاما قطني مريح.',
    'Cozy sleepwear set', 'لبس نوم مريح',
    'Sleepwear', '', 'Unisex', 'Baby', '16', '', '4',
    'yes', 'yes', 'no', 'yes', '', 'sleepwear,gift',
    '0-3M|3-6M', 'Beige|Gray', '0-3M:Beige:4; 3-6M:Beige:2; 0-3M:Gray:3', 'SAMPLE-002_1.jpg'],
  ['SAMPLE-003', '', 'SAMPLE Braided Ski Cap', 'طاقية (عينة)',
    'Soft knit one-size cap.', 'طاقية ناعمة بمقاس واحد.',
    'Warm winter cap', 'طاقية شتوية',
    'Accessories', '', 'Unisex', 'Baby', '9', '', '2.5',
    'no', 'no', 'no', 'yes', '', 'accessories,winter',
    'One Size:8', '', '', 'https://example.com/sample-cap.jpg'],
];

// XLSX
const ws = XLSX.utils.aoa_to_sheet([HEADER, ...ROWS]);
ws['!cols'] = HEADER.map((h) => ({ wch: Math.max(12, h.length + 2) }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Products');
XLSX.writeFile(wb, path.join(OUT, 'MiniYo_Bulk_Import_Template.xlsx'));

// CSV
function esc(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = [HEADER, ...ROWS].map((r) => r.map(esc).join(',')).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'MiniYo_Bulk_Import_Template.csv'), csv, 'utf8');

console.log('Wrote templates to', OUT);
