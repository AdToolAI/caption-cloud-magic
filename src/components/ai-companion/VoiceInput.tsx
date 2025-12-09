import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscription, disabled }: VoiceInputProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        if (chunksRef.current.length === 0) return;

        setIsProcessing(true);
        
        try {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          
          // Convert to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            
            const { data, error } = await supabase.functions.invoke('companion-transcribe', {
              body: { audio: base64Audio }
            });

            if (error) throw error;

            if (data?.text) {
              onTranscription(data.text);
            } else {
              toast({
                title: 'Keine Sprache erkannt',
                description: 'Bitte versuche es erneut.',
                variant: 'destructive',
              });
            }
          };
        } catch (error) {
          console.error('Transcription error:', error);
          toast({
            title: 'Fehler bei der Spracherkennung',
            description: 'Bitte versuche es erneut.',
            variant: 'destructive',
          });
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Mikrofon-Zugriff verweigert',
        description: 'Bitte erlaube den Zugriff auf dein Mikrofon.',
        variant: 'destructive',
      });
    }
  }, [onTranscription, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleRecording}
      disabled={disabled || isProcessing}
      className={cn(
        "h-[44px] w-[44px] shrink-0 relative",
        isRecording && "text-destructive hover:text-destructive"
      )}
    >
      <AnimatePresence mode="wait">
        {isProcessing ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
          </motion.div>
        ) : isRecording ? (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <MicOff className="w-5 h-5" />
            {/* Recording pulse indicator */}
            <motion.div
              className="absolute inset-0 rounded-full bg-destructive/20"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Mic className="w-5 h-5" />
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}
