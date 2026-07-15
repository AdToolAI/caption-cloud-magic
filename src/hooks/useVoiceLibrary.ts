import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { VoiceMeta } from '@/lib/elevenlabs-voices';

export interface VoiceLibraryFilters {
  language?: 'de' | 'en' | 'es' | 'all';
  gender?: 'male' | 'female' | 'neutral' | null;
  accent?: string | null;
  age?: string | null;
  use_case?: string | null;
  search?: string;
  /** DE/ES default to true; override with false to also see accent voices. */
  nativeOnly?: boolean;
  sort?: 'popularity' | 'name' | 'newest';
  pageSize?: number;
}

interface VoicesPage {
  voices: VoiceMeta[];
  total: number;
  nativeCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

export function useVoiceLibrary(filters: VoiceLibraryFilters) {
  const pageSize = filters.pageSize ?? 50;

  return useInfiniteQuery<VoicesPage>({
    queryKey: [
      'voice-library',
      filters.language ?? 'all',
      filters.gender ?? '',
      filters.accent ?? '',
      filters.age ?? '',
      filters.use_case ?? '',
      filters.search ?? '',
      filters.nativeOnly ?? null,
      filters.sort ?? 'popularity',
      pageSize,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase.functions.invoke('list-voices', {
        body: {
          language: filters.language ?? 'all',
          gender: filters.gender ?? null,
          accent: filters.accent ?? null,
          age: filters.age ?? null,
          use_case: filters.use_case ?? null,
          search: filters.search ?? '',
          nativeOnly: filters.nativeOnly,
          sort: filters.sort ?? 'popularity',
          page: pageParam as number,
          pageSize,
        },
      });
      if (error) throw error;
      return data as VoicesPage;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });
}
