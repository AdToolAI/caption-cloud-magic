import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useBatchActions = () => {
  const [loading, setLoading] = useState(false);

  const cancelBatch = async (batchJobId: string) => {
    setLoading(true);
    try {
      // @ts-ignore - Supabase type inference issue
      const { data: videos } = await supabase
        .from('video_creations')
        .select('id')
        .eq('batch_job_id', batchJobId);

      if (videos && videos.length > 0) {
        // @ts-ignore
        await supabase
          .from('video_creations')
          .update({ status: 'cancelled' })
          .in('id', videos.map((v: any) => v.id));
      }

      // @ts-ignore
      await supabase
        .from('batch_jobs')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', batchJobId);

      toast.success(`${videos?.length || 0} Videos abgebrochen`);
    } catch (error) {
      toast.error(tx({ de: 'Abbruch fehlgeschlagen', en: 'Abort failed', es: 'Abortar falló' }));
    } finally {
      setLoading(false);
    }
  };

  const retryFailed = async (batchJobId: string) => {
    setLoading(true);
    try {
      // @ts-ignore - Supabase type inference issue
      const { data: failedVideos } = await supabase
        .from('video_creations')
        .select('id, template_id, customizations, retry_count, max_retries')
        .eq('batch_job_id', batchJobId)
        .eq('status', 'failed');

      if (!failedVideos?.length) {
        toast.info('Keine fehlgeschlagenen Videos');
        return;
      }

      let successCount = 0;
      for (const video of failedVideos) {
        const retryCount = video.retry_count || 0;
        if (retryCount >= (video.max_retries || 3)) continue;

        // @ts-ignore
        await supabase
          .from('video_creations')
          .update({ 
            status: 'queued',
            retry_count: retryCount + 1
          })
          .eq('id', video.id);

        successCount++;
      }

      toast.success(tx({ de: `${successCount} Videos werden wiederholt`, en: `${successCount} Videos are repeated`, es: `${successCount} Los vídeos se repiten` }));
    } catch (error) {
      toast.error(tx({ de: 'Retry fehlgeschlagen', en: 'Retry failed', es: 'Reintentar falló' }));
    } finally {
      setLoading(false);
    }
  };

  const deleteBatch = async (batchJobId: string) => {
    if (!confirm(tx({ de: 'Wirklich löschen?', en: 'Really delete?', es: '¿Realmente eliminar?' }))) return;

    setLoading(true);
    try {
      await supabase.from('video_creations').delete().eq('batch_job_id', batchJobId);
      await supabase.from('batch_jobs').delete().eq('id', batchJobId);
      toast.success('Batch gelöscht');
    } catch (error) {
      toast.error(tx({ de: 'Löschen fehlgeschlagen', en: 'Delete failed', es: 'Error al eliminar' }));
    } finally {
      setLoading(false);
    }
  };

  return { cancelBatch, retryFailed, deleteBatch, loading };
};
