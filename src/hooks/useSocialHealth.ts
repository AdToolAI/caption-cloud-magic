import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ProviderHealth {
  connected: boolean;
  expiring_in_days?: number;
}

interface SocialHealthResponse {
  providers: Record<string, ProviderHealth>;
}

export const useSocialHealth = () => {
  return useQuery({
    queryKey: ['social-health'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke<SocialHealthResponse>('social-health', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
  });
};
