import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAudioEnhancement } from '@/hooks/useAudioEnhancement';

interface StudioSoundButtonProps {
  audioUrl: string;
  onEnhanced: (url: string) => void;
}

export function StudioSoundButton({ audioUrl, onEnhanced }: StudioSoundButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const { enhanceAudio } = useAudioEnhancement();

  const handleClick = async () => {
    if (isProcessing || !audioUrl) return;
    
    setIsProcessing(true);
    setIsComplete(false);

    try {
      console.log('Starting Studio Sound enhancement (pure client-side)...');
      console.log('Input audio URL:', audioUrl);
      
      // Pure client-side enhancement - no external API needed
      // This applies: high-pass filter, low-pass filter, voice EQ, compression, gain boost, normalization
      const enhancedUrl = await enhanceAudio(audioUrl, {
        normalize: true,
        compression: true,
        gainBoost: 3,
        highPassFilter: true,
        lowPassFilter: true,
        voiceEQ: true
      });
      
      console.log('Studio Sound enhancement complete');
      
      onEnhanced(enhancedUrl);
      setIsComplete(true);
      
      toast.success(tx({ de: "Audio erfolgreich verbessert!", en: "Audio successfully improved!", es: "¡Audio mejorado con éxito!" }), {
        description: tx({ de: "Studio Sound wurde angewendet", en: "Studio Sound has been applied", es: "Se ha aplicado sonido de estudio." })
      });
      
      // Reset complete state after animation
      setTimeout(() => setIsComplete(false), 2000);
      
    } catch (error) {
      console.error('Error enhancing audio:', error);
      toast.error(tx({ de: "Fehler bei der Audioverbesserung", en: "Audio enhancement error", es: "Error de mejora de audio" }), {
        description: error instanceof Error ? error.message : tx({ de: "Unbekannter Fehler", en: "Unknown error", es: "Error desconocido" })
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Button
        onClick={handleClick}
        disabled={isProcessing}
        className={`
          relative overflow-hidden group
          ${isComplete 
            ? 'bg-green-500/20 border-green-500/50 hover:bg-green-500/30' 
            : 'bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90'
          }
        `}
        variant={isComplete ? 'outline' : 'default'}
      >
        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.span
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center"
            >
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Optimiere...
            </motion.span>
          ) : isComplete ? (
            <motion.span
              key="complete"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center text-green-400"
            >
              <Check className="w-4 h-4 mr-2" />
              {tx({ de: 'Studio Sound aktiv', en: 'Studio sound active', es: 'Sonido de estudio activo' })}
            </motion.span>
          ) : (
            <motion.span
              key="default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Studio Sound
            </motion.span>
          )}
        </AnimatePresence>

        {/* Shimmer effect */}
        {!isComplete && !isProcessing && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
        )}

        {/* Pulse effect when complete */}
        {isComplete && (
          <motion.div
            className="absolute inset-0 bg-green-500/10 rounded-lg"
            animate={{ opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </Button>
    </motion.div>
  );
}
