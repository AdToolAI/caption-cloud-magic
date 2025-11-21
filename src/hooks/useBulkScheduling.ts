import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BulkScheduleEvent {
  title: string;
  caption?: string;
  channels: string[];
  brand_kit_id?: string;
}

export interface BulkScheduleConfig {
  workspace_id: string;
  start_date: string;
  end_date: string;
  events: BulkScheduleEvent[];
  distribution_strategy: 'even' | 'optimal' | 'manual';
  posting_slots?: string[];
  use_posting_times?: boolean;
}

export function useBulkScheduling() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const bulkSchedule = async (config: BulkScheduleConfig) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-bulk-schedule', {
        body: config
      });

      if (error) throw error;

      toast({
        title: '🎉 Bulk Scheduling erfolgreich',
        description: `${data.events_created} Events geplant`,
      });

      return data;
    } catch (error: any) {
      console.error('Bulk schedule error:', error);
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getBulkScheduleJobs = async (workspace_id: string) => {
    try {
      const { data, error } = await supabase
        .from('bulk_schedule_jobs')
        .select('*')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Get bulk schedule jobs error:', error);
      return [];
    }
  };

  return {
    loading,
    bulkSchedule,
    getBulkScheduleJobs,
  };
}
