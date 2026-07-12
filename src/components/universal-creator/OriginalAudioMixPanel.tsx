import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Volume2 } from 'lucide-react';

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
          <Volume2 className="h-4 w-4" /> Original-Sound der Szenen
        </CardTitle>
        <CardDescription>
          Nimmt den Ton aus deinen Szenen-Videos mit auf und mischt ihn unter Voice-Over und Musik.
          Einzelne Szenen kannst du in Schritt 2 stummschalten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="uc-use-original-audio" className="text-sm">Original-Ton der Videos aktivieren</Label>
          <Switch id="uc-use-original-audio" checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Lautstärke Original-Ton</Label>
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
