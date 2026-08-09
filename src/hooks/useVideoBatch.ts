import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BatchResult {
  creation_ids: string[];
  total_cost: number;
}

export const useVideoBatch = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const createBatch = async (
    templateId: string,
    batchData: Array<Record<string, string | number>>
  ): Promise<BatchResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-video-batch', {
        body: {
          template_id: templateId,
          batch_data: batchData
        }
      });

      if (error) throw error;

      if (!data.ok) {
        if (data.error === 'INSUFFICIENT_CREDITS') {
          toast({
            title: tx({ de: 'Nicht genügend Credits', en: 'Insufficient credits', es: 'Créditos insuficientes' }),
            description: data.message,
            variant: 'destructive'
          });
          return null;
        }
        throw new Error(data.error);
      }

      toast({
        title: tx({ de: 'Batch-Rendering gestartet', en: 'Batch rendering started', es: 'Renderizado por lotes iniciado' }),
        description: tx({ de: `${batchData.length} Videos werden erstellt. Das dauert einige Minuten.`, en: `${batchData.length} videos are being created. This will take a few minutes.`, es: `Se están creando ${batchData.length} videos. Esto tardará unos minutos.` })
      });

      return {
        creation_ids: data.creation_ids,
        total_cost: data.total_cost
      };
    } catch (error) {
      console.error('Batch creation error:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Batch konnte nicht erstellt werden', en: 'Could not create batch', es: 'No se pudo crear el lote' }),
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    createBatch,
    loading
  };
};
