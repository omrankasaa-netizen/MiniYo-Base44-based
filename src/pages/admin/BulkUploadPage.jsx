import React, { useState, useRef } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

const CSV_HEADERS = ['name','name_ar','short_description','short_description_ar','description','description_ar','category','gender','age_group','price_usd','compare_at_price_usd','cost_usd','sizes','colors','stock_quantity','sku','tags','is_new','is_featured','status'];

// Row 1: instructions / legend (will be ignored by parser since it won't match headers)
const INSTRUCTIONS_COMMENT = [
  '=== INSTRUCTIONS — DELETE THIS ROW BEFORE UPLOADING ===',
  'Arabic name','Short EN description (1 line)','Short AR description','Long EN description','Long AR description',
  'Category name (must match existing or will be created)',
  'Girls / Boys / Unisex','Newborn / Baby / Toddler / Kids',
  'Price per piece e.g. 12.99','Original price if on sale e.g. 15.99 (leave blank if not on sale)',
  'Your cost/landed price e.g. 5.00',
  'SIZES: use pipe | to separate — e.g. NB|3M|6M|12M — leave blank if no size options',
  'COLORS: use pipe | to separate — e.g. White|Pink|Mint — leave blank if no color options',
  'Total stock quantity (number only)','Your product code / SKU',
  'Comma-separated tags','TRUE or FALSE','TRUE or FALSE','Active or Hidden'
];

const SAMPLE_ROW_1 = [
  'Bunny Bodysuit','بدلة أرنب',
  'Cute bunny print onesie','بودي سوت ببطبع أرنب',
  'Soft 100% cotton onesie with bunny print. Perfect for newborns.',
  'قطعة قطنية ناعمة 100% مع طبعة أرنب. مثالية للمواليد.',
  'Bodysuits','Girls','Newborn',
  '12.99','15.99','5.00',
  'NB|3M|6M|12M','White|Pink|Mint',
  '20','BNNY-001','cotton,onesie,newborn','TRUE','FALSE','Active'
];

const SAMPLE_ROW_2 = [
  'Snap Pajama Set','طقم بيجاما بكبسات',
  'Cozy sleepwear for sweeter nights','لبس نوم ناعم لليالي أهدأ',
  'Soft cotton-blend snap pajama set. Great for gifting.',
  'طقم بيجاما ناعم ومريح. هدية رائعة.',
  'Sleepwear','Unisex','Baby',
  '15.99','','3.64',
  '0-3M|3-6M|6-9M|9-12M','Beige|Gray',
  '12','PJM-001','sleepwear,baby,gift','TRUE','TRUE','Active'
];

const SAMPLE_ROW_3 = [
  'Braided Ski Cap','طاقية مكرّمة',
  'Cozy winter cap for little ones','طاقية شتوية دافئة للصغار',
  'Soft knit braided ski cap. One size fits most babies.',
  'طاقية مكرّمة ناعمة. مقاس واحد يناسب معظم الأطفال.',
  'Accessories','Unisex','Baby',
  '8.99','','2.50',
  '','Ecru|Sage|Pink',
  '8','CAP-001','accessories,winter,cap','FALSE','FALSE','Active'
];

const VALID_GENDERS = ['Girls', 'Boys', 'Unisex'];
const VALID_AGES = ['Newborn', 'Baby', 'Toddler', 'Kids'];
const VALID_STATUS = ['Active', 'Hidden'];
const VALID_BOOLS = ['TRUE', 'FALSE', 'true', 'false', '1', '0', ''];

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    // Handle quoted commas
    const vals = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return obj;
  });
}

function toBool(v) {
  return ['TRUE','true','1'].includes(v);
}

