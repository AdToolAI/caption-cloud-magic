/**
 * Optimized hooks for template data fetching with caching
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { templateCache, cacheKeys } from '@/lib/template-cache';
import { templateLogger } from '@/lib/template-logger';
import type { ContentTemplate } from '@/types/content-studio';

/**
 * Fetch all templates with caching
 */
export function useTemplates(contentType?: string) {
  return useQuery({
    queryKey: ['templates', contentType],
    queryFn: async () => {
      const cacheKey = cacheKeys.templates(contentType);
      
      // Check cache first
      const cached = templateCache.get<ContentTemplate[]>(cacheKey);
      if (cached) {
        templateLogger.debug('Hook', 'Using cached templates', { contentType });
        return cached;
      }

      // Fetch from database
      templateLogger.info('Hook', 'Fetching templates from database', { contentType });
      
      let query = supabase
        .from('content_templates')
        .select('*')
        .eq('is_public', true);

      if (contentType) {
        query = query.eq('content_type', contentType);
      }

      const { data, error } = await query;

      if (error) {
        templateLogger.error('Hook', 'Failed to fetch templates', { error: error.message });
        throw error;
      }

      // Cache result
      templateCache.set(cacheKey, data, 10 * 60 * 1000); // 10 minutes
      
      return data as any as ContentTemplate[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch single template with caching
 */
export function useTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const cacheKey = cacheKeys.template(templateId);
      
      // Check cache first
      const cached = templateCache.get<ContentTemplate>(cacheKey);
      if (cached) {
        templateLogger.debug('Hook', 'Using cached template', { templateId });
        return cached;
      }

      // Fetch from database
      templateLogger.info('Hook', 'Fetching template from database', { templateId });
      
      const { data, error } = await supabase
        .from('content_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        templateLogger.error('Hook', 'Failed to fetch template', { 
          templateId, 
          error: error.message 
        });
        throw error;
      }

      // Cache result
      templateCache.set(cacheKey, data, 10 * 60 * 1000);
      
      return data as any as ContentTemplate;
    },
    enabled: !!templateId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch field mappings with caching
 */
export function useFieldMappings(templateId: string | null) {
  return useQuery({
    queryKey: ['field-mappings', templateId],
    queryFn: async () => {
      if (!templateId) return [];

      const cacheKey = cacheKeys.fieldMappings(templateId);
      
      // Check cache first
      const cached = templateCache.get<any[]>(cacheKey);
      if (cached) {
        templateLogger.debug('Hook', 'Using cached field mappings', { templateId });
        return cached;
      }

      // Fetch from database
      templateLogger.info('Hook', 'Fetching field mappings from database', { templateId });
      
      const { data, error } = await supabase
        .from('template_field_mappings')
        .select('field_key, remotion_prop_name, transformation_function')
        .eq('template_id', templateId);

      if (error) {
        templateLogger.error('Hook', 'Failed to fetch field mappings', { 
          templateId, 
          error: error.message 
        });
        throw error;
      }

      // Cache result (longer TTL as field mappings rarely change)
      templateCache.set(cacheKey, data || [], 30 * 60 * 1000); // 30 minutes
      
      return data || [];
    },
    enabled: !!templateId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Invalidate template cache
 */
export function useInvalidateTemplateCache() {
  const queryClient = useQueryClient();

  return {
    invalidateTemplate: (templateId: string) => {
      templateCache.invalidate(cacheKeys.template(templateId));
      queryClient.invalidateQueries({ queryKey: ['template', templateId] });
      templateLogger.info('Hook', 'Invalidated template cache', { templateId });
    },
    
    invalidateTemplates: (contentType?: string) => {
      templateCache.invalidate(cacheKeys.templates(contentType));
      queryClient.invalidateQueries({ queryKey: ['templates', contentType] });
      templateLogger.info('Hook', 'Invalidated templates cache', { contentType });
    },
    
    invalidateFieldMappings: (templateId: string) => {
      templateCache.invalidate(cacheKeys.fieldMappings(templateId));
      queryClient.invalidateQueries({ queryKey: ['field-mappings', templateId] });
      templateLogger.info('Hook', 'Invalidated field mappings cache', { templateId });
    },
    
    invalidateAll: () => {
      templateCache.clear();
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template'] });
      queryClient.invalidateQueries({ queryKey: ['field-mappings'] });
      templateLogger.info('Hook', 'Invalidated all template caches');
    },
  };
}

/**
 * Prefetch template data for better UX
 */
export function usePrefetchTemplate() {
  const queryClient = useQueryClient();

  return {
    prefetchTemplate: async (templateId: string) => {
      await queryClient.prefetchQuery({
        queryKey: ['template', templateId],
        queryFn: async () => {
          const { data } = await supabase
            .from('content_templates')
            .select('*')
            .eq('id', templateId)
            .single();
          
          return data;
        },
        staleTime: 5 * 60 * 1000,
      });
      
      templateLogger.debug('Hook', 'Prefetched template', { templateId });
    },
    
    prefetchFieldMappings: async (templateId: string) => {
      await queryClient.prefetchQuery({
        queryKey: ['field-mappings', templateId],
        queryFn: async () => {
          const { data } = await supabase
            .from('template_field_mappings')
            .select('*')
            .eq('template_id', templateId);
          
          return data;
        },
        staleTime: 15 * 60 * 1000,
      });
      
      templateLogger.debug('Hook', 'Prefetched field mappings', { templateId });
    },
  };
}
