import React from 'react';
import { Heart } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

const RatingStars = ({ rating, count = 5, interactive = false, onChange }) => {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => interactive && onChange?.(i + 1)}
          className={`transition-colors ${interactive ? 'cursor-pointer hover:scale-110' : ''}`}
          disabled={!interactive}
        >
          <Heart
            className={`w-4 h-4 ${
              i < rating ? 'fill-destructive text-destructive' : 'text-muted-foreground'
            }`}
          />
        </button>
      ))}
    </div>
  );
};

export function ReviewList({ reviews = [] }) {
  const { t, lang } = useLang();
  const published = reviews.filter(r => r.is_published);

  if (published.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('No reviews yet.', 'لا توجد تقييمات بعد.')}</p>;
  }

  return (
    <div className="space-y-3">
      {published.map(review => (
        <div key={review.id} className="border border-border rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold inline-flex items-center justify-center">
                {(review.customer_name || '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{review.customer_name || t('Verified customer', 'عميل موثق')}</p>
                {review.created_date && (
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(review.created_date).toLocaleDateString(lang === 'ar' ? 'ar-LB' : 'en-GB')}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <RatingStars rating={review.rating} />
            </div>            
            {review.is_verified && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">✓ {t('Verified purchase', 'شراء موثّق')}</span>
            )}
          </div>
          {review.title && <p className="text-sm font-medium text-foreground mb-1">{review.title}</p>}
          <p className="text-xs text-muted-foreground leading-relaxed">{review.body}</p>
          {Array.isArray(review.photos) && review.photos.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto mobile-rail">
              {review.photos.slice(0, 4).map((url, idx) => (
                <img
                  key={`${review.id}-photo-${idx}`}
                  src={cmsImageSrc(url, 'thumb')}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={handleImageError}
                  className="w-16 h-16 rounded-lg object-cover shrink-0 snap-start"
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReviewForm({ productId, onSubmit, isSubmitting }) {
  const [rating, setRating] = React.useState(5);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [name, setName] = React.useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    await onSubmit({ product_id: productId, rating, title, body, customer_name: name });
    setRating(5);
    setTitle('');
    setBody('');
    setName('');
  }

  return (
    <form onSubmit={handleSubmit} className="bg-muted/30 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Leave a Review</h3>

      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Rating</label>
        <RatingStars rating={rating} interactive onChange={setRating} />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Review title"
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Review</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Share your experience..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !name.trim() || !body.trim()}
        className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Review'}
      </button>
    </form>
  );
}

export { RatingStars };