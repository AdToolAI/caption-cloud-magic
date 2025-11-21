import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { useSubmitRating, useUserTemplateRating } from '@/hooks/useTemplateRatings';

interface TemplateRatingProps {
  templateId: string;
  averageRating?: number;
  totalRatings?: number;
  showForm?: boolean;
}

export const TemplateRating = ({
  templateId,
  averageRating,
  totalRatings,
  showForm = true,
}: TemplateRatingProps) => {
  const { data: userRating } = useUserTemplateRating(templateId);
  const { mutate: submitRating, isPending } = useSubmitRating();
  const [rating, setRating] = useState(userRating?.rating || 0);
  const [reviewText, setReviewText] = useState(userRating?.review_text || '');
  const [hoveredRating, setHoveredRating] = useState(0);

  const handleSubmit = () => {
    if (rating > 0) {
      submitRating({ templateId, rating, reviewText: reviewText || undefined });
    }
  };

  return (
    <div className="space-y-4">
      {/* Display Average Rating */}
      <div className="flex items-center gap-2">
        <div className="flex">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`h-5 w-5 ${
                star <= Math.round(averageRating || 0)
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground'
              }`}
            />
          ))}
        </div>
        {averageRating !== undefined && (
          <span className="text-sm text-muted-foreground">
            {averageRating.toFixed(1)} ({totalRatings || 0} Bewertungen)
          </span>
        )}
      </div>

      {/* Rating Form */}
      {showForm && (
        <div className="space-y-3 p-4 border rounded-lg bg-card">
          <p className="text-sm font-medium">
            {userRating ? 'Ihre Bewertung bearbeiten' : 'Template bewerten'}
          </p>
          
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => setRating(star)}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  className={`h-6 w-6 ${
                    star <= (hoveredRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-muted-foreground'
                  }`}
                />
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Optional: Schreiben Sie eine Rezension..."
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={3}
          />

          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || isPending}
            size="sm"
          >
            {isPending ? 'Speichern...' : userRating ? 'Bewertung aktualisieren' : 'Bewertung abgeben'}
          </Button>
        </div>
      )}
    </div>
  );
};