import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tx } from '@/lib/i18nText';

export const useTemplateVersion = (templateId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all versions for a template
  const { data: versions, isLoading } = useQuery({
    queryKey: ['template-versions', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      
      const { data, error } = await supabase
        .from('video_template_versions')
        .select('*')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Create new version
  const createVersion = useMutation({
    mutationFn: async ({
      templateId,
      changeNotes,
    }: {
      templateId: string;
      changeNotes?: string;
    }) => {
      // Get current template data
      const { data: template, error: templateError } = await supabase
        .from('video_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      // Get next version number
      const { data: lastVersion } = await supabase
        .from('video_template_versions')
        .select('version_number')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (lastVersion?.version_number || 0) + 1;

      // Create version
      const { data, error } = await supabase
        .from('video_template_versions')
        .insert({
          template_id: templateId,
          version_number: nextVersion,
          name: template.name,
          description: template.description,
          shotstack_template: template.template_config,
          customizable_fields: template.customizable_fields,
          thumbnail_url: template.preview_url,
          change_notes: changeNotes,
          is_published: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Update template's current version
      await supabase
        .from('video_templates')
        .update({ current_version: nextVersion })
        .eq('id', templateId);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-versions'] });
      toast({
        title: 'Version erstellt',
        description: tx({ de: 'Eine neue Template-Version wurde gespeichert.', en: 'A new template version has been saved.', es: 'Se ha guardado una nueva versión de la plantilla.' }),
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : tx({ de: 'Version konnte nicht erstellt werden', en: 'Version could not be created', es: 'No se pudo crear la versión' }),
        variant: 'destructive',
      });
    },
  });

  // Restore version
  const restoreVersion = useMutation({
    mutationFn: async ({
      templateId,
      versionId,
    }: {
      templateId: string;
      versionId: string;
    }) => {
      // Get version data
      const { data: version, error: versionError } = await supabase
        .from('video_template_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (versionError) throw versionError;

      // Update template with version data
      const { error } = await supabase
        .from('video_templates')
        .update({
          name: version.name,
          description: version.description,
          template_config: version.shotstack_template,
          customizable_fields: version.customizable_fields,
          preview_url: version.thumbnail_url,
        })
        .eq('id', templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template-versions'] });
      toast({
        title: 'Version wiederhergestellt',
        description: tx({ de: 'Das Template wurde auf diese Version zurückgesetzt.', en: 'The template has been reset to this version.', es: 'La plantilla se ha restablecido a esta versión.' }),
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : tx({ de: 'Version konnte nicht wiederhergestellt werden', en: 'Version could not be restored', es: 'No se pudo restaurar la versión' }),
        variant: 'destructive',
      });
    },
  });

  // Publish version
  const publishVersion = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase
        .from('video_template_versions')
        .update({ is_published: true })
        .eq('id', versionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-versions'] });
      toast({
        title: 'Version veröffentlicht',
        description: tx({ de: 'Die Version ist jetzt öffentlich sichtbar.', en: 'The version is now publicly visible.', es: 'La versión ahora es visible públicamente.' }),
      });
    },
    onError: (error) => {
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : tx({ de: 'Version konnte nicht veröffentlicht werden', en: 'Version could not be published', es: 'No se pudo publicar la versión' }),
        variant: 'destructive',
      });
    },
  });

  return {
    versions,
    isLoading,
    createVersion: createVersion.mutate,
    restoreVersion: restoreVersion.mutate,
    publishVersion: publishVersion.mutate,
    isCreating: createVersion.isPending,
    isRestoring: restoreVersion.isPending,
    isPublishing: publishVersion.isPending,
  };
};
