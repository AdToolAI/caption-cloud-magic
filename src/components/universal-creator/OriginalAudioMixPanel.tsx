import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Volume2 } from 'lucide-react';
import { tx } from '@/lib/i18nText';

interface OriginalAudioMixPanelProps {
  enabled: boolean;
  volume: number;
  onEnabledChange: (v: boolean) => void;
  onVolumeChange: (v: number) => void;
}

/**
 * Global mix control for the original scene-video audio.
 * Per-scene hard-mutes set in Step 2 always win over this global toggle.
 */
export function OriginalAudioMixPanel({ enabled, volume, onEnabledChange, onVolumeChange }: OriginalAudioMixPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Volume2 className="h-4 w-4" /> {tx({ de: "Original-Sound der Szenen", en: "Original scene sound", es: "Sonido original de las escenas" })}
        </CardTitle>
        <CardDescription>
          {tx({ de: "Nimmt den Ton aus deinen Szenen-Videos mit auf und mischt ihn unter Voice-Over und Musik. Einzelne Szenen kannst du in Schritt 2 stummschalten.", en: "Includes the audio from your scene videos and mixes it under voice-over and music. You can mute individual scenes in step 2.", es: "Incluye el audio de tus videos de escena y lo mezcla bajo la voz en off y la música. Puedes silenciar escenas individuales en el paso 2." })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="uc-use-original-audio" className="text-sm">{tx({ de: "Original-Ton der Videos aktivieren", en: "Enable original video sound", es: "Activar sonido original del video" })}</Label>
          <Switch id="uc-use-original-audio" checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{tx({ de: "Lautstärke Original-Ton", en: "Original sound volume", es: "Volumen del sonido original" })}</Label>
            <span className="text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[volume]}
            onValueChange={([v]) => onVolumeChange(Math.max(0, Math.min(1, v)))}
            min={0}
            max={1}
            step={0.05}
            disabled={!enabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
