import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Coins, Gift, ShoppingCart, Check, Play } from 'lucide-react';
import type { MarketplaceTemplate } from '@/types/marketplace';

interface Props {
  template: MarketplaceTemplate;
  isOwned: boolean;
  onPreview: (t: MarketplaceTemplate) => void;
  onUse: (t: MarketplaceTemplate) => void;
  onPurchase: (t: MarketplaceTemplate) => void;
}

export function MarketplaceTemplateCard({ template, isOwned, onPreview, onUse, onPurchase }: Props) {
  const isFree = template.pricing_type === 'free' || template.price_credits === 0;

  return (
    <Card className="overflow-hidden flex flex-col group">
      <button
        type="button"
        onClick={() => onPreview(template)}
        className="relative aspect-video bg-muted overflow-hidden"
      >
        {template.thumbnail_url ? (
          <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No preview</div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="h-10 w-10 text-white" />
        </div>
        <div className="absolute top-2 left-2 flex gap-1.5">
          {isFree ? (
            <Badge className="bg-emerald-500/90 text-white border-none gap-1"><Gift className="h-3 w-3" />Free</Badge>
          ) : (
            <Badge className="bg-amber-500/90 text-white border-none gap-1"><Coins className="h-3 w-3" />{template.price_credits}</Badge>
          )}
          {isOwned && (
            <Badge className="bg-primary/90 text-primary-foreground border-none gap-1"><Check className="h-3 w-3" />Owned</Badge>
          )}
        </div>
      </button>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-foreground line-clamp-1">{template.name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{template.description}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="capitalize">{template.use_case?.replace(/_/g, ' ')}</span>
          {template.total_ratings > 0 ? (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {Number(template.average_rating).toFixed(1)} ({template.total_ratings})
            </span>
          ) : (
            <span className="opacity-60">No ratings yet</span>
          )}
        </div>

        {isOwned ? (
          <Button onClick={() => onUse(template)} className="w-full">
            <Check className="h-4 w-4 mr-2" />Use Template
          </Button>
        ) : isFree ? (
          <Button onClick={() => onPurchase(template)} variant="outline" className="w-full">
            <Gift className="h-4 w-4 mr-2" />Get Free
          </Button>
        ) : (
          <Button onClick={() => onPurchase(template)} className="w-full">
            <ShoppingCart className="h-4 w-4 mr-2" />Buy for {template.price_credits} Credits
          </Button>
        )}
      </div>
    </Card>
  );
}
