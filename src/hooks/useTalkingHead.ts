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
      const { data, error } = await supabase.functions.invoke('generate-talking-head', {
        body: params,
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: 'Talking-Head wird generiert',
        description: 'Die Generierung läuft im Hintergrund (1–3 Minuten).',
      });
      return data;
    } catch (error) {
      console.error('[useTalkingHead] Error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Generierung fehlgeschlagen',
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
