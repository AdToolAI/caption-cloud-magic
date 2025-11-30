import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Film, Sparkles, Zap, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AIFrameInterpolationProps {
  videoUrl?: string;
  sourceFps?: number;
  settings: {
    enabled: boolean;
    targetFps: 60 | 120 | 240;
    motionSmoothing: number;
    preserveMotionBlur: boolean;
    slowMotionFactor: number;
  };
  onSettingsChange: (settings: AIFrameInterpolationProps['settings']) => void;
  onInterpolationComplete?: (result: { job_id: string; status: string }) => void;
}

export function AIFrameInterpolation({ 
  videoUrl, 
  sourceFps = 30,
  settings, 
  onSettingsChange,
  onInterpolationComplete 
}: AIFrameInterpolationProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInterpolate = async () => {
    if (!videoUrl) {
      toast({
        title: 'Kein Video ausgewählt',
        description: 'Bitte wähle zuerst ein Video aus.',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('director-cut-interpolation', {
        body: {
          video_url: videoUrl,
          source_fps: sourceFps,
          target_fps: settings.targetFps,
          interpolation_mode: settings.preserveMotionBlur ? 'film' : 'smooth'
        }
      });

      if (fnError) throw fnError;

      if (data?.error === 'INSUFFICIENT_CREDITS') {
        toast({
          title: 'Nicht genügend Credits',
          description: data.message,
          variant: 'destructive'
        });
        return;
      }

      if (data?.success) {
        toast({
          title: 'Frame Interpolation gestartet',
          description: `${sourceFps}fps → ${settings.targetFps}fps. ${data.credits_required} Credits reserviert.`
        });
        onInterpolationComplete?.(data);
      }
    } catch (err) {
      console.error('Interpolation error:', err);
      setError(err instanceof Error ? err.message : 'Interpolation fehlgeschlagen');
      toast({
        title: 'Fehler bei Frame Interpolation',
        description: 'Bitte versuche es später erneut.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const fpsOptions = [
    { value: 60, label: '60 FPS', description: 'Flüssig', credits: 5 },
    { value: 120, label: '120 FPS', description: 'Ultra-Flüssig', credits: 10 },
    { value: 240, label: '240 FPS', description: 'Slow-Mo Ready', credits: 15 },
  ];

  const selectedOption = fpsOptions.find(o => o.value === settings.targetFps);

  return (
    <div className="p-4 space-y-4 rounded-xl border border-border bg-card">
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
          <div className="p-2 bg-muted/50 rounded text-center">
            <span className="text-sm text-muted-foreground">Quell-Framerate: </span>
            <span className="text-sm font-medium">{sourceFps} FPS</span>
          </div>

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
                    disabled={option.value <= sourceFps}
                  />
                  <Label
                    htmlFor={`fps-${option.value}`}
                    className={`flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer ${option.value <= sourceFps ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                    <span className="text-xs text-primary font-medium mt-1">{option.credits} Credits</span>
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

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <Button 
            onClick={handleInterpolate} 
            disabled={isProcessing || !videoUrl || settings.targetFps <= sourceFps}
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
                Interpolation starten ({selectedOption?.credits} Credits)
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
    </div>
  );
}
