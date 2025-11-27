import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Film, Sparkles, Zap, Clock } from 'lucide-react';

interface AIFrameInterpolationProps {
  settings: {
    enabled: boolean;
    targetFps: 60 | 120 | 240;
    motionSmoothing: number;
    preserveMotionBlur: boolean;
    slowMotionFactor: number;
  };
  onSettingsChange: (settings: AIFrameInterpolationProps['settings']) => void;
}

export function AIFrameInterpolation({ settings, onSettingsChange }: AIFrameInterpolationProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleInterpolate = async () => {
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsProcessing(false);
  };

  const fpsOptions = [
    { value: 60, label: '60 FPS', description: 'Flüssig' },
    { value: 120, label: '120 FPS', description: 'Ultra-Flüssig' },
    { value: 240, label: '240 FPS', description: 'Slow-Mo Ready' },
  ];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Frame Interpolation</h3>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) => onSettingsChange({ ...settings, enabled })}
        />
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ziel-Framerate</Label>
            <RadioGroup
              value={String(settings.targetFps)}
              onValueChange={(value) => 
                onSettingsChange({ ...settings, targetFps: Number(value) as 60 | 120 | 240 })
              }
              className="grid grid-cols-3 gap-2"
            >
              {fpsOptions.map((option) => (
                <div key={option.value}>
                  <RadioGroupItem
                    value={String(option.value)}
                    id={`fps-${option.value}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`fps-${option.value}`}
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Motion Smoothing</Label>
              <span className="text-sm text-muted-foreground">
                {settings.motionSmoothing}%
              </span>
            </div>
            <Slider
              value={[settings.motionSmoothing]}
              onValueChange={([value]) => 
                onSettingsChange({ ...settings, motionSmoothing: value })
              }
              max={100}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Höhere Werte = weichere Bewegungen
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Motion Blur beibehalten</Label>
              <p className="text-xs text-muted-foreground">
                Erhält natürliche Bewegungsunschärfe
              </p>
            </div>
            <Switch
              checked={settings.preserveMotionBlur}
              onCheckedChange={(preserveMotionBlur) => 
                onSettingsChange({ ...settings, preserveMotionBlur })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <Label>Slow-Motion Faktor</Label>
              </div>
              <span className="text-sm text-muted-foreground">
                {settings.slowMotionFactor}x
              </span>
            </div>
            <Slider
              value={[settings.slowMotionFactor]}
              onValueChange={([value]) => 
                onSettingsChange({ ...settings, slowMotionFactor: value })
              }
              min={1}
              max={8}
              step={0.5}
            />
            <p className="text-xs text-muted-foreground">
              1x = Normal, 8x = Extreme Zeitlupe
            </p>
          </div>

          <Button 
            onClick={handleInterpolate} 
            disabled={isProcessing}
            className="w-full gap-2"
          >
            {isProcessing ? (
              <>
                <Zap className="h-4 w-4 animate-pulse" />
                Interpolation läuft...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Vorschau generieren
              </>
            )}
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Hinweis:</strong> Für beste Slow-Motion Ergebnisse 240 FPS wählen. 
              Die KI generiert fehlende Frames basierend auf Bewegungsanalyse.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
