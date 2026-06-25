import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { imageSrc, cmsImageSrc, handleImageError } from '@/lib/imageFraming';

// Full-screen image preview / zoom overlay for the storefront product card.
//
// Opens on top of everything via a portal so customers (especially on phones)
// can zoom into a product photo without navigating into the product page.
// - Back/close button (top), backdrop tap, and Escape all close it.
// - Pinch-to-zoom works natively because the <img> is a normal block element
//   inside a scrollable, overflow-auto stage (mobile browsers allow pinch zoom
//   on the image), plus a tap-to-toggle 2x zoom for convenience.
// - With multiple photos, prev/next arrows + swipe navigate within the lightbox.
export default function ImageLightbox({ images, startIndex = 0, alt = '', rtl = false, onClose }) {
  const pics = (images || []).filter((im) => im && im.url);
  const count = pics.length;
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, count - 1)));
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef(null);

  const go = useCallback(
    (delta) => {
      setZoomed(false);
      setIndex((i) => (i + delta + count) % count);
    },
    [count]
  );

  // Keyboard: Escape closes, arrows navigate. Lock body scroll while open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (count > 1 && e.key === 'ArrowRight') go(rtl ? -1 : 1);
      else if (count > 1 && e.key === 'ArrowLeft') go(rtl ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [count, go, rtl, onClose]);

  if (count === 0) return null;

  const safeIndex = Math.min(index, count - 1);
  const current = pics[safeIndex];
  const fullSrc = current.variants
    ? current.variants.large || current.variants.card || current.url
    : (imageSrc(current, 'large') || cmsImageSrc(current.url, 'large'));

  function onTouchStart(e) {
    if (zoomed) return; // let the browser handle pinch/pan while zoomed
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (touchStartX.current == null || count < 2 || zoomed) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 45) {
      const forward = dx < 0;
      go(rtl ? (forward ? -1 : 1) : forward ? 1 : -1);
    }
    touchStartX.current = null;
  }

  // Close on a genuine backdrop click. We also stopPropagation on EVERY click
  // inside the overlay: this component is rendered through a React portal, and
  // React bubbles synthetic events through the COMPONENT tree (not the DOM tree),
  // so without this a click here would bubble up to a parent <Link> (e.g. the
  // product card) and navigate the page. mousedown is captured to avoid the
  // click target changing if the user drags slightly while zooming.
  function onBackdropClick(e) {
    e.stopPropagation();
    if (e.target === e.currentTarget) onClose?.();
  }

  const node = (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
      dir={rtl ? 'rtl' : 'ltr'}
      onClick={onBackdropClick}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar: back/close */}
      <div className="flex items-center justify-between p-3 sm:p-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 h-11 px-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label={rtl ? 'رجوع' : 'Back'}
        >
          <ArrowLeft className={`w-5 h-5 ${rtl ? 'rotate-180' : ''}`} />
          <span className="text-sm font-medium pr-1">{rtl ? 'رجوع' : 'Back'}</span>
        </button>
        <div className="flex items-center gap-2">
          {count > 1 && (
            <span className="text-white/70 text-xs tabular-nums">
              {safeIndex + 1} / {count}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={rtl ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image stage */}
      <div
        className="flex-1 min-h-0 overflow-auto flex items-center justify-center px-2 pb-4 select-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={fullSrc}
          alt={current.alt || alt}
          onError={handleImageError}
          onClick={() => setZoomed((z) => !z)}
          draggable={false}
          className={`mx-auto transition-transform duration-300 ${
            zoomed ? 'scale-[2] cursor-zoom-out' : 'max-w-full max-h-full object-contain cursor-zoom-in'
          }`}
          style={zoomed ? { maxWidth: 'none', maxHeight: 'none' } : undefined}
        />
      </div>

      {/* Prev / Next */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(rtl ? 1 : -1); }}
            className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={rtl ? 'التالي' : 'Previous'}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(rtl ? -1 : 1); }}
            className="absolute top-1/2 -translate-y-1/2 right-2 sm:right-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={rtl ? 'السابق' : 'Next'}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
