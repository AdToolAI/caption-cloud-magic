import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TalkingHeadParams {
  sceneId?: string;
  projectId?: string;
  imageUrl: string;
  audioUrl?: string;
  text?: string;
  voiceId?: string;
  customVoiceId?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  resolution?: '480p' | '720p';
  /** Briefing-Cast character id — written to composer_scenes.mentioned_character_ids */
  composerCharacterId?: string;
  /** v431 G2.1 — run provenance, acquired by this hook (never set by callers). */
  runId?: string;
  plateGeneration?: number;
}


export interface TalkingHeadResult {
  success: boolean;
  predictionId: string;
  status: string;
  videoUrl: string | null;
  audioUrl: string;
}

export function useTalkingHead() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TalkingHeadResult | null>(null);
  const { toast } = useToast();

  const generate = async (params: TalkingHeadParams): Promise<TalkingHeadResult | null> => {
    setLoading(true);
    try {
      // v431 G2.1 — Run-Provenienz: im Composer-Fall (sceneId gesetzt) wird der
      // Lauf VOR dem Provider-Dispatch über den kanonischen Vertrag erworben und
      // unverändert an die Edge-Function durchgereicht. Schlägt der Erwerb fehl,
      // bleibt das heutige Verhalten erhalten (kein fail-closed in G2.1).
      let runId: string | undefined;
      let plateGeneration: number | undefined;
      if (params.sceneId) {
        try {
          const { data: prep, error: prepErr } = await supabase.functions.invoke(
            'composer-start-scene-generation',
            {
              body: {
                scene_ids: [params.sceneId],
                prepare_only: true,
                reason: 'talking_head',
              },
            },
          );
          if (prepErr) throw prepErr;
          const run = (prep as any)?.runs?.[params.sceneId];
          if (run?.run_id) {
            runId = String(run.run_id);
            plateGeneration = Number(run.generation ?? 0);
          }
        } catch (prepError) {
          console.warn('[useTalkingHead] run acquisition failed, continuing legacy:', prepError);
        }
      }

      const { data, error } = await supabase.functions.invoke('generate-talking-head', {
        body: { ...params, runId, plateGeneration },
      });


      if (error) throw error;

      setResult(data);
      toast({
        title: tx({ de: 'Talking-Head wird generiert', en: 'Talking head is generated', es: 'Se genera cabeza parlante' }),
        description: tx({ de: 'Die Generierung läuft im Hintergrund (1–3 Minuten).', en: 'Generation is running in the background (1–3 minutes).', es: 'La generación se está ejecutando en segundo plano (1-3 minutos).' }),
      });
      return data;
    } catch (error) {
      console.error('[useTalkingHead] Error:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Generierung fehlgeschlagen', en: 'Generation failed', es: 'Error de generación' }),
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Cost estimate: HeyGen Photo Avatar ~0.30 EUR/video (flat) + ~0.05 EUR for TTS
  const estimateCost = (durationSec: number, includesTTS: boolean): number => {
    const heygenCost = 0.30;
    const ttsCost = includesTTS ? 0.05 : 0;
    return Number((heygenCost + ttsCost).toFixed(2));
  };

  return { loading, result, generate, estimateCost };
}
