import { tx } from '@/lib/i18nText';
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
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: tx({ de: "Roger (männlich, tief)", en: "Roger (male, deep)", es: "Roger (masculino, grave)" }) },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (weiblich, freundlich)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (weiblich, professionell)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: tx({ de: "Charlie (männlich, jung)", en: "Charlie (male, young)", es: "Charlie (masculino, joven)" }) },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: tx({ de: "George (männlich, autoritär)", en: "George (male, authoritative)", es: "George (masculino, autoritario)" }) },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: tx({ de: "Callum (männlich, energisch)", en: "Callum (male, energetic)", es: "Callum (masculino, enérgico)" }) },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River (neutral, modern)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: tx({ de: "Liam (männlich, britisch)", en: "Liam (male, British)", es: "Liam (masculino, británico)" }) },
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
        title: tx({ de: "Kein Text vorhanden", en: "No text available", es: "No hay texto disponible" }),
        description: tx({ de: "Bitte gib zuerst einen Skript-Text ein.", en: "Please enter script text first.", es: "Por favor, introduce primero el texto del guion." }),
        variant: "destructive",
      });
      return;
    }

    console.log('[VoicePreview] Starting preview with:', {
      voiceId: voiceStyle,
      speed: voiceSpeed,
      textLength: scriptText.length,
      textPreview: scriptText.substring(0, 50)
    });

    setIsPreviewPlaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('preview-voice', {
        body: {
          text: scriptText.substring(0, 200), // First 200 chars for preview
          voiceId: voiceStyle,
          speed: voiceSpeed,
        }
      });

      if (error) {
        console.error('[VoicePreview] Error details:', error);
        const errorMsg = (error as any)?.message || (error as any)?.error || tx({ de: 'Hörprobe konnte nicht generiert werden.', en: 'Could not generate voice preview.', es: 'No se pudo generar la muestra de voz.' });
        toast({
          title: tx({ de: "Fehler bei Voice-Preview", en: "Voice preview error", es: "Error en la vista previa de voz" }),
          description: errorMsg,
          variant: "destructive",
        });
        throw error;
      }

      console.log('[VoicePreview] Received audio content, size:', data?.audioContent?.length);

      if (!data?.audioContent || typeof data.audioContent !== 'string' || data.audioContent.length < 100) {
        throw new Error(tx({ de: 'Ungültige Audio-Daten von Server erhalten', en: 'Invalid audio data received from server', es: 'Datos de audio no válidos recibidos del servidor' }));
      }

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
          title: tx({ de: "🎧 Preview abgespielt", en: "🎧 Preview played", es: "🎧 Vista previa reproducida" }),
          description: tx({ de: "Hörprobe der Stimme erfolgreich generiert.", en: "Voice preview generated successfully.", es: "Muestra de voz generada correctamente." }),
        });
      }
    } catch (error) {
      console.error('[VoicePreview] Full error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error as any)?.error || (error as any)?.message || tx({ de: "Hörprobe konnte nicht generiert werden. Überprüfe die Browser-Konsole für Details.", en: "Could not generate voice preview. Check the browser console for details.", es: "No se pudo generar la muestra de voz. Consulta la consola del navegador para más detalles." });
      
      toast({
        title: tx({ de: "Fehler bei Voice-Preview", en: "Voice preview error", es: "Error en la vista previa de voz" }),
        description: errorMessage,
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
        <Label htmlFor="voice">{tx({ de: "Stimme", en: "Voice", es: "Voz" })}</Label>
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
            {tx({ de: "Generiere Hörprobe...", en: "Generating audio preview...", es: "Generando vista previa de audio..." })}
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            {tx({ de: "Stimme anhören", en: "Preview voice", es: "Escuchar voz" })}
          </>
        )}
      </Button>

      {/* Voice Speed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="speed" className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            {tx({ de: "Sprechgeschwindigkeit", en: "Speech speed", es: "Velocidad del habla" })}
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
          <span>{tx({ de: "Langsamer (0.5x)", en: "Slower (0.5x)", es: "Más lento (0.5x)" })}</span>
          <span>Normal (1.0x)</span>
          <span>{tx({ de: "Schneller (2.0x)", en: "Faster (2.0x)", es: "Más rápido (2.0x)" })}</span>
        </div>
      </div>

      {/* Voice Tips */}
      {/* Advanced Settings */}
      <AdvancedVoiceSettings
        onSettingsChange={(settings) => setAdvancedSettings(settings)}
      />

      <div className="p-4 bg-muted rounded-lg space-y-2">
        <p className="text-sm font-medium">💡 {tx({ de: "Tipps für die perfekte Stimme:", en: "Tips for the perfect voice:", es: "Consejos para la voz perfecta:" })}</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• {tx({ de: "Nutze die Hörprobe um verschiedene Stimmen zu testen", en: "Use the preview to test different voices", es: "Usa la vista previa para probar diferentes voces" })}</li>
          <li>• {tx({ de: "1.0x ist die natürliche Sprechgeschwindigkeit", en: "1.0x is the natural speaking speed", es: "1.0x es la velocidad de habla natural" })}</li>
          <li>• {tx({ de: "Werbung: 1.2-1.5x für mehr Energie", en: "Advertising: 1.2-1.5x for more energy", es: "Publicidad: 1.2-1.5x para más energía" })}</li>
          <li>• {tx({ de: "Erklärvideos: 0.9-1.0x für bessere Verständlichkeit", en: "Explainer videos: 0.9-1.0x for better clarity", es: "Videos explicativos: 0.9-1.0x para mayor claridad" })}</li>
          <li>• {tx({ de: "Erweiterte Einstellungen für Fein-Tuning der Stimme", en: "Advanced settings for fine-tuning the voice", es: "Configuración avanzada para ajustar la voz" })}</li>
        </ul>
      </div>
    </div>
  );
};
