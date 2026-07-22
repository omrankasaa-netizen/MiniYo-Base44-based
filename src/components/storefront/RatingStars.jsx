import React from 'react';
import { Heart } from 'lucide-react';

// Aggregate rating display — 5 hearts with fractional fill (matches the review
// widget's heart motif) plus an optional "4.8 (23)" label. Render nothing from
// the caller when count === 0; this component itself tolerates count 0 by
// hiding the text.
export default function RatingStars({ avg = 0, count = 0, size = 'sm', showText = true, className = '' }) {
  const dim = size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const fill = Math.min(1, Math.max(0, avg - i));
          return (
            <span key={i} className="relative inline-block shrink-0">
              <Heart className={`${dim} text-muted-foreground/40`} />
              {fill > 0 && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                  <Heart className={`${dim} fill-destructive text-destructive`} />
                </span>
              )}
            </span>
          );
        })}
      </div>
      {showText && count > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{avg.toFixed(1)} ({count})</span>
      )}
    </div>
  );
}
