import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check } from 'lucide-react';
import { AI_VIDEO_CREDIT_PACKS } from '@/config/aiVideoCredits';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const AIVideoCreditPurchase = () => {
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (packId: keyof typeof AI_VIDEO_CREDIT_PACKS) => {
    setLoading(packId);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-video-purchase-credits', {
        body: { packId }
      });

      if (error) throw error;

      // Redirect to Stripe Checkout
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error('Fehler beim Kaufvorgang');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Object.entries(AI_VIDEO_CREDIT_PACKS).map(([key, pack]) => (
        <Card 
          key={key}
          className={`p-6 relative ${pack.popular ? 'border-primary border-2' : ''}`}
        >
          {pack.badge && (
            <Badge className="absolute top-4 right-4" variant="secondary">
              {pack.badge}
            </Badge>
          )}
          {pack.bestValue && (
            <Badge className="absolute top-4 right-4 bg-gradient-to-r from-purple-500 to-pink-500">
              <Sparkles className="w-3 h-3 mr-1" />
              Best Value
            </Badge>
          )}
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{pack.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{pack.description}</p>
              <div className="mt-3">
                <span className="text-3xl font-bold">{pack.priceEuros}€</span>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span>{pack.priceEuros.toFixed(2)}€ Credits</span>
              </div>
              {pack.bonusPercent > 0 && (
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="text-primary font-medium">
                    +{pack.bonusEuros.toFixed(2)}€ Bonus
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span>= {pack.totalCredits.toFixed(2)}€ gesamt</span>
              </div>
              <div className="pt-2 border-t">
                <span className="text-xs">
                  ≈ {Math.floor(pack.totalCredits / 0.61)} Sekunden Video
                </span>
              </div>
            </div>

            <Button 
              className="w-full"
              onClick={() => handlePurchase(key as any)}
              disabled={loading !== null}
              variant={pack.popular ? 'default' : 'outline'}
            >
              {loading === key ? 'Lädt...' : 'Jetzt kaufen'}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};
