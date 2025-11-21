import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useTemplates = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all templates with optional filters
  const fetchTemplates = async (filters?: {
    category?: string;
    isFeatured?: boolean;
    isPublic?: boolean;
    tags?: string[];
  }) => {
    let query = supabase
      .from('video_templates')
      .select('*')
      .order('usage_count', { ascending: false });

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.isFeatured !== undefined) {
      query = query.eq('is_featured', filters.isFeatured);
    }
    if (filters?.isPublic !== undefined) {
      query = query.eq('is_public', filters.isPublic);
    }
    if (filters?.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  };

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => fetchTemplates(),
  });

  // Duplicate template
  const duplicateTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { data: original, error: fetchError } = await supabase
        .from('video_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (fetchError) throw fetchError;

      const { data: newTemplate, error: insertError } = await supabase
        .from('video_templates')
        .insert({
          name: `${original.name} (Kopie)`,
          description: original.description,
          category: original.category,
          preview_url: original.preview_url,
          preview_video_url: original.preview_video_url,
          template_config: original.template_config,
          customizable_fields: original.customizable_fields,
          duration: original.duration,
          aspect_ratio: original.aspect_ratio,
          tags: original.tags,
          is_public: false,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({
        title: 'Template dupliziert',
        description: 'Das Template wurde erfolgreich kopiert.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Template konnte nicht dupliziert werden',
        variant: 'destructive',
      });
    },
  });

  // Delete template
  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('video_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({
        title: 'Template gelöscht',
        description: 'Das Template wurde erfolgreich entfernt.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Template konnte nicht gelöscht werden',
        variant: 'destructive',
      });
    },
  });

  // Update template
  const updateTemplate = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase
        .from('video_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({
        title: 'Template aktualisiert',
        description: 'Die Änderungen wurden gespeichert.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Template konnte nicht aktualisiert werden',
        variant: 'destructive',
      });
    },
  });

  return {
    templates,
    isLoading,
    duplicateTemplate: duplicateTemplate.mutate,
    deleteTemplate: deleteTemplate.mutate,
    updateTemplate: updateTemplate.mutate,
    isDuplicating: duplicateTemplate.isPending,
    isDeleting: deleteTemplate.isPending,
    isUpdating: updateTemplate.isPending,
  };
};
