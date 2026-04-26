import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Coins, Gift, Info, Loader2 } from 'lucide-react';
import { useSubmitTemplateToMarketplace } from '@/hooks/useMarketplace';
import type { MarketplaceTemplate, PricingType } from '@/types/marketplace';

interface Props {
  template: MarketplaceTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REVENUE_SHARE = 70;

export function SubmitToMarketplaceDialog({ template, open, onOpenChange }: Props) {
  const [pricingType, setPricingType] = useState<PricingType>('free');
  const [priceCredits, setPriceCredits] = useState(100);
  const submit = useSubmitTemplateToMarketplace();

  if (!template) return null;

  const creatorEarning = Math.floor(priceCredits * REVENUE_SHARE / 100);
  const platformFee = priceCredits - creatorEarning;

  const handleSubmit = async () => {
    await submit.mutateAsync({
      templateId: template.id,
      pricingType,
      priceCredits: pricingType === 'free' ? 0 : priceCredits,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Im Marketplace veröffentlichen</DialogTitle>
          <DialogDescription>
            "{template.name}" mit der Community teilen. Free → sofort live. Premium → Admin-Review.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={pricingType} onValueChange={v => setPricingType(v as PricingType)} className="gap-3">
          <Label htmlFor="opt-free" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
            <RadioGroupItem value="free" id="opt-free" className="mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium"><Gift className="h-4 w-4 text-emerald-500" />Free Template</div>
              <p className="text-xs text-muted-foreground mt-1">Sofort verfügbar. Du verdienst zwar nichts, baust aber Reputation auf und sammelst Bewertungen.</p>
            </div>
          </Label>

          <Label htmlFor="opt-premium" className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
            <RadioGroupItem value="premium" id="opt-premium" className="mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium"><Coins className="h-4 w-4 text-amber-500" />Premium Template</div>
              <p className="text-xs text-muted-foreground mt-1">Käufer zahlen Credits, du erhältst {REVENUE_SHARE}%. Wartet auf Admin-Freigabe.</p>
            </div>
          </Label>
        </RadioGroup>

        {pricingType === 'premium' && (
          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Preis: <span className="font-bold text-foreground">{priceCredits} Credits</span></Label>
                <span className="text-xs text-muted-foreground">25 – 1000</span>
              </div>
              <Slider min={25} max={1000} step={25} value={[priceCredits]} onValueChange={([v]) => setPriceCredits(v)} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-2">
                <div className="text-xs text-muted-foreground">Du bekommst (pro Verkauf)</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">{creatorEarning} Credits</div>
              </div>
              <div className="bg-muted rounded-md p-2">
                <div className="text-xs text-muted-foreground">Plattform-Anteil</div>
                <div className="font-bold">{platformFee} Credits</div>
              </div>
            </div>

            <div className="flex gap-2 text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/30 rounded-md p-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
              <span>Earnings werden direkt deinem Credit-Wallet gutgeschrieben und können für AI-Generierung, Renderings etc. genutzt werden.</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {pricingType === 'free' ? 'Sofort veröffentlichen' : 'Zur Prüfung einreichen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
