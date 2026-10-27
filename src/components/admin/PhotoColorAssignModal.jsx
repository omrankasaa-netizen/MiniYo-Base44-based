import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { analyzePhotoColors, applyPhotoColors } from '@/lib/photoColorClient';
import { logAction } from '@/lib/auditLog';

function assignmentId(a) {
  return `${a.productId}|${a.colorKey}`;
}

export default function PhotoColorAssignModal({ onClose, onApplied, currentUser }) {
  const [report, setReport] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const runDryRun = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setProgress({ completed: 0, total: 0 });
      const data = await analyzePhotoColors(setProgress);
      const assignments = Array.isArray(data?.assignments) ? data.assignments : [];
      setReport({ ...data, assignments });
      // High-confidence suggestions are convenient to apply; lower-confidence
      // ones stay visible but require an explicit operator decision.
      setSelected(new Set(assignments.filter((a) => (a.confidence || 0) >= 0.8).map(assignmentId)));
    } catch (e) {
      setReport(null);
      setSelected(new Set());
      setError(e.message || 'Could not analyze product photos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runDryRun(); }, [runDryRun]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !applying) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applying, onClose]);

  const assignments = report?.assignments || [];
  const chosen = assignments.filter((a) => selected.has(assignmentId(a)));
  const allSelected = assignments.length > 0 && chosen.length === assignments.length;

  function toggle(a) {
    const id = assignmentId(a);
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applySelected() {
    if (chosen.length === 0) return;
    setApplying(true);
    setError('');
    try {
      const data = await applyPhotoColors(
        chosen.map(({ productId, colorKey, imageUrl }) => ({ productId, colorKey, imageUrl })),
      );
      setResult(data || { colorsAssigned: 0, variantsUpdated: 0, skipped: 0 });
      await logAction({
        action: 'auto_assign_photo_colors',
        entity: 'ProductVariant',
        userName: currentUser?.email,
        details: `${data?.colorsAssigned || 0} colors, ${data?.variantsUpdated || 0} variants`,
      });
      onApplied?.();
    } catch (e) {
      setError(e.message || 'Could not save the selected assignments.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="photo-color-title"
        className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-border">
          <div>
            <h3 id="photo-color-title" className="font-heading font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Gemini photo color & pattern matching
            </h3>
            <p className="text-xs text-muted-foreground mt-1">AI matches every photo to the product’s exact colors and patterns. Review before saving.</p>
          </div>
          <button onClick={onClose} disabled={applying} aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          <div className="flex gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Gemini can still misread backgrounds, packaging, or similar prints. Check every thumbnail. Existing photo assignments are never changed; suggestions below 80% confidence start unselected.</p>
          </div>

          {error && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-destructive/10 text-destructive">{error}</p>}

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-primary mx-auto" />
              <p className="font-medium text-foreground">Gemini is analyzing colors and patterns…</p>
              <p className="text-xs text-muted-foreground">
                {progress.total ? `${progress.completed} of ${progress.total} products completed` : 'Preparing the catalog…'} · This can take a few minutes.
              </p>
            </div>
          ) : result ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="font-semibold text-foreground">Photo colors assigned</h4>
              <p className="text-sm text-muted-foreground">
                {result.colorsAssigned || 0} colors updated across {result.variantsUpdated || 0} variants.
                {result.skipped ? ` ${result.skipped} stale or invalid suggestion(s) skipped.` : ''}
              </p>
            </div>
          ) : report && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {assignments.length} AI suggestion{assignments.length === 1 ? '' : 's'} from {report.imagesAnalyzed || 0} photos across {report.productsAnalyzed || 0} products
                  {report.imagesFailed ? ` · ${report.imagesFailed} photo(s) could not be read` : ''}
                  {report.productsFailed ? ` · ${report.productsFailed} product(s) failed` : ''}
                </p>
                {assignments.length > 0 && (
                  <button onClick={() => setSelected(allSelected ? new Set() : new Set(assignments.map(assignmentId)))}
                    className="text-xs font-semibold text-primary hover:underline">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              {report.productErrors?.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900">
                  <p className="font-semibold">Some products need a retry</p>
                  {report.productErrors.slice(0, 3).map((e) => <p key={e.productName} className="mt-1">{e.productName}: {e.error}</p>)}
                </div>
              )}

              {assignments.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="font-medium text-foreground">No new matches found</p>
                  <p className="text-sm text-muted-foreground mt-1">Try adding clearer product-only photos, or assign colors manually.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {assignments.map((a) => {
                    const id = assignmentId(a);
                    const checked = selected.has(id);
                    return (
                      <label key={id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(a)}
                          className="w-4 h-4 accent-primary shrink-0" />
                        <img src={a.imageUrl} alt={`${a.productName} — ${a.label}`} loading="lazy"
                          className="w-20 h-24 rounded-lg object-cover bg-muted shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground line-clamp-2">{a.productName}</p>
                          <p className="text-sm text-primary font-semibold mt-1">{a.label}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {Math.round((a.confidence || 0) * 100)}% AI confidence · {a.pattern || 'color/pattern'}
                          </p>
                          {a.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.reason}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">Only empty color-photo fields will be updated. Linked colors preview on mini product cards.</p>
          <div className="flex items-center gap-2">
            {result ? (
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Done</button>
            ) : (
              <>
                <button onClick={runDryRun} disabled={loading || applying}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-run
                </button>
                <button onClick={applySelected} disabled={loading || applying || chosen.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                  {applying ? 'Saving…' : `Apply selected (${chosen.length})`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
