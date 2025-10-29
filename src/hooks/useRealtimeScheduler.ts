/**
 * Realtime Scheduler Hook
 * Manages realtime subscriptions for calendar events and logs
 */

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface UseRealtimeSchedulerOptions {
  onEventChange?: (payload: RealtimePostgresChangesPayload<any>) => void;
  onLogInsert?: (payload: RealtimePostgresChangesPayload<any>) => void;
}

/**
 * Subscribe to realtime updates for calendar events and logs
 */
export function useRealtimeScheduler(options: UseRealtimeSchedulerOptions = {}) {
  useEffect(() => {
    const channels: any[] = [];

    // Subscribe to calendar events changes
    if (options.onEventChange) {
      const eventsChannel = supabase
        .channel('realtime:calendar_events')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'calendar_events',
          },
          (payload) => options.onEventChange?.(payload)
        )
        .subscribe();
      
      channels.push(eventsChannel);
    }

    // Subscribe to publish logs inserts
    if (options.onLogInsert) {
      const logsChannel = supabase
        .channel('realtime:calendar_publish_logs')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'calendar_publish_logs',
          },
          (payload) => options.onLogInsert?.(payload)
        )
        .subscribe();
      
      channels.push(logsChannel);
    }

    // Cleanup subscriptions
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [options.onEventChange, options.onLogInsert]);
}
