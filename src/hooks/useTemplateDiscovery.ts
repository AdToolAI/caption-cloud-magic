import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SearchFilters } from '@/components/templates/TemplateSearch';

export const useTemplateDiscovery = (filters: SearchFilters) => {
  return useQuery({
    queryKey: ['template-discovery', filters],
    queryFn: async () => {
      let query = supabase
        .from('content_templates')
        .select('*');

      // Text search using search_vector
      if (filters.query) {
        query = query.textSearch('search_vector', filters.query, {
          type: 'websearch',
          config: 'english',
        });
      }

      // Category filter
      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }

      // Platform filter
      if (filters.platform && filters.platform !== 'all') {
        query = query.contains('platforms', [filters.platform]);
      }

      // Aspect ratio filter
      if (filters.aspectRatio && filters.aspectRatio !== 'all') {
        query = query.contains('aspect_ratios', [filters.aspectRatio]);
      }

      // Rating filter
      if (filters.minRating > 0) {
        query = query.gte('average_rating', filters.minRating);
      }

      // Tags filter
      if (filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      // Sorting
      switch (filters.sortBy) {
        case 'popular':
          query = query.order('usage_count', { ascending: false });
          break;
        case 'recent':
          query = query.order('created_at', { ascending: false });
          break;
        case 'rating':
          query = query.order('average_rating', { ascending: false, nullsFirst: false });
          break;
        case 'name':
          query = query.order('name', { ascending: true });
          break;
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    staleTime: 30000, // 30 seconds
  });
};

// Get unique tags from all templates
export const useAvailableTags = () => {
  return useQuery({
    queryKey: ['available-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_templates')
        .select('tags')
        .not('tags', 'is', null);

      if (error) throw error;

      // Flatten and deduplicate tags
      const allTags = data
        .flatMap(t => t.tags || [])
        .filter((tag, index, self) => self.indexOf(tag) === index)
        .sort();

      return allTags;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};