import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VideoCreation } from '@/types/video';

export const useVideoCreation = () => {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createVideo = async (
    templateId: string,
    customizations: Record<string, string | number>,
    audioConfig?: {
      backgroundMusic?: { assetId: string; volume: number };
      voiceover?: { assetId: string; volume: number };
    }
  ): Promise<{ creation_id: string; render_id: string } | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-video-from-template', {
        body: {
          template_id: templateId,
          customizations,
          audio_config: audioConfig
        }
      });

      if (error) throw error;

      if (!data.ok) {
        if (data.error === 'INSUFFICIENT_CREDITS') {
          toast({
            title: tx({ de: 'Nicht genügend Credits', en: 'Not enough credits', es: 'Créditos insuficientes' }),
            description: data.message,
            variant: 'destructive'
          });
          return null;
        }
        throw new Error(data.error);
      }

      toast({
        title: tx({ de: 'Video-Rendering gestartet', en: 'Video rendering started', es: 'Se inició la renderización de vídeo.' }),
        description: tx({ de: 'Dein Video wird erstellt. Das dauert ca. 30-60 Sekunden.', en: 'Your video is being created. This takes approx. 30-60 seconds.', es: 'Tu video se está creando. Esto toma aproximadamente 30-60 segundos.' })
      });

      return {
        creation_id: data.creation_id,
        render_id: data.render_id
      };
    } catch (error) {
      console.error('Video creation error:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Video konnte nicht erstellt werden', en: 'Video could not be created', es: 'No se pudo crear el video' }),
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (creationId: string): Promise<VideoCreation | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-video-status', {
        body: { creation_id: creationId }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      return {
        id: creationId,
        status: data.status,
        output_url: data.output_url,
        error_message: data.error_message
      } as VideoCreation;
    } catch (error) {
      console.error('Status check error:', error);
      return null;
    }
  };

  const pollStatus = async (
    creationId: string,
    onComplete: (outputUrl: string) => void,
    onError?: (error: string) => void
  ) => {
    setPolling(true);
    const maxAttempts = 40; // 40 * 3 = 120 seconds max
    let attempts = 0;

    const poll = async () => {
      const result = await checkStatus(creationId);
      
      if (!result) {
        setPolling(false);
        onError?.(tx({ de: tx({ de: "Fehler beim Status-Check", en: "Status check failed", es: "Error en la comprobación de estado" }), en: 'Error during status check', es: 'Error durante la verificación de estado' }));
        return;
      }

      if (result.status === 'completed' && result.output_url) {
        setPolling(false);
        
        // Invalidate video history to show new video immediately
        queryClient.invalidateQueries({ queryKey: ['video-history'] });
        
        toast({
          title: tx({ de: 'Video fertig!', en: 'Video ready!', es: '¡Vídeo listo!' }),
          description: tx({ de: 'Dein Werbevideo wurde erfolgreich erstellt.', en: 'Your promotional video has been successfully created.', es: 'Tu video promocional ha sido creado exitosamente.' })
        });
        onComplete(result.output_url);
        return;
      }

      if (result.status === 'failed') {
        setPolling(false);
        toast({
          title: tx({ de: 'Video-Rendering fehlgeschlagen', en: 'Video rendering failed', es: 'Error al renderizar el vídeo' }),
          description: result.error_message || tx({ de: 'Ein Fehler ist aufgetreten', en: 'An error occurred', es: 'Ha ocurrido un error' }),
          variant: 'destructive'
        });
        onError?.(result.error_message || 'Unknown error');
        return;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setPolling(false);
        toast({
          title: 'Timeout',
          description: tx({ de: 'Video-Rendering dauert länger als erwartet. Bitte später erneut prüfen.', en: 'Video rendering takes longer than expected. Please check again later.', es: 'La renderización del video está tardando más de lo esperado. Por favor, inténtalo de nuevo más tarde.' }),
          variant: 'destructive'
        });
        return;
      }

      // Poll every 3 seconds
      setTimeout(poll, 3000);
    };

    poll();
  };

  return {
    createVideo,
    checkStatus,
    pollStatus,
    loading,
    polling
  };
};
