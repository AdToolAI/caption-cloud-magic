import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Check, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExplainerLanguage } from '@/types/explainer-studio';
import { VOICE_OPTIONS } from '@/types/explainer-studio';

interface VoiceSelectorProps {
  selectedVoiceId: string;
  selectedLanguage: ExplainerLanguage;
  onSelectVoice: (voiceId: string, voiceName: string) => void;
  onSelectLanguage: (language: ExplainerLanguage) => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'de' as ExplainerLanguage, label: 'Deutsch', flag: '🇩🇪' },
  { value: 'de-ch' as ExplainerLanguage, label: 'Schweiz', flag: '🇨🇭' },
  { value: 'en' as ExplainerLanguage, label: 'English', flag: '🇬🇧' },
  { value: 'es' as ExplainerLanguage, label: 'Español', flag: '🇪🇸' },
  { value: 'fr' as ExplainerLanguage, label: 'Français', flag: '🇫🇷' },
  { value: 'it' as ExplainerLanguage, label: 'Italiano', flag: '🇮🇹' },
  { value: 'pt' as ExplainerLanguage, label: 'Português', flag: '🇵🇹' },
  { value: 'nl' as ExplainerLanguage, label: 'Nederlands', flag: '🇳🇱' },
];

export function VoiceSelector({ 
  selectedVoiceId, 
  selectedLanguage, 
  onSelectVoice, 
  onSelectLanguage 
}: VoiceSelectorProps) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const filteredVoices = VOICE_OPTIONS.filter(v => v.language === selectedLanguage);

  const handlePlayPreview = (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      setPlayingVoiceId(null);
      // Stop audio
    } else {
      setPlayingVoiceId(voiceId);
      // Play preview audio
      // In production, this would call ElevenLabs API for a preview
      setTimeout(() => setPlayingVoiceId(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Language Selection */}
      <div className="flex items-center gap-2 mb-4">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-2">Sprache:</span>
        <div className="flex gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <button
              key={lang.value}
              onClick={() => onSelectLanguage(lang.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200",
                selectedLanguage === lang.value
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-muted/20 border-white/10 hover:bg-muted/40"
              )}
            >
              <span>{lang.flag}</span>
              <span className="text-sm">{lang.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Voice Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {filteredVoices.map((voice, index) => (
          <motion.button
            key={voice.id}
            onClick={() => onSelectVoice(voice.id, voice.name)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "relative p-4 rounded-xl border transition-all duration-200 text-left",
              selectedVoiceId === voice.id
                ? "bg-primary/20 border-primary/50 shadow-[0_0_20px_rgba(245,199,106,0.2)]"
                : "bg-muted/20 border-white/10 hover:bg-muted/40 hover:border-white/20"
            )}
          >
            {/* Selection Indicator */}
            {selectedVoiceId === voice.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
              >
                <Check className="h-3 w-3 text-primary-foreground" />
              </motion.div>
            )}

            {/* Voice Avatar */}
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-3",
              voice.gender === 'female' 
                ? "bg-pink-500/20 text-pink-400" 
                : "bg-blue-500/20 text-blue-400"
            )}>
              {voice.name.charAt(0)}
            </div>

            {/* Voice Info */}
            <div>
              <h4 className="font-semibold text-sm">{voice.name}</h4>
              <p className="text-xs text-muted-foreground">{voice.style}</p>
            </div>

            {/* Play Preview Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handlePlayPreview(voice.id);
              }}
              className="absolute bottom-2 right-2 h-8 w-8 p-0 rounded-full bg-white/5 hover:bg-white/10"
            >
              {playingVoiceId === voice.id ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
          </motion.button>
        ))}
      </div>

      {/* Voice Info */}
      {filteredVoices.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>Keine Stimmen für diese Sprache verfügbar.</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        💡 Powered by ElevenLabs. 29+ Sprachen und 100+ Premium-Stimmen verfügbar.
      </p>
    </div>
  );
}
