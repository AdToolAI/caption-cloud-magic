import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TranslationStatus = 'idle' | 'uploading' | 'transcribing' | 'translating' | 'generating' | 'rendering' | 'completed' | 'failed';

export interface VideoTranslation {
  id: string;
  source_video_url: string;
  source_language: string | null;
  target_language: string;
  original_transcript: string | null;
  translated_transcript: string | null;
  voiceover_url: string | null;
  output_video_url: string | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useVideoTranslation() {
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [translation, setTranslation] = useState<VideoTranslation | null>(null);
  const [translationId, setTranslationId] = useState<string | null>(null);
  const [history, setHistory] = useState<VideoTranslation[]>([]);
  const { toast } = useToast();

  // Poll for status updates via realtime
  useEffect(() => {
    if (!translationId) return;

    const channel = supabase
      .channel(`video-translation-${translationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_translations',
          filter: `id=eq.${translationId}`,
        },
        (payload) => {
          const updated = payload.new as VideoTranslation;
          setTranslation(updated);
          setStatus(updated.status as TranslationStatus);

          if (updated.status === 'completed') {
            toast({
              title: 'Übersetzung fertig!',
              description: 'Dein Video wurde erfolgreich übersetzt.',
            });
          } else if (updated.status === 'failed') {
            toast({
              title: 'Fehler bei der Übersetzung',
              description: updated.error_message || 'Ein unbekannter Fehler ist aufgetreten.',
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [translationId, toast]);

  const startTranslation = useCallback(async (params: {
    video_url: string;
    target_language: string;
    voice_id?: string;
    include_subtitles?: boolean;
  }) => {
    setStatus('uploading');
    setTranslation(null);

    try {
      const { data, error } = await supabase.functions.invoke('translate-video', {
        body: params,
      });

      if (error) throw error;

      setTranslationId(data.translation_id);
      setStatus('transcribing');

      // Fetch initial record
      const { data: record } = await supabase
        .from('video_translations')
        .select('*')
        .eq('id', data.translation_id)
        .single();

      if (record) setTranslation(record as VideoTranslation);

      return data;
    } catch (error) {
      console.error('Translation error:', error);
      setStatus('failed');
      toast({
        title: 'Fehler',
        description: 'Übersetzung konnte nicht gestartet werden.',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('video_translations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setHistory(data as VideoTranslation[]);
    }
    return data as VideoTranslation[] | null;
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setTranslation(null);
    setTranslationId(null);
  }, []);

  const progressPercent = (() => {
    switch (status) {
      case 'idle': return 0;
      case 'uploading': return 5;
      case 'transcribing': return 20;
      case 'translating': return 45;
      case 'generating': return 70;
      case 'rendering': return 90;
      case 'completed': return 100;
      case 'failed': return 0;
      default: return 0;
    }
  })();

  return {
    status,
    translation,
    history,
    progressPercent,
    startTranslation,
    fetchHistory,
    reset,
  };
}
