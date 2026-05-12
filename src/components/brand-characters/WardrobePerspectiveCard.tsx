import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ArrowLeft, Sparkles, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PERSPECTIVES = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
] as const;

interface Props {
  avatarId: string;
  themePack: string;
  outfitId: string;
  outfitLabel: string;
  fallbackImageUrl: string;
  onBack: () => void;
}

export function WardrobePerspectiveCard({
  avatarId, themePack, outfitId, outfitLabel, fallbackImageUrl, onBack,
}: Props) {
  const qc = useQueryClient();
  const queryKey = ['wardrobe-perspectives', avatarId, themePack, outfitId];

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('wardrobe_perspective_renders')
        .select('perspective, image_url')
        .eq('avatar_id', avatarId)
        .eq('theme_pack', themePack)
        .eq('outfit_id', outfitId);
      if (error) throw error;
      return (data || []) as Array<{ perspective: string; image_url: string }>;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-wardrobe-perspectives', {
        body: {
          avatar_id: avatarId,
          theme_pack: themePack,
          outfit_id: outfitId,
          outfit_label: outfitLabel,
          source_image_url: fallbackImageUrl,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Generated ${data?.generated ?? 0} of 4 perspectives`);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message || 'Perspective generation failed'),
  });

  // Auto-fire once if we have nothing yet
  useEffect(() => {
    if (!isLoading && rows.length === 0 && !generate.isPending) {
      generate.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const byPerspective = new Map(rows.map((r) => [r.perspective, r.image_url]));
  const isBusy = generate.isPending;

  return (
    <Card className="p-4 bg-card/60 border-primary/15 h-fit space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Portrait
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-primary"
          onClick={() => generate.mutate()}
          disabled={isBusy}
        >
          {isBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          {rows.length > 0 ? 'Regenerate' : 'Generate'}
        </Button>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outfit</p>
        <h3 className="font-serif text-lg leading-tight">{outfitLabel}</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          4 perspectives — same face, same outfit
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PERSPECTIVES.map((p) => {
          const url = byPerspective.get(p.id);
          return (
            <div
              key={p.id}
              className={cn(
                'relative aspect-[3/4] rounded-md overflow-hidden border border-border/40 bg-muted/20',
              )}
            >
              {url ? (
                <img
                  src={url}
                  alt={`${outfitLabel} — ${p.label}`}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <>
                  <img
                    src={fallbackImageUrl}
                    alt={`${outfitLabel} placeholder`}
                    className="absolute inset-0 w-full h-full object-cover opacity-25"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1">
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                  </div>
                </>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5">
                <span className="text-[10px] font-medium text-white drop-shadow">{p.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
