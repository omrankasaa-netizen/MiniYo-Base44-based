import React, { useRef, useState, useCallback } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Crop as CropIcon, Crosshair, RotateCcw } from 'lucide-react';
import { DEFAULT_FOCAL, normalizeFocal, framingStyle, imageSrc, normalizeImage } from '@/lib/imageFraming';

// Per-image, non-destructive framing editor. The admin can:
//   • set a FOCAL POINT (click / drag) stored as normalized {x,y}
//   • optionally drag a CROP rectangle stored as normalized {x,y,width,height}
// A live 3:4 preview mirrors exactly what the storefront card will render.
//
// onApply receives { focal, crop } with crop === null when no crop is set.
export default function ImageFramingEditor({ image, onApply, onClose }) {
  const [focal, setFocal] = useState(normalizeFocal(image?.focal));
  // react-image-crop works in percent units (0..100); we persist 0..1.
  const [crop, setCrop] = useState(() => {
    const c = image?.crop;
    if (!c) return undefined;
    return { unit: '%', x: c.x * 100, y: c.y * 100, width: c.width * 100, height: c.height * 100 };
  });
  const [mode, setMode] = useState('focal'); // 'focal' | 'crop'
  const focalAreaRef = useRef(null);
  const draggingRef = useRef(false);

  const updateFocalFromEvent = useCallback((e) => {
    const el = focalAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const point = e.touches?.[0] || e;
    const x = (point.clientX - rect.left) / rect.width;
    const y = (point.clientY - rect.top) / rect.height;
    setFocal({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }, []);

  function startDrag(e) {
    draggingRef.current = true;
    updateFocalFromEvent(e);
  }
  function moveDrag(e) {
    if (!draggingRef.current) return;
    updateFocalFromEvent(e);
  }
  function endDrag() { draggingRef.current = false; }

  function normalizedCrop() {
    if (!crop || !crop.width || !crop.height) return null;
    return {
      x: crop.x / 100,
      y: crop.y / 100,
      width: crop.width / 100,
      height: crop.height / 100,
    };
  }

  function handleApply() {
    onApply({ focal, crop: normalizedCrop() });
    onClose();
  }

  function resetAll() {
    setFocal({ ...DEFAULT_FOCAL });
    setCrop(undefined);
  }

  // Edit/preview on the LARGEST available derivative for precision (falls back
  // to the canonical URL for legacy images). focal/crop are normalized 0..1, so
  // the source size doesn't affect the stored values.
  const editUrl = imageSrc(normalizeImage(image), 'large') || image.url;
  // Preview uses the SAME framing util as the storefront card.
  const previewImage = { url: editUrl, focal, crop: normalizedCrop() };
  const { style: previewStyle, cropped: previewCropped } = framingStyle(previewImage);

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-3 lg:p-6">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-heading font-bold text-foreground text-base">Frame image for card</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Mode switch */}
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={() => setMode('focal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${mode === 'focal' ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              <Crosshair className="w-3.5 h-3.5" /> Focal point
            </button>
            <button type="button" onClick={() => setMode('crop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${mode === 'crop' ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              <CropIcon className="w-3.5 h-3.5" /> Crop
            </button>
            <button type="button" onClick={resetAll}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          <div className="grid md:grid-cols-[1fr_220px] gap-6 items-start">
            {/* Editor */}
            <div>
              {mode === 'focal' ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">Click or drag to set the point that stays visible in the card crop.</p>
                  <div
                    ref={focalAreaRef}
                    onMouseDown={startDrag}
                    onMouseMove={moveDrag}
                    onMouseUp={endDrag}
                    onMouseLeave={endDrag}
                    onTouchStart={startDrag}
                    onTouchMove={moveDrag}
                    onTouchEnd={endDrag}
                    className="relative w-full max-h-[55vh] overflow-hidden rounded-xl border border-border bg-muted cursor-crosshair select-none"
                  >
                    <img src={editUrl} alt="" className="w-full h-auto block pointer-events-none" draggable={false} />
                    <div
                      className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)] bg-primary/70 pointer-events-none"
                      style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">Drag a 3:4 rectangle to crop. The original image is never modified.</p>
                  <ReactCrop crop={crop} aspect={3 / 4} onChange={(_, percentCrop) => setCrop(percentCrop)} className="max-h-[55vh]">
                    <img src={editUrl} alt="" className="max-h-[55vh] w-auto block" />
                  </ReactCrop>
                </>
              )}
            </div>

            {/* Live 3:4 preview */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Card preview (3:4)</p>
              <div className="w-full max-w-[200px] mx-auto rounded-2xl overflow-hidden border border-border shadow-sm">
                <div className="relative w-full aspect-[3/4] bg-muted overflow-hidden">
                  <img src={editUrl} alt="" style={previewStyle} className={previewCropped ? '' : 'w-full h-full'} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                focal {focal.x.toFixed(2)}, {focal.y.toFixed(2)}
                {normalizedCrop() ? ' · cropped' : ' · no crop'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
          <button type="button" onClick={handleApply} className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            Apply framing
          </button>
        </div>
      </div>
    </div>
  );
}
