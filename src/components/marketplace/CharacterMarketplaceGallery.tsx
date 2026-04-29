import { useState } from 'react';
import { useMarketplaceCharacters, useMyPurchasedCharacterIds, usePurchaseCharacter, type MarketplaceCharacter } from '@/hooks/useCharacterMarketplace';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, IdCard, UserCheck, Star, ShieldCheck, Coins, Gift, Flag } from 'lucide-react';
import { BuyerLicenseAcceptDialog } from './BuyerLicenseAcceptDialog';
import { CharacterReportDialog } from './CharacterReportDialog';

const ORIGIN_BADGE: Record<string, { label: string; icon: typeof Sparkles; class: string }> = {
  ai_generated: { label: 'AI-Generated', icon: Sparkles, class: 'bg-violet-500/10 text-violet-500 border-violet-500/30' },
  licensed_real_person: { label: 'Licensed Real Person', icon: IdCard, class: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  self_portrait: { label: 'Self-Portrait', icon: UserCheck, class: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' },
};

export function CharacterMarketplaceGallery() {
  const { data: characters = [], isLoading } = useMarketplaceCharacters();
  const { data: ownedIds = [] } = useMyPurchasedCharacterIds();
  const purchase = usePurchaseCharacter();
  const [licenseFor, setLicenseFor] = useState<MarketplaceCharacter | null>(null);
  const [reportFor, setReportFor] = useState<MarketplaceCharacter | null>(null);

  const ownedSet = new Set(ownedIds);

  const handleConfirm = async () => {
    if (!licenseFor) return;
    const res = await purchase.mutateAsync(licenseFor.id);
    if (res.ok) setLicenseFor(null);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (characters.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No characters available yet. Be the first to publish one!</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {characters.map((c) => {
          const origin = c.origin_type ? ORIGIN_BADGE[c.origin_type] : null;
          const OriginIcon = origin?.icon ?? Sparkles;
          const owned = ownedSet.has(c.id);
          return (
            <Card key={c.id} className="overflow-hidden flex flex-col">
              <div className="aspect-[4/5] bg-muted relative overflow-hidden">
                {(c.portrait_url || c.reference_image_url) && (
                  <img src={c.portrait_url || c.reference_image_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                )}
                {origin && (
                  <Badge variant="outline" className={`absolute top-2 left-2 ${origin.class}`}>
                    <OriginIcon className="h-3 w-3 mr-1" />
                    {origin.label}
                  </Badge>
                )}
                <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 bg-background/60 hover:bg-background" onClick={() => setReportFor(c)} title="Report">
                  <Flag className="h-3 w-3" />
                </Button>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{c.name}</h3>
                  {c.pricing_type === 'free'
                    ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shrink-0"><Gift className="h-3 w-3 mr-1" />Free</Badge>
                    : <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 shrink-0"><Coins className="h-3 w-3 mr-1" />{c.price_credits}</Badge>}
                </div>
                {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {c.total_ratings > 0 && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500 fill-amber-500" />{c.average_rating.toFixed(1)} ({c.total_ratings})</span>}
                  <span>{c.total_purchases} sales</span>
                  {c.default_voice_name && <span>🎙 {c.default_voice_name}</span>}
                </div>
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 4).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                  </div>
                )}
                <div className="mt-auto pt-2">
                  {owned ? (
                    <Button variant="outline" disabled className="w-full"><ShieldCheck className="h-3 w-3 mr-2" />Owned</Button>
                  ) : (
                    <Button className="w-full" onClick={() => setLicenseFor(c)}>
                      {c.pricing_type === 'free' ? 'Unlock free' : `Buy · ${c.price_credits} credits`}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <BuyerLicenseAcceptDialog
        character={licenseFor}
        open={!!licenseFor}
        onOpenChange={(o) => !o && setLicenseFor(null)}
        onConfirm={handleConfirm}
        pending={purchase.isPending}
      />
      <CharacterReportDialog
        character={reportFor}
        open={!!reportFor}
        onOpenChange={(o) => !o && setReportFor(null)}
      />
    </>
  );
}
