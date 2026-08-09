import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tx } from '@/lib/i18nText';

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
        title: tx({ de: 'Template dupliziert', en: 'Template duplicated', es: 'Plantilla duplicada' }),
        description: tx({ de: 'Das Template wurde erfolgreich kopiert.', en: 'The template was copied successfully.', es: 'La plantilla se copió correctamente.' }),
      });
    },
    onError: (error) => {
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Template konnte nicht dupliziert werden', en: 'The template could not be duplicated', es: 'No se pudo duplicar la plantilla' }),
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
        title: tx({ de: 'Template gelöscht', en: 'Template deleted', es: 'Plantilla eliminada' }),
        description: tx({ de: 'Das Template wurde erfolgreich entfernt.', en: 'The template was removed successfully.', es: 'La plantilla se eliminó correctamente.' }),
      });
    },
    onError: (error) => {
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Template konnte nicht gelöscht werden', en: 'The template could not be deleted', es: 'No se pudo eliminar la plantilla' }),
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
        title: tx({ de: 'Template aktualisiert', en: 'Template updated', es: 'Plantilla actualizada' }),
        description: tx({ de: 'Die Änderungen wurden gespeichert.', en: 'Your changes have been saved.', es: 'Se guardaron los cambios.' }),
      });
    },
    onError: (error) => {
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Template konnte nicht aktualisiert werden', en: 'The template could not be updated', es: 'No se pudo actualizar la plantilla' }),
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
