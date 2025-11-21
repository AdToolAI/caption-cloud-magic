import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, TrendingUp, Eye, Target } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type ABTestVariant = Database['public']['Tables']['ab_test_variants']['Row'];

interface Props {
  variant: ABTestVariant;
  isWinner?: boolean;
  onDeclareWinner?: () => void;
  showActions?: boolean;
}

export function TestVariantCard({ variant, isWinner, onDeclareWinner, showActions }: Props) {
  const engagementRate = variant.engagement_rate || 0;
  const conversionRate = variant.conversion_rate || 0;
  const views = variant.views || 0;
  const impressions = variant.impressions || 0;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">{variant.variant_name}</h3>
            {isWinner && <Trophy className="h-5 w-5 text-yellow-500" />}
          </div>
          <Badge variant={variant.variant_type === 'control' ? 'secondary' : 'default'}>
            {variant.variant_type === 'control' ? 'Control' : 'Variant'}
          </Badge>
        </div>

        {showActions && !isWinner && onDeclareWinner && views >= 100 && (
          <Button size="sm" onClick={onDeclareWinner}>
            <Trophy className="h-4 w-4 mr-2" />
            Als Winner deklarieren
          </Button>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <Eye className="h-3 w-3" />
            Impressions
          </div>
          <p className="text-xl font-bold">{impressions.toLocaleString('de-DE')}</p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <Eye className="h-3 w-3" />
            Views
          </div>
          <p className="text-xl font-bold">{views.toLocaleString('de-DE')}</p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-3 w-3" />
            Engagement
          </div>
          <p className="text-xl font-bold">{engagementRate.toFixed(1)}%</p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <Target className="h-3 w-3" />
            Conversion
          </div>
          <p className="text-xl font-bold">{conversionRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Configuration Preview */}
      {(variant.thumbnail_config || variant.text_config || variant.color_config) && (
        <div className="mt-4 p-3 rounded-lg bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">Konfiguration:</p>
          <div className="space-y-1 text-xs">
            {variant.thumbnail_config && (
              <div>
                <span className="font-medium">Thumbnail:</span>{' '}
                {JSON.stringify(variant.thumbnail_config)}
              </div>
            )}
            {variant.text_config && (
              <div>
                <span className="font-medium">Text:</span>{' '}
                {JSON.stringify(variant.text_config)}
              </div>
            )}
            {variant.color_config && (
              <div>
                <span className="font-medium">Farben:</span>{' '}
                {JSON.stringify(variant.color_config)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sample Size Indicator */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Sample Size</span>
          <span>{views} / 100</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min((views / 100) * 100, 100)}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
