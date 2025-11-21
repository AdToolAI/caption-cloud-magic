import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CustomVoice {
  id: string;
  name: string;
  elevenlabs_voice_id: string;
  language: string;
  sample_urls: string[];
  is_active: boolean;
  created_at: string;
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

  const cloneVoice = async (name: string, sample_urls: string[], language: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('clone-voice', {
        body: { name, sample_urls, language },
      });

      if (error) throw error;

      toast({
        title: 'Voice Clone erstellt',
        description: `${name} wurde erfolgreich geklont`,
      });

      await fetchVoices();
      return data;
    } catch (error) {
      console.error('Error cloning voice:', error);
      toast({
        title: 'Fehler',
        description: 'Voice Cloning fehlgeschlagen',
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
        title: 'Voice gelöscht',
        description: 'Custom Voice wurde entfernt',
      });

      await fetchVoices();
    } catch (error) {
      console.error('Error deleting voice:', error);
      toast({
        title: 'Fehler',
        description: 'Voice konnte nicht gelöscht werden',
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

  return {
    voices,
    loading,
    cloneVoice,
    deleteVoice,
    toggleVoiceActive,
    refetch: fetchVoices,
  };
}
