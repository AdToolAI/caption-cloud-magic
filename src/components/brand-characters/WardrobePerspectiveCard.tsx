import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ArrowLeft, Sparkles, ImageIcon, Save, Check, ZoomIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OutfitLightbox, type LightboxFrame } from './OutfitLightbox';

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
  onSaved?: () => void;
}

export function WardrobePerspectiveCard({
  avatarId, themePack, outfitId, outfitLabel, fallbackImageUrl, onBack, onSaved,
}: Props) {
  const qc = useQueryClient();
  const queryKey = ['wardrobe-perspectives', avatarId, themePack, outfitId];
  const [savedId, setSavedId] = useState<string | null>(null);

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

  const byPerspective = useMemo(
    () => new Map(rows.map((r) => [r.perspective, r.image_url])),
    [rows],
  );
  const isBusy = generate.isPending;
  const allFour =
    !!byPerspective.get('front') && !!byPerspective.get('back') &&
    !!byPerspective.get('side')  && !!byPerspective.get('top');

  const save = useMutation({
    mutationFn: async () => {
      const front = byPerspective.get('front')!;
      const back = byPerspective.get('back') ?? null;
      const side = byPerspective.get('side') ?? null;
      const top = byPerspective.get('top') ?? null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { data, error } = await (supabase as any)
        .from('avatar_outfit_looks')
        .insert({
          user_id: user.id,
          avatar_id: avatarId,
          name: outfitLabel,
          theme_pack: themePack,
          outfit_id: outfitId,
          cover_url: front,
          front_url: front,
          back_url: back,
          side_url: side,
          top_url: top,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setSavedId(id);
      toast.success('Outfit saved to your library');
      qc.invalidateQueries({ queryKey: ['avatar-outfit-looks', avatarId] });
      onSaved?.();
    },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const showInitialGenerateCTA = !isLoading && rows.length === 0 && !isBusy;

  return (
    <Card className="p-4 bg-card/60 border-primary/15 h-fit space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Portrait
        </Button>
        {rows.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-primary"
            onClick={() => generate.mutate()}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Regenerate
          </Button>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outfit</p>
        <h3 className="font-serif text-lg leading-tight">{outfitLabel}</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          4 perspectives — same face, same outfit
        </p>
      </div>

      {showInitialGenerateCTA ? (
        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-6 text-center space-y-3">
          <div className="grid grid-cols-2 gap-2 opacity-30 pointer-events-none">
            {PERSPECTIVES.map((p) => (
              <div key={p.id} className="aspect-[3/4] rounded-md bg-muted/30 flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
          <Button onClick={() => generate.mutate()} className="w-full" size="sm">
            <Sparkles className="h-4 w-4 mr-2" />
            Generate 4 perspectives
          </Button>
          <p className="text-[10px] text-muted-foreground">~30 seconds · identity & outfit locked</p>
        </div>
      ) : (
        <>
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

          {isBusy && (
            <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Locking face & outfit · generating angles…
            </p>
          )}

          {allFour && (
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !!savedId}
              size="sm"
              className="w-full"
              variant={savedId ? 'secondary' : 'default'}
            >
              {save.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Saving…</>
              ) : savedId ? (
                <><Check className="h-3.5 w-3.5 mr-2" /> Saved to library</>
              ) : (
                <><Save className="h-3.5 w-3.5 mr-2" /> Save outfit to library</>
              )}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
