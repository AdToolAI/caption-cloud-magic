import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Star, Sun, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type { LocationVariant, MotionStudioLocation } from '@/types/motion-studio';

interface LocationLightingGridProps {
  location: MotionStudioLocation;
  onPrimaryChanged?: (variant: LocationVariant) => void;
}

const PRESET_VIBES: Array<{ id: string; label: string; prompt: string }> = [
  { id: 'sunrise', label: 'Sunrise', prompt: 'soft warm sunrise lighting, low golden sun, long shadows' },
  { id: 'midday', label: 'Midday', prompt: 'bright midday sunlight, neutral white balance, sharp shadows' },
  { id: 'golden_hour', label: 'Golden Hour', prompt: 'cinematic golden hour, warm orange light, soft rim light' },
  { id: 'blue_hour', label: 'Blue Hour', prompt: 'cool blue hour twilight, deep blue sky, ambient cyan light' },
  { id: 'night', label: 'Night', prompt: 'night scene, practical lights, moody darkness, neon accents' },
  { id: 'overcast', label: 'Overcast', prompt: 'overcast soft daylight, even diffuse lighting, no harsh shadows' },
];

/**
 * Lighting / vibe variants of a location.
 * Each preset relights the original via Image-to-Image (`generate-location-vibes`).
 */
export default function LocationLightingGrid({
  location,
  onPrimaryChanged,
}: LocationLightingGridProps) {
  const {
    listLocationVariants,
    insertLocationVariant,
    setLocationPrimaryVariant,
    deleteLocationVariant,
    persistRemoteImage,
  } = useMotionStudioLibrary();

  const [variants, setVariants] = useState<LocationVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingVibe, setGeneratingVibe] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const v = await listLocationVariants(location.id);
      setVariants(v);
    } finally {
      setLoading(false);
    }
  }, [location.id, listLocationVariants]);

  useEffect(() => {
    reload();
  }, [reload]);

  const generate = useCallback(
    async (preset: { id: string; label: string; prompt: string }) => {
      if (!location.reference_image_url) {
        toast.error('Diese Location braucht ein Referenzbild');
        return;
      }
      setGeneratingVibe(preset.id);
      try {
        const { data, error } = await supabase.functions.invoke('generate-location-vibes', {
          body: {
            sourceImageUrl: location.reference_image_url,
            description: location.description,
            vibe: preset.id,
            vibePrompt: preset.prompt,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.imageUrl) throw new Error('Kein Bild generiert');

        const persisted =
          (await persistRemoteImage(data.imageUrl, 'location', location.id)) ?? data.imageUrl;
        await insertLocationVariant(location.id, preset.id, persisted, data.seed ?? null);
        toast.success(`„${preset.label}" generiert ✨`);
        await reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generierung fehlgeschlagen';
        toast.error(msg);
      } finally {
        setGeneratingVibe(null);
      }
    },
    [location, insertLocationVariant, persistRemoteImage, reload],
  );

  const handleSetPrimary = useCallback(
    async (variant: LocationVariant) => {
      const ok = await setLocationPrimaryVariant(location.id, variant.id);
      if (ok) {
        toast.success('Primäre Lichtstimmung gesetzt');
        await reload();
        onPrimaryChanged?.(variant);
      }
    },
    [location.id, setLocationPrimaryVariant, reload, onPrimaryChanged],
  );

  const handleDelete = useCallback(
    async (variant: LocationVariant) => {
      const ok = await deleteLocationVariant(variant.id);
      if (ok) {
        setVariants((prev) => prev.filter((v) => v.id !== variant.id));
      }
    },
    [deleteLocationVariant],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-xs font-semibold tracking-wide text-foreground/90">
          Lichtstimmungen · Location-Scouting
        </p>
        <p className="text-[11px] text-muted-foreground">
          Lass die Location in verschiedenen Tageszeiten / Stimmungen rendern.
        </p>
      </div>

      {/* Preset row */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_VIBES.map((p) => {
          const isGen = generatingVibe === p.id;
          return (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              disabled={!!generatingVibe || !location.reference_image_url}
              onClick={() => generate(p)}
              className="h-7 px-2.5 gap-1.5 text-[10.5px]"
            >
              {isGen ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sun className="h-3 w-3" />
              )}
              {p.label}
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lädt Varianten...
        </div>
      ) : variants.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
          Noch keine Variationen — wähle oben eine Stimmung.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {variants.map((v) => {
            const preset = PRESET_VIBES.find((p) => p.id === v.vibe);
            return (
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
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                />
                <div className="absolute top-1 left-1">
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                    {preset?.label ?? v.vibe}
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
                      <Wand2 className="h-2.5 w-2.5" />
                      Übernehmen
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
            );
          })}
        </div>
      )}
    </div>
  );
}
