/**
 * VoicePreviewButton — plays a short ElevenLabs sample of the given
 * voice so users can verify voice assignments before applying a plan.
 *
 * P5: shown next to every voice badge in the ProductionPlanSheet.
 */
import { useRef, useState } from 'react';
import { Loader2, Play, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const DEFAULT_PREVIEW_TEXT =
  'Hallo, dies ist eine kurze Sprachprobe für deinen Charakter.';

type Props = {
  voiceId: string | null | undefined;
  text?: string | null;
  label?: string;
};

export function VoicePreviewButton({ voiceId, text, label }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setState('idle');
  };

  const play = async () => {
    if (!voiceId) {
      toast({ title: 'Keine Stimme zugeordnet', description: 'Wende den Plan an — die Stimme wird beim Anwenden automatisch vergeben.', variant: 'default' });
      return;
    }
    if (state === 'playing') { stop(); return; }
    setState('loading');
    try {
      const sample = (text && text.trim().length > 4 ? text : DEFAULT_PREVIEW_TEXT).slice(0, 240);
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: { text: sample, voiceId },
      });
      if (error) throw error;
      const b64 = (data as any)?.audioContent;
      if (!b64) throw new Error('Keine Audio-Antwort erhalten.');
      const src = `data:audio/mpeg;base64,${b64}`;
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setState('idle');
      audio.onerror = () => setState('idle');
      await audio.play();
      setState('playing');
    } catch (err) {
      console.error('[VoicePreviewButton] failed:', err);
      toast({
        title: 'Vorschau fehlgeschlagen',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler.',
        variant: 'destructive',
      });
      setState('idle');
    }
  };

  const disabled = state === 'loading';
  const icon =
    state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> :
    state === 'playing' ? <Square className="h-3 w-3" /> :
    <Play className="h-3 w-3" />;

  return (
    <button
      type="button"
      onClick={play}
      disabled={disabled}
      title={label ?? 'Stimme anhören'}
      aria-label={label ?? 'Stimme anhören'}
      className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-border/50 bg-background/40 hover:bg-background/70 disabled:opacity-50 transition"
    >
      {icon}
    </button>
  );
}

export default VoicePreviewButton;
