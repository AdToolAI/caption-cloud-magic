import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface VoiceOutputProps {
  text: string;
  voiceId: string;
  autoPlay?: boolean;
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
}

export function VoiceOutput({ text, voiceId, autoPlay, onPlayStart, onPlayEnd }: VoiceOutputProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generateAndPlay = useCallback(async () => {
    if (!text || text.length < 5) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('companion-speak', {
        body: { text, voiceId }
      });

      if (error) throw error;

      if (data?.audioContent) {
        const audioSrc = `data:audio/mpeg;base64,${data.audioContent}`;
        setAudioUrl(audioSrc);
        
        const audio = new Audio(audioSrc);
        audioRef.current = audio;
        
        audio.onplay = () => {
          setIsPlaying(true);
          onPlayStart?.();
        };
        
        audio.onended = () => {
          setIsPlaying(false);
          onPlayEnd?.();
        };
        
        audio.onerror = () => {
          setIsPlaying(false);
          onPlayEnd?.();
        };

        await audio.play();
      }
    } catch (error) {
      console.error('Error generating speech:', error);
    } finally {
      setIsLoading(false);
    }
  }, [text, voiceId, onPlayStart, onPlayEnd]);

  // Auto-play when autoPlay is true and text changes
  useEffect(() => {
    if (autoPlay && text && !isLoading && !isPlaying) {
      const timeoutId = setTimeout(() => {
        generateAndPlay();
      }, 500); // Small delay to ensure text is fully rendered
      
      return () => clearTimeout(timeoutId);
    }
  }, [autoPlay, text]);

  const togglePlayback = useCallback(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    } else {
      generateAndPlay();
    }
  }, [isPlaying, audioUrl, generateAndPlay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={togglePlayback}
      disabled={isLoading || text.length < 5}
      className={cn(
        "h-6 w-6 shrink-0",
        isPlaying && "text-primary"
      )}
    >
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
          </motion.div>
        ) : isPlaying ? (
          <motion.div
            key="playing"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Pause className="w-3 h-3" />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Volume2 className="w-3 h-3" />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}
