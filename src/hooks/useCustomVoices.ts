import { useState, useEffect } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { tx } from "@/lib/i18nText";

interface CustomVoice {
  id: string;
  name: string;
  elevenlabs_voice_id: string;
  language: string;
  sample_urls: string[];
  is_active: boolean;
  created_at: string;
}

async function getFunctionErrorMessage(error: unknown, fallback = tx({ de: 'Voice Cloning fehlgeschlagen', en: 'Voice cloning failed', es: 'Error al clonar la voz' })) {
  if (error instanceof FunctionsHttpError) {
    const raw = await error.context.text().catch(() => '');
    if (raw) {
      try {
        const payload = JSON.parse(raw) as { error?: unknown; details?: unknown };
        const message = typeof payload.error === 'string' ? payload.error : fallback;
        const details = typeof payload.details === 'string' ? payload.details : '';
        return details ? `${message}\n${details.slice(0, 280)}` : message;
      } catch {
        return raw.slice(0, 360);
      }
    }
  }

  return error instanceof Error ? error.message : fallback;
}

export function useCustomVoices() {
  const [voices, setVoices] = useState<CustomVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchVoices = async () => {
    try {
      const { data, error } = await supabase
        .from('custom_voices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVoices(data || []);
    } catch (error) {
      console.error('Error fetching voices:', error);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  const cloneVoice = async (
    name: string,
    sample_urls: string[],
    language: string,
    options?: { description?: string; remove_background_noise?: boolean },
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('clone-voice', {
        body: {
          name,
          sample_urls,
          language,
          description: options?.description,
          remove_background_noise: options?.remove_background_noise ?? true,
        },
      });

      if (error) throw error;

      toast({
        title: tx({ de: 'Voice Clone erstellt', en: 'Voice clone created', es: 'Clon de voz creado' }),
        description: tx({ de: `${name} wurde erfolgreich geklont`, en: `${name} was successfully cloned`, es: `${name} se clonó correctamente` }),
      });

      await fetchVoices();
      return data;
    } catch (error) {
      console.error('Error cloning voice:', error);
      const description = await getFunctionErrorMessage(error);
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };


  const deleteVoice = async (voice_id: string) => {
    try {
      const { error } = await supabase
        .from('custom_voices')
        .delete()
        .eq('id', voice_id);

      if (error) throw error;

      toast({
        title: tx({ de: 'Voice gelöscht', en: 'Voice deleted', es: 'Voz eliminada' }),
        description: tx({ de: 'Custom Voice wurde entfernt', en: 'Custom voice was removed', es: 'La voz personalizada fue eliminada' }),
      });

      await fetchVoices();
    } catch (error) {
      console.error('Error deleting voice:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: tx({ de: 'Voice konnte nicht gelöscht werden', en: 'Voice could not be deleted', es: 'No se pudo eliminar la voz' }),
        variant: 'destructive',
      });
    }
  };

  const toggleVoiceActive = async (voice_id: string, is_active: boolean) => {
    try {
      const { error } = await supabase
        .from('custom_voices')
        .update({ is_active })
        .eq('id', voice_id);

      if (error) throw error;
      await fetchVoices();
    } catch (error) {
      console.error('Error toggling voice:', error);
    }
  };

  const renameVoice = async (voice_id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const { error } = await supabase
        .from('custom_voices')
        .update({ name: trimmed })
        .eq('id', voice_id);

      if (error) throw error;
      toast({ title: tx({ de: 'Umbenannt', en: 'Renamed', es: 'Renombrado' }), description: tx({ de: `Voice heißt jetzt „${trimmed}"`, en: `Voice is now called "${trimmed}"`, es: `La voz ahora se llama "${trimmed}"` }) });
      await fetchVoices();
    } catch (error) {
      console.error('Error renaming voice:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: tx({ de: 'Voice konnte nicht umbenannt werden', en: 'Voice could not be renamed', es: 'No se pudo renombrar la voz' }),
        variant: 'destructive',
      });
    }
  };

  return {
    voices,
    loading,
    cloneVoice,
    deleteVoice,
    toggleVoiceActive,
    renameVoice,
    refetch: fetchVoices,
  };
}
