import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Play, Volume2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AdvancedVoiceSettings, VoiceSettings } from './AdvancedVoiceSettings';

interface VoiceOverEditorProps {
  voiceStyle: string;
  voiceSpeed: number;
  scriptText: string;
  onVoiceStyleChange: (value: string) => void;
  onVoiceSpeedChange: (value: number) => void;
}

const VOICE_OPTIONS = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria (weiblich, warm)' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (männlich, tief)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (weiblich, freundlich)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (weiblich, professionell)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (männlich, jung)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (männlich, autoritär)' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum (männlich, energisch)' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River (neutral, modern)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (männlich, britisch)' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (weiblich, elegant)' },
];

export const VoiceOverEditor = ({
  voiceStyle,
  voiceSpeed,
  scriptText,
  onVoiceStyleChange,
  onVoiceSpeedChange,
}: VoiceOverEditorProps) => {
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [advancedSettings, setAdvancedSettings] = useState<VoiceSettings | null>(null);
  const { toast } = useToast();

  const handlePreview = async () => {
    if (!scriptText.trim()) {
      toast({
        title: "Kein Text vorhanden",
        description: "Bitte gib zuerst einen Skript-Text ein.",
        variant: "destructive",
      });
      return;
    }

    setIsPreviewPlaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: {
          text: scriptText.substring(0, 200), // First 200 chars for preview
          voiceId: voiceStyle,
          speed: voiceSpeed,
        }
      });

      if (error) throw error;

      if (data?.audioContent) {
        // Create blob URL from base64
        const byteCharacters = atob(data.audioContent);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        setAudioUrl(url);
        
        // Play audio
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => {
          setIsPreviewPlaying(false);
          URL.revokeObjectURL(url);
        };

        toast({
          title: "🎧 Preview abgespielt",
          description: "Hörprobe der Stimme erfolgreich generiert.",
        });
      }
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Fehler",
        description: "Hörprobe konnte nicht generiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsPreviewPlaying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Voice Selection */}
      <div className="space-y-2">
        <Label htmlFor="voice">Stimme</Label>
        <Select value={voiceStyle} onValueChange={onVoiceStyleChange}>
          <SelectTrigger id="voice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOICE_OPTIONS.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Preview */}
      <Button
        variant="outline"
        onClick={handlePreview}
        disabled={isPreviewPlaying || !scriptText.trim()}
        className="w-full"
      >
        {isPreviewPlaying ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generiere Hörprobe...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Stimme anhören
          </>
        )}
      </Button>

      {/* Voice Speed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="speed" className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Sprechgeschwindigkeit
          </Label>
          <span className="text-sm text-muted-foreground">{voiceSpeed.toFixed(1)}x</span>
        </div>
        <Slider
          id="speed"
          min={0.5}
          max={2.0}
          step={0.1}
          value={[voiceSpeed]}
          onValueChange={([value]) => onVoiceSpeedChange(value)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Langsamer (0.5x)</span>
          <span>Normal (1.0x)</span>
          <span>Schneller (2.0x)</span>
        </div>
      </div>

      {/* Voice Tips */}
      {/* Advanced Settings */}
      <AdvancedVoiceSettings
        onSettingsChange={(settings) => setAdvancedSettings(settings)}
      />

      <div className="p-4 bg-muted rounded-lg space-y-2">
        <p className="text-sm font-medium">💡 Tipps für die perfekte Stimme:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Nutze die Hörprobe um verschiedene Stimmen zu testen</li>
          <li>• 1.0x ist die natürliche Sprechgeschwindigkeit</li>
          <li>• Werbung: 1.2-1.5x für mehr Energie</li>
          <li>• Erklärvideos: 0.9-1.0x für bessere Verständlichkeit</li>
          <li>• Erweiterte Einstellungen für Fein-Tuning der Stimme</li>
        </ul>
      </div>
    </div>
  );
};
