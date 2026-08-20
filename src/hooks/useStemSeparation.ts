import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { tx } from '@/lib/i18nText';
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
            description: tx({ de: 'Bitte AI Credits aufladen.', en: 'Please top up AI credits.', es: 'Por favor, recarga créditos de IA.' }),
            action: {
              label: tx({ de: 'Credits kaufen', en: 'Buy credits', es: 'Comprar créditos' }),
              onClick: () => { window.location.href = '/ai-video-purchase-credits'; },
            },
          });
        } else {
          toast.error(tx({ de: 'Stem-Separation fehlgeschlagen', en: 'Stem separation failed', es: 'Separación de pistas fallida' }), { description: msg });
        }
        return null;
      }

      if (!data?.success) {
        toast.error(data?.error || tx({ de: tx({ de: "Unbekannter Fehler", en: "Unknown error", es: "Error desconocido" }), en: 'Unknown error', es: 'Error desconocido' }));
        return null;
      }

      toast.success(tx({ de: '🎚️ Stems extrahiert!', en: '🎚️ Stems extracted!', es: '🎚️ ¡Pistas extraídas!' }), {
        description: tx({ de: `${data.stems.length} Spuren in deiner Bibliothek`, en: `${data.stems.length} tracks in your library`, es: `${data.stems.length} pistas en tu biblioteca` }),
      });

      await refetchWallet();
      return data.stems as SeparatedStem[];
    } catch (err: any) {
      console.error('Stem separation error:', err);
      toast.error(tx({ de: 'Fehler bei der Stem-Separation', en: 'Error during stem separation', es: 'Error al separar las pistas' }), { description: err.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { separateStems, loading };
}
