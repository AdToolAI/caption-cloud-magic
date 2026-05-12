import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutfitLook } from '@/hooks/useSavedOutfits';

const PERSPECTIVES: Array<{ key: keyof OutfitLook; label: string }> = [
  { key: 'front_url', label: 'Front' },
  { key: 'back_url', label: 'Back' },
  { key: 'side_url', label: 'Side' },
  { key: 'top_url', label: 'Top' },
];

export function SavedOutfitViewerCard({
  look, onBack,
}: { look: OutfitLook; onBack: () => void }) {
  return (
    <Card className="p-4 bg-card/60 border-primary/15 h-fit space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">
        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Portrait
      </Button>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saved outfit</p>
        <h3 className="font-serif text-lg leading-tight">{look.name}</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">From your library</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PERSPECTIVES.map(({ key, label }) => {
          const url = (look as any)[key] as string | null;
          return (
            <div
              key={label}
              className={cn('relative aspect-[3/4] rounded-md overflow-hidden border border-border/40 bg-muted/20')}
            >
              {url && (
                <img src={url} alt={`${look.name} — ${label}`} loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5">
                <span className="text-[10px] font-medium text-white drop-shadow">{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
