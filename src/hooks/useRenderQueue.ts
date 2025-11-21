import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QueueJob {
  id: string;
  project_id: string;
  template_id?: string;
  priority: number;
  estimated_cost: number;
  estimated_duration_sec?: number;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  engine?: string;
  config: any;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export const useRenderQueue = () => {
  const [loading, setLoading] = useState(false);

  const addToQueue = async (config: {
    projectId: string;
    templateId?: string;
    config: any;
    priority?: number;
    engine?: 'remotion' | 'shotstack' | 'auto';
    estimatedDurationSec?: number;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('render-queue-add', {
        body: config
      });

      if (error) throw error;

      toast.success(`Job zur Queue hinzugefügt! Geschätzte Kosten: ${data.estimatedCost} Credits`);
      return data;
    } catch (error: any) {
      console.error('Error adding to queue:', error);
      toast.error(error.message || 'Fehler beim Hinzufügen zur Queue');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('render-queue-cancel', {
        body: { jobId }
      });

      if (error) throw error;

      toast.success('Job wurde abgebrochen');
      return true;
    } catch (error: any) {
      console.error('Error cancelling job:', error);
      toast.error(error.message || 'Fehler beim Abbrechen des Jobs');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getQueueJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('render_queue')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as QueueJob[];
    } catch (error) {
      console.error('Error fetching queue jobs:', error);
      return [];
    }
  };

  const getQueueStats = async () => {
    try {
      const { data, error } = await supabase
        .from('render_queue_stats')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching queue stats:', error);
      return [];
    }
  };

  return {
    loading,
    addToQueue,
    cancelJob,
    getQueueJobs,
    getQueueStats,
  };
};
