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
            title: 'Nicht genügend Credits',
            description: data.message,
            variant: 'destructive'
          });
          return null;
        }
        throw new Error(data.error);
      }

      toast({
        title: 'Batch-Rendering gestartet',
        description: `${batchData.length} Videos werden erstellt. Das dauert einige Minuten.`
      });

      return {
        creation_ids: data.creation_ids,
        total_cost: data.total_cost
      };
    } catch (error) {
      console.error('Batch creation error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Batch konnte nicht erstellt werden',
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
