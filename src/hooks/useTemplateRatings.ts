import { tx } from "@/lib/i18nText";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TemplateRating {
  id: string;
  template_id: string;
  user_id: string;
  rating: number;
  review_text?: string;
  created_at: string;
  updated_at: string;
}

export const useTemplateRatings = (templateId: string) => {
  return useQuery({
    queryKey: ['template-ratings', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_ratings')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TemplateRating[];
    },
  });
};

export const useUserTemplateRating = (templateId: string) => {
  return useQuery({
    queryKey: ['user-template-rating', templateId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('template_ratings')
        .select('*')
        .eq('template_id', templateId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as TemplateRating | null;
    },
  });
};

export const useSubmitRating = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      templateId,
      rating,
      reviewText,
    }: {
      templateId: string;
      rating: number;
      reviewText?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(tx({ de: 'Nicht angemeldet', en: 'Not signed in', es: 'No has iniciado sesión' }));

      const { data, error } = await supabase
        .from('template_ratings')
        .upsert(
          {
            template_id: templateId,
            user_id: user.id,
            rating,
            review_text: reviewText,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'template_id,user_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['template-ratings', variables.templateId] });
      queryClient.invalidateQueries({ queryKey: ['user-template-rating', variables.templateId] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['content-templates'] });
      toast({
        title: tx({ de: 'Bewertung gespeichert', en: 'Rating saved', es: 'Valoración guardada' }),
        description: tx({ de: 'Ihre Bewertung wurde erfolgreich gespeichert.', en: 'Your rating has been saved successfully.', es: 'Tu valoración se ha guardado correctamente.' }),
      });
    },
    onError: (error) => {
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Bewertung konnte nicht gespeichert werden', en: 'Rating could not be saved', es: 'No se pudo guardar la calificación' }),
        variant: 'destructive',
      });
    },
  });
};

export const useRecordTemplateView = () => {
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('template_views')
        .insert({
          template_id: templateId,
          user_id: user?.id,
          session_id: sessionStorage.getItem('session_id') || crypto.randomUUID(),
        });

      if (error) throw error;
    },
  });
};