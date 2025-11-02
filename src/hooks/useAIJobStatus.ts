/**
 * Hook to monitor AI job status for async processing
 * Used when AI calls are queued (202 response)
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AIJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result_data?: any;
  error_message?: string;
  retry_count: number;
  created_at: string;
  completed_at?: string;
}

export function useAIJobStatus(jobId: string | null) {
  const [job, setJob] = useState<AIJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    setIsLoading(true);

    // Initial fetch
    const fetchJob = async () => {
      const { data, error } = await supabase
        .from('ai_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        setError(error.message);
        setIsLoading(false);
        return;
      }

      setJob(data as AIJob);
      setIsLoading(false);

      // Stop polling if job is complete
      if (data.status === 'completed' || data.status === 'failed') {
        return;
      }
    };

    fetchJob();

    // Poll every 5 seconds while job is pending/processing
    const interval = setInterval(() => {
      fetchJob();
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId]);

  return { job, isLoading, error };
}
