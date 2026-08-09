import { tx } from "@/lib/i18nText";
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
        title: tx({ de: 'Kein Video ausgewählt', en: 'No video selected', es: 'Ningún vídeo seleccionado' }),
        description: tx({ de: 'Bitte wähle zuerst ein Video aus.', en: 'Please select a video first.', es: 'Por favor, selecciona un video primero.' }),
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
          title: tx({ de: 'Frame Interpolation gestartet', en: 'Frame interpolation started', es: 'Se inició la interpolación de cuadros.' }),
          description: `${sourceFps}fps → ${settings.targetFps}fps. ${data.credits_required} Credits reserviert.`
        });
        onInterpolationComplete?.(data);
      }
    } catch (err) {
      console.error('Interpolation error:', err);
      setError(err instanceof Error ? err.message : tx({ de: 'Interpolation fehlgeschlagen', en: 'Interpolation failed', es: 'La interpolación falló' }));
      toast({
        title: tx({ de: 'Fehler bei Frame Interpolation', en: 'Frame interpolation error', es: 'Error de interpolación de trama' }),
        description: tx({ de: 'Bitte versuche es später erneut.', en: 'Please try again later.', es: 'Por favor, inténtalo de nuevo más tarde.' }),
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
            <span className="text-sm text-muted-foreground">{tx({ de: "Quell-Framerate: ", en: "Source framerate: ", es: "Frecuencia de fotogramas de origen: " })}</span>
            <span className="text-sm font-medium">{sourceFps} FPS</span>
          </div>

          <div className="space-y-2">
            <Label>{tx({ de: "Ziel-Framerate", en: "Target Framerate", es: "Tasa de fotogramas objetivo" })}</Label>
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
              <Label>{tx({ de: "Motion Smoothing", en: "Motion Smoothing", es: "Suavizado de movimiento" })}</Label>
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
              {tx({ de: "Höhere Werte = weichere Bewegungen", en: "Higher values = smoother movements", es: "Valores más altos = movimientos más suaves" })}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{tx({ de: "Motion Blur beibehalten", en: "Preserve motion blur", es: "Preservar desenfoque de movimiento" })}</Label>
              <p className="text-xs text-muted-foreground">
                {tx({ de: "Erhält natürliche Bewegungsunschärfe", en: "Maintains natural motion blur", es: "Mantiene el desenfoque de movimiento natural" })}
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
                <Label>{tx({ de: "Slow-Motion Faktor", en: "Slow-Motion Factor", es: "Factor de cámara lenta" })}</Label>
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
              {tx({ de: "1x = Normal, 8x = Extreme Zeitlupe", en: "1x = Normal, 8x = Extreme slow motion", es: "1x = Normal, 8x = Cámara lenta extrema" })}
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
                {tx({ de: "Interpolation läuft...", en: "Interpolation in progress...", es: "Interpolación en curso..." })}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {tx({ de: `Interpolation starten (${selectedOption?.credits} Credits)`, en: `Start interpolation (${selectedOption?.credits} credits)`, es: `Iniciar interpolación (${selectedOption?.credits} créditos)` })}
              </>
            )}
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Hinweis:</strong> Für beste Slow-Motion Ergebnisse 240 FPS wählen. 
              {tx({ de: "Die KI generiert fehlende Frames basierend auf Bewegungsanalyse.", en: "The AI ​​generates missing frames based on motion analysis.", es: "La IA genera fotogramas faltantes basándose en el análisis del movimiento." })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
