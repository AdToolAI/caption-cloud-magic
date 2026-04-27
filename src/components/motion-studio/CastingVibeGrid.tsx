import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Star, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type { CharacterVariant, MotionStudioCharacter } from '@/types/motion-studio';

interface CastingVibeGridProps {
  character: MotionStudioCharacter;
  onPrimaryChanged?: (variant: CharacterVariant) => void;
}

const VIBE_LABELS: Record<string, string> = {
  realistic: 'Realistic',
  cinematic: 'Cinematic',
  editorial: 'Editorial',
  documentary: 'Documentary',
};

/**
 * Multi-Vibe Casting Grid for a character.
 * Generates 4 stylistic variants in parallel via the `multi-vibe` mode of
 * `generate-character-sheet`, persists them, and lets the user pick the
 * primary vibe (which is mirrored back into the character's reference image).
 */
export default function CastingVibeGrid({ character, onPrimaryChanged }: CastingVibeGridProps) {
  const {
    listCharacterVariants,
    insertCharacterVariant,
    setCharacterPrimaryVariant,
    deleteCharacterVariant,
    persistRemoteImage,
  } = useMotionStudioLibrary();

  const [variants, setVariants] = useState<CharacterVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const v = await listCharacterVariants(character.id);
      setVariants(v);
    } finally {
      setLoading(false);
    }
  }, [character.id, listCharacterVariants]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleGenerate = useCallback(async () => {
    if (!character.description?.trim()) {
      toast.error('Charakter braucht eine Beschreibung');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-character-sheet', {
        body: {
          mode: 'multi-vibe',
          name: character.name,
          description: character.description,
          signatureItems: character.signature_items,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const incoming: Array<{ vibe: string; imageUrl: string; seed?: string }> =
        data?.variants ?? [];
      if (incoming.length === 0) throw new Error('Keine Varianten erhalten');

      // Persist each (URL → bucket) and insert DB row in parallel
      await Promise.all(
        incoming.map(async (v) => {
          const persisted = (await persistRemoteImage(v.imageUrl, 'character', character.id)) ?? v.imageUrl;
          await insertCharacterVariant(character.id, v.vibe, persisted, v.seed ?? null, false);
        }),
      );
      toast.success(`${incoming.length} Casting-Varianten generiert ✨`);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generierung fehlgeschlagen';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [character, insertCharacterVariant, persistRemoteImage, reload]);

  const handleSetPrimary = useCallback(
    async (variant: CharacterVariant) => {
      const ok = await setCharacterPrimaryVariant(character.id, variant.id);
      if (ok) {
        toast.success(`„${VIBE_LABELS[variant.vibe] ?? variant.vibe}" ist jetzt primär`);
        await reload();
        onPrimaryChanged?.(variant);
      }
    },
    [character.id, setCharacterPrimaryVariant, reload, onPrimaryChanged],
  );

  const handleDelete = useCallback(
    async (variant: CharacterVariant) => {
      const ok = await deleteCharacterVariant(variant.id);
      if (ok) {
        setVariants((prev) => prev.filter((v) => v.id !== variant.id));
        toast.success('Variante entfernt');
      }
    },
    [deleteCharacterVariant],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold tracking-wide text-foreground/90">
            Casting · Multi-Vibe
          </p>
          <p className="text-[11px] text-muted-foreground">
            4 Visualisierungen pro Charakter — wähle das passende „Vibe".
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={generating}
          onClick={handleGenerate}
          className="h-8 gap-1.5 text-[11px]"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Wand2 className="h-3 w-3" />
          )}
          Casting starten
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lädt Varianten...
        </div>
      ) : variants.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
          Noch keine Casting-Varianten — klicke „Casting starten" um 4 Looks zu generieren.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {variants.map((v) => (
            <div
              key={v.id}
              className={`group relative rounded-md overflow-hidden border transition ${
                v.is_primary
                  ? 'border-primary ring-2 ring-primary/40'
                  : 'border-border/40 hover:border-primary/40'
              }`}
            >
              <img
                src={v.image_url}
                alt={v.vibe}
                className="w-full aspect-[3/4] object-cover"
                loading="lazy"
              />
              <div className="absolute top-1 left-1">
                <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                  {VIBE_LABELS[v.vibe] ?? v.vibe}
                </Badge>
              </div>
              {v.is_primary && (
                <div className="absolute top-1 right-1">
                  <div className="bg-primary text-primary-foreground rounded-full p-1">
                    <Star className="h-2.5 w-2.5 fill-current" />
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                {!v.is_primary && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[10px] gap-1 flex-1"
                    onClick={() => handleSetPrimary(v)}
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    Wählen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20"
                  onClick={() => handleDelete(v)}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
