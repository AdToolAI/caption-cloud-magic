// Stage 2 — Frame-First UI for Composer SceneCard
//
// Renders a "Generate still frames" button below the scene's prompt area.
// On click → calls `generate-scene-still` (1–4 Nano-Banana variants), shows a
// thumbnail grid, and lets the user click a variant to set it as the scene's
// reference image (which becomes the i2v first frame for the video render).

import { useState } from 'react';
import { Sparkles, Loader2, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Variant {
  url: string;
  index: number;
}

interface Props {
  projectId: string;
  sceneId: string;
  prompt: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  referenceImageUrl?: string;
  /** Existing brand-character / location reference to guide composition. */
  composeHintImageUrl?: string;
  selectedReferenceUrl?: string;
  onPick: (url: string) => void;
  language?: 'en' | 'de' | 'es';
}

export default function SceneStillFrameStudio({
  projectId,
  sceneId,
  prompt,
  aspectRatio,
  composeHintImageUrl,
  selectedReferenceUrl,
  onPick,
  language = 'en',
}: Props) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<2 | 4>(2);

  const generate = async () => {
    if (!prompt?.trim()) {
      toast.error(
        language === 'de'
          ? 'Erst einen Prompt schreiben.'
          : language === 'es'
          ? 'Escribe primero un prompt.'
          : 'Write a prompt first.',
      );
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-scene-still', {
        body: {
          projectId,
          sceneId,
          prompt,
          variants: count,
          aspectRatio,
          referenceImageUrl: composeHintImageUrl,
        },
      });
      if (error) throw error;
      const list = (data as any)?.variants as Variant[] | undefined;
      if (!list || list.length === 0) throw new Error('No variants returned');
      setVariants(list);
      toast.success(
        (data as any)?.cached
          ? language === 'de' ? 'Cache-Treffer' : 'Cache hit'
          : language === 'de' ? `${list.length} Frames generiert` : `${list.length} frames generated`,
      );
    } catch (e: any) {
      console.error(e);
      toast.error(
        e?.message?.includes('402')
          ? language === 'de' ? 'AI-Credits aufgebraucht' : 'AI credits exhausted'
          : e?.message ?? (language === 'de' ? 'Generierung fehlgeschlagen' : 'Generation failed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const pick = (url: string) => {
    onPick(url);
    toast.success(
      language === 'de'
        ? 'Als Referenz-Frame gesetzt'
        : language === 'es'
        ? 'Establecido como fotograma de referencia'
        : 'Set as reference frame',
    );
  };

  return (
    <div className="space-y-2 p-2 rounded-md border border-primary/15 bg-primary/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-medium text-foreground/90">
            {language === 'de'
              ? 'Frame-First Vorschau'
              : language === 'es'
              ? 'Vista previa Frame-First'
              : 'Frame-First Preview'}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {language === 'de'
              ? '— erst stillen Frame prüfen, dann Video rendern'
              : language === 'es'
              ? '— revisa el fotograma antes de renderizar'
              : '— inspect a still before burning video credits'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value) as 2 | 4)}
            disabled={loading}
            className="text-[10px] h-6 rounded border border-border/40 bg-background/60 px-1"
          >
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={generate}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : variants.length > 0 ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {variants.length > 0
              ? language === 'de' ? 'Neu generieren' : language === 'es' ? 'Regenerar' : 'Regenerate'
              : language === 'de' ? 'Frames generieren' : language === 'es' ? 'Generar fotogramas' : 'Generate frames'}
          </Button>
        </div>
      </div>

      {variants.length > 0 && (
        <div className={cn('grid gap-1.5', count === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
          {variants.map((v) => {
            const active = selectedReferenceUrl === v.url;
            return (
              <button
                key={v.index}
                type="button"
                onClick={() => pick(v.url)}
                className={cn(
                  'relative aspect-video rounded overflow-hidden border-2 transition-all',
                  active
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border/30 hover:border-primary/60',
                )}
              >
                <img src={v.url} alt={`Variant ${v.index + 1}`} className="w-full h-full object-cover" />
                {active && (
                  <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
