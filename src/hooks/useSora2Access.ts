import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns whether the current user is "grandfathered" into Sora 2 access.
 *
 * Sora 2 is officially gated behind a "Coming Soon" wall for new signups,
 * but all users that existed before the cutoff retain full access.
 */
export const useSora2Access = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['sora2-access', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('profiles')
        .select('sora2_grandfathered')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.warn('[useSora2Access] failed to read flag:', error);
        return false;
      }
      return Boolean(data?.sora2_grandfathered);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return {
    hasAccess: data ?? false,
    isLoading,
  };
};
