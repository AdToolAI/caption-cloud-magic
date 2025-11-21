import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useVoiceTranslation() {
  const [loading, setLoading] = useState(false);
  const [translation, setTranslation] = useState<{
    translated_text: string;
    voiceover_url: string;
  } | null>(null);
  const { toast } = useToast();

  const translateAndGenerate = async (params: {
    text: string;
    source_language: string;
    target_language: string;
    voice_id?: string;
    custom_voice_id?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-and-voiceover', {
        body: params,
      });

      if (error) throw error;

      setTranslation({
        translated_text: data.translated_text,
        voiceover_url: data.voiceover_url,
      });

      toast({
        title: 'Übersetzung & Voiceover erstellt',
        description: `Text wurde nach ${params.target_language} übersetzt`,
      });

      return data;
    } catch (error) {
      console.error('Error translating:', error);
      toast({
        title: 'Fehler',
        description: 'Übersetzung fehlgeschlagen',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getTranslationHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('voice_translations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching translations:', error);
      return [];
    }
  };

  return {
    loading,
    translation,
    translateAndGenerate,
    getTranslationHistory,
  };
}
