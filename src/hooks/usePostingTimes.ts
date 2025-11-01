import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PostingSlot {
  start: string;
  end: string;
  score: number;
  reasons: string[];
  features: any;
}

export interface PostingTimesDay {
  date: string;
  slots: PostingSlot[];
}

export interface PostingTimesData {
  timezone: string;
  range: {
    from: string;
    to: string;
  };
  platforms: Record<string, PostingTimesDay[]>;
  metadata: {
    hasHistory: boolean;
    historyDays: number;
    generatedAt: string;
    slotsCount: number;
  };
}

interface UsePostingTimesParams {
  platform: string;
  days?: number;
  tz?: string;
  enabled?: boolean;
}

export function usePostingTimes({ 
  platform, 
  days = 14, 
  tz = Intl.DateTimeFormat().resolvedOptions().timeZone,
  enabled = true 
}: UsePostingTimesParams) {
  return useQuery({
    queryKey: ['posting-times', platform, days, tz],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('posting-times-api', {
        body: { platform, days, tz }
      });

      if (error) {
        console.error('[usePostingTimes] Error:', error);
        throw error;
      }

      return data as PostingTimesData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 60 * 60 * 1000, // 1 hour
    enabled,
  });
}

export function useSyncPostsHistory() {
  return async () => {
    const { data, error } = await supabase.functions.invoke('sync-posts-history', {});

    if (error) {
      console.error('[useSyncPostsHistory] Error:', error);
      throw error;
    }

    return data;
  };
}
