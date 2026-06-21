import React, { useState, useRef } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import AccessDenied from './AccessDenied';
import {
  Upload, Download, FileSpreadsheet, FileArchive, CheckCircle, XCircle,
  AlertTriangle, Loader2, Eye, Trash2, Info,
} from 'lucide-react';

// Canonical sheet header — must match SHEET_COLUMNS in server/bulkImport.js.
const HEADER = [
  'sku', 'handle', 'name_en', 'name_ar', 'description_en', 'description_ar',
  'short_description_en', 'short_description_ar', 'category', 'subcategory',
  'gender', 'age_group', 'price', 'compare_at_price', 'cost',
  'is_new', 'is_trending', 'is_featured', 'is_active',
  'video_url', 'tags', 'sizes', 'images',
];

const SAMPLE_ROWS = [
  ['SAMPLE-001', 'sample-bunny-bodysuit', 'SAMPLE Bunny Bodysuit', 'بدلة أرنب (عينة)',
    'Soft 100% cotton onesie with a bunny print.', 'قطعة قطنية ناعمة مع طبعة أرنب.',
    'Cute bunny print onesie', 'بودي سوت بطبعة أرنب',
    'Bodysuits', '', 'Girls', 'Newborn', '12', '15', '5',
    'yes', 'no', 'yes', 'yes', '', 'cotton,onesie',
    '0-3M:5, 3-6M:8, 6-9M:3', 'SAMPLE-001_1.jpg, SAMPLE-001_2.jpg'],
  ['SAMPLE-002', 'sample-snap-pajama', 'SAMPLE Snap Pajama Set', 'طقم بيجاما (عينة)',
    'Cozy cotton-blend snap pajama set.', 'طقم بيجاما قطني مريح.',
    'Cozy sleepwear set', 'لبس نوم مريح',
    'Sleepwear', '', 'Unisex', 'Baby', '16', '', '4',
    'yes', 'yes', 'no', 'yes', '', 'sleepwear,gift',
    'Beige|0-3M:4, Beige|3-6M:2, Gray|0-3M:3', 'SAMPLE-002_1.jpg'],
  ['SAMPLE-003', '', 'SAMPLE Braided Ski Cap', 'طاقية (عينة)',
    'Soft knit one-size cap.', 'طاقية ناعمة بمقاس واحد.',
    'Warm winter cap', 'طاقية شتوية',
    'Accessories', '', 'Unisex', 'Baby', '9', '', '2.5',
    'no', 'no', 'no', 'yes', '', 'accessories,winter',
    'One Size:8', 'https://example.com/sample-cap.jpg'],
];

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadCsvTemplate() {
  const csv = [HEADER, ...SAMPLE_ROWS].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
  downloadBlob('MiniYo_Bulk_Import_Template.csv', new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}

async function downloadXlsxTemplate() {
  // Dynamic import keeps xlsx out of the initial bundle.
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...SAMPLE_ROWS]);
  ws['!cols'] = HEADER.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob('MiniYo_Bulk_Import_Template.xlsx',
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BulkImportPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const sheetRef = useRef();
  const zipRef = useRef();

  const [sheetFile, setSheetFile] = useState(null);
  const [zipFile, setZipFile] = useState(null);
  const [removeMissingVariants, setRemoveMissingVariants] = useState(false);
  const [busy, setBusy] = useState('');           // '' | 'preview' | 'import' | 'cleanup'
  const [preview, setPreview] = useState(null);   // { summary, results }
  const [result, setResult] = useState(null);     // committed result
  const [cleanupResult, setCleanupResult] = useState(null);
  const [error, setError] = useState('');

  if (!canAccess('edit_products')) return <AdminLayout><AccessDenied /></AdminLayout>;

  async function buildPayload(extra) {
    const spreadsheet = { base64: await fileToBase64(sheetFile), filename: sheetFile.name };
    const payload = { spreadsheet, ...extra };
    if (zipFile) payload.imagesZip = { base64: await fileToBase64(zipFile), filename: zipFile.name };
    return payload;
  }

  async function handlePreview() {
    if (!sheetFile) { setError('Choose a spreadsheet file first.'); return; }
    setError(''); setResult(null); setBusy('preview');
    try {
      const payload = await buildPayload({ dryRun: true, removeMissingVariants });
      const { data } = await base44.functions.invoke('bulkImportProducts', payload);
      setPreview(data);
    } catch (e) {
      setError(e.message || 'Preview failed');
      setPreview(null);
    } finally {
      setBusy('');
    }
  }

  async function handleImport() {
    if (!sheetFile) { setError('Choose a spreadsheet file first.'); return; }
    setError(''); setBusy('import');
    try {
      const payload = await buildPayload({ dryRun: false, removeMissingVariants });
      const { data } = await base44.functions.invoke('bulkImportProducts', payload);
      setResult(data);
      setPreview(null);
      await logAction({
        action: 'bulk_import', entity: 'Product',
        userName: currentUser?.email,
      });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setBusy('');
    }
  }

  async function handleCleanup() {
    if (!window.confirm(
      'Remove ALL demo/seed products (the sample catalog the app shipped with)?\n\n'
      + 'Your manually-created and imported products are NOT affected. This cannot be undone.'
    )) return;
    setError(''); setBusy('cleanup'); setCleanupResult(null);
    try {
      const { data } = await base44.functions.invoke('cleanupSeedProducts', {});
      setCleanupResult(data);
      await logAction({ action: 'cleanup_seed_products', entity: 'Product', userName: currentUser?.email });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (e) {
      setError(e.message || 'Cleanup failed');
    } finally {
      setBusy('');
    }
  }

  const s = preview?.summary;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-screen-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Upload className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Bulk Import</h1>
            <p className="text-sm text-muted-foreground">
              Create or update many products at once from a spreadsheet + photos zip. Preview first, then import.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 text-sm flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {/* Step 1: template + instructions */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-foreground">Step 1 — Download the template</h2>
          <p className="text-sm text-muted-foreground">
            One row per product. Keep the header row as-is. Delete the <code>SAMPLE-…</code> example rows before importing.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={downloadXlsxTemplate}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Download className="w-4 h-4" /> Excel template (.xlsx)
            </button>
            <button onClick={downloadCsvTemplate}
              className="flex items-center gap-2 bg-muted text-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted/80 transition-colors">
              <Download className="w-4 h-4" /> CSV template (.csv)
            </button>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-foreground text-sm flex items-center gap-1.5"><Info className="w-4 h-4" /> Column quick reference</p>
            <ul className="space-y-1.5 list-none">
              <li>🔴 <strong>Required:</strong> <code>sku</code> (unique key for updates), <code>name_en</code>, <code>price</code></li>
              <li>📏 <strong>sizes</strong> — one cell of <code>size:stock</code> pairs:
                <span className="ml-2 text-green-700">0-3M:5, 3-6M:8, 6-9M:3</span><br />
                <span className="ml-5">With colors: <span className="text-green-700">Pink|0-3M:5, Blue|0-3M:3</span>. Leave blank for one-size products.</span>
              </li>
              <li>🖼️ <strong>images</strong> — comma-separated filenames matching the zip (first = primary), e.g.
                <span className="ml-2 text-green-700">SKU_1.jpg, SKU_2.jpg</span>. Full <code>http(s)://</code> URLs also work. Blank = keep existing photos.
              </li>
              <li>🏷️ <strong>category</strong> — matched by name/slug; created if it doesn't exist.</li>
              <li>✅ <strong>is_new / is_trending / is_featured / is_active</strong> — <code>true</code>/<code>false</code> (or yes/no, 1/0).</li>
              <li>👤 <strong>gender:</strong> Girls · Boys · Unisex &nbsp;&nbsp; 👶 <strong>age_group:</strong> Newborn · Baby · Toddler · Kids</li>
              <li>🔁 <strong>Re-import</strong> the same SKU later to <strong>update</strong> a product — it never duplicates.</li>
            </ul>
          </div>
        </div>

        {/* Step 2: choose files */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-foreground">Step 2 — Choose your files</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <FilePicker
              icon={FileSpreadsheet}
              label="Spreadsheet (.xlsx or .csv)"
              required
              file={sheetFile}
              accept=".xlsx,.csv"
              inputRef={sheetRef}
              onPick={(f) => { setSheetFile(f); setPreview(null); setResult(null); }}
            />
            <FilePicker
              icon={FileArchive}
              label="Images zip (optional)"
              file={zipFile}
              accept=".zip"
              inputRef={zipRef}
              onPick={(f) => { setZipFile(f); setPreview(null); setResult(null); }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={removeMissingVariants}
              onChange={(e) => setRemoveMissingVariants(e.target.checked)} className="rounded" />
            Remove sizes not in the sheet (otherwise existing sizes are kept)
          </label>
          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={handlePreview} disabled={!sheetFile || !!busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity">
              {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {busy === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
            <button onClick={handleImport} disabled={!sheetFile || !!busy || !preview}
              title={!preview ? 'Run Preview first' : ''}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {busy === 'import' ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>

        {/* Preview summary + per-row table */}
        {s && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-heading font-semibold text-foreground mb-2">Preview (nothing saved yet)</h2>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <Stat color="text-green-700" label="to create" value={s.toCreate} />
                <Stat color="text-blue-700" label="to update" value={s.toUpdate} />
                <Stat color="text-destructive" label="rows with errors" value={s.errorRows} />
                <Stat color="text-muted-foreground" label="total rows" value={s.totalRows} />
                {!s.imagesZipProvided && (
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md">No images zip uploaded</span>
                )}
              </div>
            </div>
            <RowsTable results={preview.results} />
          </div>
        )}

        {/* Import result */}
        {result?.summary && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-2">
            <p className="font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Import complete
            </p>
            <p className="text-sm text-green-700">
              {result.summary.created} created · {result.summary.updated} updated · {result.summary.failed} failed · {result.summary.errorRows} skipped (errors).
            </p>
            {Array.isArray(result.commitResults) && result.commitResults.some((r) => r.action === 'failed') && (
              <div className="text-xs text-destructive space-y-0.5 mt-1">
                {result.commitResults.filter((r) => r.action === 'failed').map((r) => (
                  <p key={r.rowNumber}>Row {r.rowNumber} ({r.sku}): {r.error}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Danger zone: remove seed/demo products */}
        <div className="bg-card border border-destructive/30 rounded-2xl p-6 shadow-sm space-y-3">
          <h2 className="font-heading font-semibold text-destructive flex items-center gap-2">
            <Trash2 className="w-5 h-5" /> Remove demo / seed products
          </h2>
          <p className="text-sm text-muted-foreground">
            Deletes only the sample products the app shipped with (and their variants/images).
            Your manually-created and imported products are <strong>not</strong> touched. Safe to run more than once.
          </p>
          <button onClick={handleCleanup} disabled={!!busy}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50 hover:bg-destructive/90 transition-colors">
            {busy === 'cleanup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {busy === 'cleanup' ? 'Removing…' : 'Remove demo/seed products'}
          </button>
          {cleanupResult && (
            <p className="text-sm text-green-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Removed {cleanupResult.productsDeleted} demo products
              ({cleanupResult.variantsDeleted} variants, {cleanupResult.imagesDeleted} images
              {cleanupResult.categoriesDeleted ? `, ${cleanupResult.categoriesDeleted} empty categories` : ''}).
            </p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ color, label, value }) {
  return <span className={`font-medium ${color}`}>{value} <span className="text-muted-foreground font-normal">{label}</span></span>;
}

function FilePicker({ icon: Icon, label, required, file, accept, inputRef, onPick }) {
  return (
    <div
      className="border-2 border-dashed border-border rounded-2xl p-5 text-center cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onPick(f); }}
    >
      <Icon className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </p>
      <p className="text-xs text-muted-foreground mt-1 truncate">
        {file ? file.name : 'Click or drag & drop'}
      </p>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files[0]; if (f) onPick(f); e.target.value = ''; }} />
    </div>
  );
}

function RowsTable({ results = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-3 w-10">Row</th>
            <th className="px-3 py-3 text-left">SKU</th>
            <th className="px-3 py-3 text-left">Name</th>
            <th className="px-3 py-3 text-left">Action</th>
            <th className="px-3 py-3 text-left">Issues</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {results.map((r) => {
            const hasErr = r.errors.length > 0;
            const badge = r.action === 'create' ? 'bg-green-50 text-green-700'
              : r.action === 'update' ? 'bg-blue-50 text-blue-700'
              : 'bg-destructive/10 text-destructive';
            return (
              <tr key={r.rowNumber} className={hasErr ? 'bg-destructive/5' : 'hover:bg-muted/20'}>
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{r.rowNumber}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground">{r.sku || <span className="text-destructive italic">missing</span>}</td>
                <td className="px-3 py-2.5 text-foreground">{r.name || <span className="text-destructive italic">missing</span>}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>{r.action}</span>
                </td>
                <td className="px-3 py-2.5">
                  {hasErr && <div className="space-y-0.5">{r.errors.map((e, j) => (
                    <p key={j} className="text-xs text-destructive flex items-start gap-1"><XCircle className="w-3 h-3 mt-0.5 shrink-0" />{e}</p>
                  ))}</div>}
                  {r.warnings.length > 0 && <div className="space-y-0.5">{r.warnings.map((w, j) => (
                    <p key={j} className="text-xs text-amber-700 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>
                  ))}</div>}
                  {!hasErr && r.warnings.length === 0 && (
                    <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
