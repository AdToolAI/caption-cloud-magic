import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Coins, Gift, ShoppingCart, Check } from 'lucide-react';
import { useTemplateRatings, useSubmitRating } from '@/hooks/useMarketplace';
import { Textarea } from '@/components/ui/textarea';
import { useCredits } from '@/hooks/useCredits';
import type { MarketplaceTemplate } from '@/types/marketplace';

interface Props {
  template: MarketplaceTemplate | null;
  isOwned: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: (t: MarketplaceTemplate) => void;
  onUse: (t: MarketplaceTemplate) => void;
}

export function MarketplaceTemplateDetailDialog({ template, isOwned, open, onOpenChange, onPurchase, onUse }: Props) {
  const { data: ratings = [] } = useTemplateRatings(template?.id ?? null);
  const submitRating = useSubmitRating();
  const { balance } = useCredits();
  const [myRating, setMyRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  if (!template) return null;
  const isFree = template.pricing_type === 'free' || template.price_credits === 0;
  const canAfford = isFree || (balance?.balance ?? 0) >= template.price_credits;

  const handleRate = () => {
    if (!myRating) return;
    submitRating.mutate({ templateId: template.id, rating: myRating, reviewText: reviewText || undefined });
    setMyRating(0);
    setReviewText('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-2xl">{template.name}</DialogTitle>
              <DialogDescription className="mt-1">{template.description}</DialogDescription>
            </div>
            {isFree ? (
              <Badge className="bg-emerald-500/90 text-white border-none gap-1 shrink-0"><Gift className="h-3 w-3" />Free</Badge>
            ) : (
              <Badge className="bg-amber-500/90 text-white border-none gap-1 shrink-0"><Coins className="h-3 w-3" />{template.price_credits} Credits</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="aspect-video rounded-lg overflow-hidden bg-muted">
          {template.preview_video_url ? (
            <video src={template.preview_video_url} controls autoPlay loop muted className="w-full h-full object-cover" />
          ) : template.thumbnail_url ? (
            <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">No preview available</div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Use Case" value={template.use_case?.replace(/_/g, ' ')} />
          <Stat label="Style" value={template.style} />
          <Stat label="Format" value={template.aspect_ratio} />
          <Stat label="Duration" value={`${template.duration_seconds}s`} />
        </div>

        {template.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {template.tags.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
          </div>
        )}

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Reviews</h4>
            {template.total_ratings > 0 && (
              <span className="flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {Number(template.average_rating).toFixed(1)} ({template.total_ratings})
              </span>
            )}
          </div>
          {ratings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet — be the first to rate this template.</p>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {ratings.map(r => (
                <div key={r.id} className="text-sm border-l-2 border-primary/30 pl-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                    ))}
                  </div>
                  {r.review_text && <p className="text-muted-foreground mt-1">{r.review_text}</p>}
                </div>
              ))}
            </div>
          )}

          {isOwned && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Rate this template</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setMyRating(n)}>
                    <Star className={`h-6 w-6 ${n <= myRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-amber-300'}`} />
                  </button>
                ))}
              </div>
              <Textarea placeholder="Optional review…" value={reviewText} onChange={e => setReviewText(e.target.value)} maxLength={2000} rows={2} />
              <Button size="sm" onClick={handleRate} disabled={!myRating || submitRating.isPending}>
                Submit Rating
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          {isOwned ? (
            <Button onClick={() => onUse(template)} className="w-full sm:w-auto">
              <Check className="h-4 w-4 mr-2" />Use Template
            </Button>
          ) : isFree ? (
            <Button onClick={() => onPurchase(template)} className="w-full sm:w-auto">
              <Gift className="h-4 w-4 mr-2" />Get Free
            </Button>
          ) : (
            <Button onClick={() => onPurchase(template)} disabled={!canAfford} className="w-full sm:w-auto">
              <ShoppingCart className="h-4 w-4 mr-2" />
              {canAfford ? `Buy for ${template.price_credits} Credits` : `Not enough credits (${balance?.balance ?? 0}/${template.price_credits})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="bg-muted/50 rounded-md p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium capitalize text-sm">{value || '—'}</div>
    </div>
  );
}
