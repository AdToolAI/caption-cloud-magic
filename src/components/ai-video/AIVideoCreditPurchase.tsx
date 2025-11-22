import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check } from 'lucide-react';
import { AI_VIDEO_CREDIT_PACKS } from '@/config/aiVideoCredits';
import { Currency } from '@/config/pricing';
import { detectUserCurrency, formatPrice, getCurrencySymbol } from '@/lib/currency';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const AIVideoCreditPurchase = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>(detectUserCurrency());

  const handlePurchase = async (packId: keyof typeof AI_VIDEO_CREDIT_PACKS) => {
    setLoading(packId);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-video-purchase-credits', {
        body: { packId, currency }
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
    <div className="space-y-6">
      {/* Currency Toggle */}
      <div className="flex justify-center gap-2">
        <Button
          variant={currency === 'EUR' ? 'default' : 'outline'}
          onClick={() => setCurrency('EUR')}
          size="sm"
        >
          🇪🇺 EUR (€)
        </Button>
        <Button
          variant={currency === 'USD' ? 'default' : 'outline'}
          onClick={() => setCurrency('USD')}
          size="sm"
        >
          🇺🇸 USD ($)
        </Button>
      </div>

      {/* Credit Packs Grid */}
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
                <h3 className="text-lg font-semibold">{pack.name[currency]}</h3>
                <p className="text-xs text-muted-foreground mt-1">{pack.description[currency]}</p>
                <div className="mt-3">
                  <span className="text-3xl font-bold">
                    {formatPrice(pack.price[currency], currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span>
                    {formatPrice(pack.price[currency], currency)} Credits
                  </span>
                </div>
                {pack.bonusPercent > 0 && (
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span className="text-primary font-medium">
                      +{formatPrice(pack.bonus[currency], currency)} Bonus
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span>
                    = {formatPrice(pack.totalCredits[currency], currency)} gesamt
                  </span>
                </div>
                <div className="pt-2 border-t">
                  <span className="text-xs">
                    ≈ {Math.floor(pack.totalCredits[currency] / 0.61)} Sekunden Video
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
    </div>
  );
};
