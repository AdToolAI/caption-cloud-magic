import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VoicePreviewButtonProps {
  voiceId: string;
  language?: string;
  size?: 'sm' | 'icon';
  className?: string;
}

const SAMPLES: Record<string, string> = {
  de: 'Hallo, so klingt meine Stimme. Ich freue mich darauf, deinen Text vorzulesen.',
  en: 'Hello, this is how my voice sounds. I look forward to reading your text.',
  es: 'Hola, así suena mi voz. Tengo muchas ganas de leer tu texto.',
};

/** Tiny 5-second voice preview button using the `preview-voice` edge function. */
export function VoicePreviewButton({ voiceId, language = 'de', size = 'icon', className }: VoicePreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (playing) { stop(); return; }
    setLoading(true);
    try {
      const sample = SAMPLES[language] || SAMPLES.en;
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: { text: sample, voiceId, speed: 1.0 },
      });
      if (error) throw error;
      if (!data?.audioContent) throw new Error('No audio received');
      const url = `data:audio/mpeg;base64,${data.audioContent}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); audioRef.current = null; };
      audio.onerror = () => { setPlaying(false); audioRef.current = null; toast.error('Audio konnte nicht abgespielt werden'); };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      console.error('[VoicePreviewButton] Error:', err);
      toast.error('Hörprobe konnte nicht generiert werden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={className}
      onClick={handleClick}
      disabled={loading}
      title={playing ? 'Stop' : 'Hörprobe abspielen'}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : playing ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
    </Button>
  );
}
