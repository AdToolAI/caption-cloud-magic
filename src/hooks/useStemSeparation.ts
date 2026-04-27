import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAIVideoWallet } from './useAIVideoWallet';

export const STEM_SEPARATION_COST_EUR = 0.20;

export interface SeparatedStem {
  type: 'vocals' | 'drums' | 'bass' | 'other';
  url: string;
  assetId?: string;
}

export function useStemSeparation() {
  const [loading, setLoading] = useState(false);
  const { refetch: refetchWallet } = useAIVideoWallet();

  const separateStems = async (params: {
    audioUrl: string;
    assetId?: string;
    title?: string;
  }): Promise<SeparatedStem[] | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('separate-audio-stems', {
        body: params,
      });

      if (error) {
        const errPayload: any = (error as any).context?.body
          ? await (error as any).context.body.text().then((t: string) => { try { return JSON.parse(t); } catch { return null; } })
          : null;

        const code = errPayload?.code;
        const msg = errPayload?.error || error.message;

        if (code === 'INSUFFICIENT_CREDITS' || code === 'NO_WALLET') {
          toast.error(msg, {
            description: 'Bitte AI Credits aufladen.',
            action: {
              label: 'Credits kaufen',
              onClick: () => { window.location.href = '/ai-video-purchase-credits'; },
            },
          });
        } else {
          toast.error('Stem-Separation fehlgeschlagen', { description: msg });
        }
        return null;
      }

      if (!data?.success) {
        toast.error(data?.error || 'Unbekannter Fehler');
        return null;
      }

      toast.success('🎚️ Stems extrahiert!', {
        description: `${data.stems.length} Spuren in deiner Bibliothek`,
      });

      await refetchWallet();
      return data.stems as SeparatedStem[];
    } catch (err: any) {
      console.error('Stem separation error:', err);
      toast.error('Fehler bei der Stem-Separation', { description: err.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { separateStems, loading };
}
