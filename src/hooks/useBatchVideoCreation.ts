import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BatchJobResult {
  batch_job_id: string;
  creation_ids: string[];
  total_cost: number;
  queued_videos: number;
  failed_videos: number;
}

export const useBatchVideoCreation = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const createBatch = async (
    templateId: string,
    jobName: string,
    csvData: Array<Record<string, any>>
  ): Promise<BatchJobResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-video-batch-v2', {
        body: {
          template_id: templateId,
          job_name: jobName,
          csv_data: csvData
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
        if (data.error === 'VALIDATION_ERROR') {
          toast({
            title: 'CSV Validierungsfehler',
            description: `${data.message}. Erste Fehler: ${data.details?.join(', ')}`,
            variant: 'destructive'
          });
          return null;
        }
        throw new Error(data.error);
      }

      toast({
        title: 'Batch-Job gestartet!',
        description: `${data.queued_videos}/${csvData.length} Videos werden erstellt.${data.failed_videos > 0 ? ` ${data.failed_videos} Videos sind fehlgeschlagen.` : ''}`
      });

      return {
        batch_job_id: data.batch_job_id,
        creation_ids: data.creation_ids,
        total_cost: data.total_cost,
        queued_videos: data.queued_videos,
        failed_videos: data.failed_videos
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