export default function BulkUploadPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const fileRef = useRef();

  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({}); // rowIndex -> [errs]
  const [skipped, setSkipped] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [variantMode, setVariantMode] = useState('zero'); // 'zero' | 'split'
  const [newCategories, setNewCategories] = useState([]); // categories to create

  const { data: categories = [] } = useQuery({
    queryKey: ['bulk-categories'],
    queryFn: () => base44.entities.Category.list('name', 100),
  });

  if (!canAccess('edit_products')) return <AdminLayout><AccessDenied /></AdminLayout>;

  function handleDownloadTemplate() {
    function escapeCSV(v) {
      if (v == null) return '';
      const s = String(v);
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    }
    function toLine(arr) { return arr.map(escapeCSV).join(','); }
    const lines = [
      toLine(CSV_HEADERS),
      toLine(INSTRUCTIONS_COMMENT),
      toLine(SAMPLE_ROW_1),
      toLine(SAMPLE_ROW_2),
      toLine(SAMPLE_ROW_3),
    ].join('\n');
    downloadCSV('miniyo_product_template.csv', lines + '\n');
  }

  function validateRows(parsed, cats) {
    const catNames = cats.map(c => c.name.toLowerCase());
    const errs = {};
    const newCats = new Set();
    parsed.forEach((row, i) => {
      const rowErrs = [];
      if (!row.name) rowErrs.push('name is required');
      if (!row.category) rowErrs.push('category is required');
      else if (!catNames.includes(row.category.toLowerCase())) newCats.add(row.category);
      if (!row.price_usd) rowErrs.push('price_usd is required');
      else if (isNaN(Number(row.price_usd))) rowErrs.push('price_usd must be a number');
      if (row.compare_at_price_usd && isNaN(Number(row.compare_at_price_usd))) rowErrs.push('compare_at_price_usd must be a number');
      if (row.cost_usd && isNaN(Number(row.cost_usd))) rowErrs.push('cost_usd must be a number');
      if (row.stock_quantity && isNaN(Number(row.stock_quantity))) rowErrs.push('stock_quantity must be a number');
      if (row.gender && !VALID_GENDERS.includes(row.gender)) rowErrs.push(`gender must be: ${VALID_GENDERS.join(', ')}`);
      if (row.age_group && !VALID_AGES.includes(row.age_group)) rowErrs.push(`age_group must be: ${VALID_AGES.join(', ')}`);
      if (row.status && !VALID_STATUS.includes(row.status)) rowErrs.push(`status must be Active or Hidden`);
      if (row.is_new && !VALID_BOOLS.includes(row.is_new)) rowErrs.push('is_new must be TRUE or FALSE');
      if (row.is_featured && !VALID_BOOLS.includes(row.is_featured)) rowErrs.push('is_featured must be TRUE or FALSE');
      if (rowErrs.length) errs[i] = rowErrs;
    });
    return { errs, newCats: [...newCats] };
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      const { errs, newCats } = validateRows(parsed, categories);
      setRows(parsed);
      setErrors(errs);
      setSkipped(new Set());
      setImportResult(null);
      setNewCategories(newCats);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function toggleSkip(i) {
    setSkipped(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleSkipAll(skipAll) {
    if (skipAll) setSkipped(new Set(Object.keys(errors).map(Number)));
    else setSkipped(new Set());
  }

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    let successCount = 0, failCount = 0;

    try {
      // Create missing categories first
      const catMap = Object.fromEntries(categories.map(c => [c.name.toLowerCase(), c.id]));
      for (const catName of newCategories) {
        if (!catMap[catName.toLowerCase()]) {
          const slug = catName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          const created = await base44.entities.Category.create({ slug, name: catName, is_active: true });
          catMap[catName.toLowerCase()] = created.id;
        }
      }
      qc.invalidateQueries({ queryKey: ['bulk-categories'] });

      const validRows = rows.filter((_, i) => !skipped.has(i) && !errors[i]);

      for (const row of validRows) {
        try {
          const hasVariants = !!(row.sizes || row.colors);
          const slug = (row.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now() + Math.floor(Math.random()*1000));
          const product = await base44.entities.Product.create({
            slug,
            name: row.name,
            name_ar: row.name_ar || '',
            short_description: row.short_description || '',
            short_description_ar: row.short_description_ar || '',
            description: row.description || '',
            description_ar: row.description_ar || '',
            category_id: catMap[row.category?.toLowerCase()] || null,
            gender: row.gender || null,
            age_group: row.age_group || null,
            price_usd: Number(row.price_usd),
            compare_at_price_usd: row.compare_at_price_usd ? Number(row.compare_at_price_usd) : null,
            cost_usd: row.cost_usd ? Number(row.cost_usd) : null,
            sku: row.sku || '',
            tags: row.tags || '',
            is_new: toBool(row.is_new),
            is_featured: toBool(row.is_featured),
            status: VALID_STATUS.includes(row.status) ? row.status : 'Active',
            has_variants: hasVariants,
            sizes: row.sizes || '',
            colors: row.colors || '',
            stock_quantity: hasVariants ? 0 : Number(row.stock_quantity || 0),
            reorder_level: 3,
          });

          // Create variants if sizes/colors
          if (hasVariants) {
            const sizes = row.sizes ? row.sizes.split('|').map(s => s.trim()).filter(Boolean) : [''];
            const colors = row.colors ? row.colors.split('|').map(c => c.trim()).filter(Boolean) : [''];
            const totalVariants = sizes.length * colors.length;
            const splitQty = variantMode === 'split' && row.stock_quantity ? Math.floor(Number(row.stock_quantity) / totalVariants) : 0;
            for (const size of sizes) {
              for (const color of colors) {
                const variantSku = `${row.sku || 'VAR'}-${[size, color].filter(Boolean).join('-')}`;
                await base44.entities.ProductVariant.create({
                  product_id: product.id,
                  variant_sku: variantSku,
                  size: size || null,
                  color: color || null,
                  qty_on_hand: splitQty,
                  qty_reserved: 0,
                });
              }
            }
          }
          successCount++;
        } catch (e) {
          failCount++;
        }
      }

      await logAction({ action: 'bulk_upload', entity: 'Product', details: `${successCount} imported`, userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      setImportResult({ success: successCount, failed: failCount, skipped: skipped.size + Object.keys(errors).filter(i => !skipped.has(Number(i))).length });
      setRows([]);
    } finally {
      setImporting(false);
    }
  }

  const validCount = rows.filter((_, i) => !errors[i] && !skipped.has(i)).length;
  const errorCount = Object.keys(errors).length;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Upload className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Bulk Product Upload</h1>
            <p className="text-sm text-muted-foreground">Import multiple products from a CSV file</p>
          </div>
        </div>

        {/* Step 1: Download template */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-foreground">Step 1 — Download the Template</h2>
          <p className="text-sm text-muted-foreground">Download the CSV template, fill it in, then upload it below. Do <strong>not</strong> change the column headers.</p>
          <button onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Download className="w-4 h-4" /> Download CSV Template
          </button>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-foreground text-sm">📋 How to fill in the template</p>
            <ul className="space-y-1.5 list-none">
              <li>🔴 <strong>Required:</strong> <code>name</code>, <code>category</code>, <code>price_usd</code></li>
              <li>📏 <strong>sizes</strong> — separate multiple sizes with <code>|</code> (pipe), no spaces around it<br />
                <span className="ml-5 text-green-700">✅ NB|3M|6M|12M</span>&nbsp;&nbsp;<span className="ml-3 text-destructive">❌ NB, 3M, 6M</span>&nbsp;&nbsp;<span className="ml-3 text-destructive">❌ NB | 3M | 6M</span><br />
                <span className="ml-5">Leave blank if the product has only one size or is one-size-fits-all.</span>
              </li>
              <li>🎨 <strong>colors</strong> — same rule: pipe-separated, no spaces<br />
                <span className="ml-5 text-green-700">✅ White|Pink|Mint</span>&nbsp;&nbsp;<span className="ml-3 text-destructive">❌ White, Pink, Mint</span>
              </li>
              <li>📦 <strong>stock_quantity</strong> — total stock count (number only, e.g. <code>20</code>)</li>
              <li>💰 <strong>price_usd</strong> — price per single piece (e.g. <code>12.99</code>). Never a bundle total.</li>
              <li>✅ <strong>is_new / is_featured / status:</strong> use exactly <code>TRUE</code>, <code>FALSE</code>, <code>Active</code>, <code>Hidden</code></li>
              <li>👤 <strong>gender:</strong> <code>Girls</code> · <code>Boys</code> · <code>Unisex</code></li>
              <li>👶 <strong>age_group:</strong> <code>Newborn</code> · <code>Baby</code> · <code>Toddler</code> · <code>Kids</code></li>
              <li>⚠️ <strong>Delete the INSTRUCTIONS row</strong> (row 2) before uploading — keep the header row.</li>
            </ul>
          </div>
        </div>

        {/* Step 2: Upload */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-foreground">Step 2 — Upload Your CSV</h2>
          <div
            className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) { const dt = new DataTransfer(); dt.items.add(file); fileRef.current.files = dt.files; handleFile({ target: { files: [file], value: '' } }); }}}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Click to select or drag & drop a CSV</p>
            <p className="text-xs text-muted-foreground mt-1">.csv files only</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </div>
        </div>

        {/* Step 3: Preview + Validate */}
        {rows.length > 0 && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-wrap gap-3">
              <div>
                <h2 className="font-heading font-semibold text-foreground">Step 3 — Review & Import</h2>
                <div className="flex items-center gap-4 mt-1 text-xs">
                  <span className="text-green-700 font-medium">{validCount} valid</span>
                  <span className="text-destructive font-medium">{errorCount} with errors</span>
                  <span className="text-muted-foreground">{skipped.size} skipped</span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Variant stock mode */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Variant stock:</span>
                  <select value={variantMode} onChange={e => setVariantMode(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-input bg-background text-xs">
                    <option value="zero">Start at 0</option>
                    <option value="split">Split stock_quantity evenly</option>
                  </select>
                </div>
                {errorCount > 0 && (
                  <button onClick={() => toggleSkipAll(skipped.size < errorCount)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80">
                    {skipped.size < errorCount ? 'Skip all errors' : 'Unskip all'}
                  </button>
                )}
                <button onClick={handleImport} disabled={importing || validCount === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {importing ? 'Importing…' : `Import ${validCount} Products`}
                </button>
              </div>
            </div>

            {/* New categories notice */}
            {newCategories.length > 0 && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                New categories will be created: <strong>{newCategories.join(', ')}</strong>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-3 w-8">#</th>
                    <th className="px-3 py-3 text-left">Name</th>
                    <th className="px-3 py-3 text-left hidden md:table-cell">Category</th>
                    <th className="px-3 py-3 text-left">Price</th>
                    <th className="px-3 py-3 text-left hidden sm:table-cell">Sizes/Colors</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Issues</th>
                    <th className="px-3 py-3 w-16">Skip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => {
                    const rowErrs = errors[i] || [];
                    const isSkipped = skipped.has(i);
                    const hasErr = rowErrs.length > 0;
                    return (
                      <tr key={i} className={`transition-colors ${isSkipped ? 'opacity-40' : hasErr ? 'bg-destructive/5' : 'hover:bg-muted/20'}`}>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs text-center">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-foreground">{row.name || <span className="text-destructive italic">missing</span>}</p>
                          {row.sku && <p className="text-xs text-muted-foreground">{row.sku}</p>}
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                          {row.category}
                          {newCategories.includes(row.category) && <span className="ml-1 text-amber-600 text-xs">(new)</span>}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-foreground">{row.price_usd ? `$${row.price_usd}` : <span className="text-destructive italic text-xs">missing</span>}</td>
                        <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-muted-foreground">
                          {row.sizes && <span className="bg-muted px-1.5 py-0.5 rounded-md mr-1">{row.sizes}</span>}
                          {row.colors && <span className="bg-muted px-1.5 py-0.5 rounded-md">{row.colors}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${row.status === 'Hidden' ? 'bg-muted text-muted-foreground' : 'bg-green-50 text-green-700'}`}>
                            {row.status || 'Active'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {hasErr
                            ? <div className="space-y-0.5">{rowErrs.map((e, j) => <p key={j} className="text-xs text-destructive flex items-start gap-1"><XCircle className="w-3 h-3 mt-0.5 shrink-0" />{e}</p>)}</div>
                            : <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> OK</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" checked={isSkipped} onChange={() => toggleSkip(i)} className="rounded" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Import complete!</p>
              <p className="text-sm text-green-700 mt-1">
                {importResult.success} products imported · {importResult.failed} failed · {importResult.skipped} skipped.
              </p>
              <p className="text-xs text-green-600 mt-1">
                Products without photos are marked in the Products page — add photos there.
              </p>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}