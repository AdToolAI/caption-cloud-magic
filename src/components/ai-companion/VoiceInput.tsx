import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
  disabled?: boolean;
}

// Check for Web Speech API support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function VoiceInput({ onTranscription, onListeningChange, disabled }: VoiceInputProps) {
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API
  useEffect(() => {
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'de-DE'; // German

    recognition.onstart = () => {
      setIsListening(true);
      onListeningChange?.(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      setIsProcessing(false);
      onListeningChange?.(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setIsProcessing(false);
      onListeningChange?.(false);
      
      if (event.error === 'not-allowed') {
        toast({
          title: 'Mikrofon-Zugriff verweigert',
          description: 'Bitte erlaube den Zugriff auf dein Mikrofon in den Browser-Einstellungen.',
          variant: 'destructive',
        });
      } else if (event.error !== 'aborted') {
        toast({
          title: 'Spracherkennung fehlgeschlagen',
          description: 'Bitte versuche es erneut.',
          variant: 'destructive',
        });
      }
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setInterimText(interimTranscript);

      if (finalTranscript) {
        setInterimText('');
        onTranscription(finalTranscript.trim());
        // Auto-stop after getting final result
        recognition.stop();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [onTranscription, onListeningChange, toast]);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      toast({
        title: 'Nicht unterstützt',
        description: 'Dein Browser unterstützt keine Spracherkennung. Bitte verwende Chrome oder Edge.',
        variant: 'destructive',
      });
      return;
    }

    try {
      recognitionRef.current?.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
    }
  }, [toast]);

  const stopListening = useCallback(() => {
    setIsProcessing(true);
    recognitionRef.current?.stop();
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Browser doesn't support Web Speech API
  if (!SpeechRecognition) {
    return null;
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleListening}
        disabled={disabled || isProcessing}
        className={cn(
          "h-[44px] w-[44px] shrink-0 relative transition-all duration-300",
          isListening && "text-primary bg-primary/10 hover:bg-primary/20"
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
          ) : isListening ? (
            <motion.div
              key="listening"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative"
            >
              <MicOff className="w-5 h-5" />
              {/* Animated pulse rings */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                animate={{ 
                  scale: [1, 1.5, 1.8],
                  opacity: [0.6, 0.3, 0]
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                animate={{ 
                  scale: [1, 1.3, 1.5],
                  opacity: [0.8, 0.4, 0]
                }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.1 }}
            >
              <Mic className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
      
      {/* Interim text indicator */}
      <AnimatePresence>
        {interimText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-full left-0 right-0 mb-2 px-3 py-2 bg-card/95 backdrop-blur-xl rounded-lg border border-white/10 text-sm text-muted-foreground"
          >
            <span className="italic">"{interimText}"</span>
            <motion.span 
              className="ml-1"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              ...
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
