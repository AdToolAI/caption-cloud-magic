import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface VideoVariant {
  id: string;
  video_creation_id: string;
  variant_type: 'format' | 'resolution' | 'aspect_ratio';
  format?: string;
  resolution?: string;
  aspect_ratio?: string;
  file_url: string;
  file_size_mb?: number;
  duration_sec?: number;
  created_at: string;
}

export const useVideoVariants = (videoCreationId?: string) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch variants for a specific video
  const { data: variants, isLoading } = useQuery({
    queryKey: ['video-variants', videoCreationId],
    queryFn: async () => {
      if (!videoCreationId) return [];

      const { data, error } = await supabase
        .from('video_variants')
        .select('*')
        .eq('video_creation_id', videoCreationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as VideoVariant[];
    },
    enabled: !!videoCreationId,
  });

  // Create a new variant
  const createVariant = useMutation({
    mutationFn: async (variant: Omit<VideoVariant, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('video_variants')
        .insert(variant)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-variants'] });
      toast({
        title: 'Variante erstellt',
        description: 'Video-Variante wurde erfolgreich erstellt',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete a variant
  const deleteVariant = useMutation({
    mutationFn: async (variantId: string) => {
      const { error } = await supabase
        .from('video_variants')
        .delete()
        .eq('id', variantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-variants'] });
      toast({
        title: 'Variante gelöscht',
        description: 'Video-Variante wurde erfolgreich gelöscht',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Generate multiple variants
  const generateVariants = async (videoCreationId: string, formats: string[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-variants', {
        body: {
          video_creation_id: videoCreationId,
          formats,
        },
      });

      if (error) throw error;

      toast({
        title: 'Varianten werden generiert',
        description: `${formats.length} Varianten werden erstellt`,
      });

      return data;
    } catch (error) {
      console.error('Error generating variants:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Varianten konnten nicht erstellt werden',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    variants: variants || [],
    isLoading,
    loading,
    createVariant: createVariant.mutate,
    deleteVariant: deleteVariant.mutate,
    generateVariants,
  };
};
