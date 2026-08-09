import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ArrowUpCircle, Sparkles, Zap, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useTx } from '@/lib/i18nText';
import { tx } from '@/lib/i18nText';

interface AIVideoUpscalingProps {
  videoUrl?: string;
  settings: {
    enabled: boolean;
    targetResolution: '2k' | '4k' | '8k';
    enhanceDetails: boolean;
    denoiseStrength: number;
    sharpnessBoost: number;
  };
  onSettingsChange: (settings: AIVideoUpscalingProps['settings']) => void;
  onUpscaleComplete?: (result: { job_id: string; status: string }) => void;
}

export function AIVideoUpscaling({ videoUrl, settings, onSettingsChange, onUpscaleComplete }: AIVideoUpscalingProps) {
  const tx = useTx();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpscale = async () => {
    if (!videoUrl) {
      toast({
        title: tx({ de: 'Kein Video ausgewählt', en: 'No video selected', es: 'Ningún video seleccionado' }),
        description: tx({ de: 'Bitte wähle zuerst ein Video aus.', en: 'Please select a video first.', es: 'Por favor, selecciona primero un video.' }),
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('director-cut-upscale', {
        body: {
          video_url: videoUrl,
          target_resolution: settings.targetResolution,
          enhance_details: settings.enhanceDetails,
          denoise_strength: settings.denoiseStrength,
          sharpness_boost: settings.sharpnessBoost
        }
      });

      if (fnError) throw fnError;

      if (data?.error === 'INSUFFICIENT_CREDITS') {
        toast({
          title: tx({ de: 'Nicht genügend Credits', en: 'Not enough credits', es: 'Créditos insuficientes' }),
          description: data.message,
          variant: 'destructive'
        });
        return;
      }

      if (data?.success) {
        toast({
          title: tx({ de: 'Upscaling gestartet', en: 'Upscaling started', es: 'Escalado iniciado' }),
          description: `${tx({ de: 'Job', en: 'Job', es: 'Trabajo' })} ${data.job_id} ${tx({ de: 'wurde erstellt.', en: 'was created.', es: 'fue creado.' })} ${data.credits_required} ${tx({ de: 'Credits reserviert.', en: 'credits reserved.', es: 'créditos reservados.' })}`
        });
        onUpscaleComplete?.(data);
      }
    } catch (err) {
      console.error('Upscaling error:', err);
      setError(err instanceof Error ? err.message : tx({ de: 'Upscaling fehlgeschlagen', en: 'Upscaling failed', es: 'Error al escalar' }));
      toast({
        title: tx({ de: 'Fehler beim Upscaling', en: 'Upscaling error', es: 'Error de escalado' }),
        description: tx({ de: 'Bitte versuche es später erneut.', en: 'Please try again later.', es: 'Por favor, inténtalo de nuevo más tarde.' }),
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resolutionOptions = [
    { value: '2k', label: '2K', resolution: '2560×1440', description: '2x', credits: 15 },
    { value: '4k', label: '4K', resolution: '3840×2160', description: '4x', credits: 25 },
    { value: '8k', label: '8K', resolution: '7680×4320', description: '8x', credits: 50 },
  ];

  const selectedOption = resolutionOptions.find(o => o.value === settings.targetResolution);

  return (
    <div className="p-4 space-y-4 rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Video Upscaling</h3>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) => onSettingsChange({ ...settings, enabled })}
        />
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{tx({ de: "Ziel-Auflösung", en: "Target resolution", es: "Resolución objetivo" })}</Label>
            <RadioGroup
              value={settings.targetResolution}
              onValueChange={(value: '2k' | '4k' | '8k') => 
                onSettingsChange({ ...settings, targetResolution: value })
              }
              className="grid grid-cols-3 gap-2"
            >
              {resolutionOptions.map((option) => (
                <div key={option.value}>
                  <RadioGroupItem
                    value={option.value}
                    id={`res-${option.value}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`res-${option.value}`}
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer text-center overflow-hidden"
                  >
                    <span className="font-bold text-base">{option.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{option.resolution}</span>
                    <span className="text-[10px] text-muted-foreground">{option.description}</span>
                    <span className="text-[10px] text-primary font-medium">{option.credits} Cr</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{tx({ de: "KI Detail-Enhancement", en: "AI detail enhancement", es: "Mejora de detalles con IA" })}</Label>
              <p className="text-xs text-muted-foreground">
                {tx({ de: "Verbessert feine Details und Texturen", en: "Enhances fine details and textures", es: "Mejora detalles finos y texturas" })}
              </p>
            </div>
            <Switch
              checked={settings.enhanceDetails}
              onCheckedChange={(enhanceDetails) => 
                onSettingsChange({ ...settings, enhanceDetails })
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{tx({ de: "Rauschunterdrückung", en: "Noise reduction", es: "Reducción de ruido" })}</Label>
              <span className="text-sm text-muted-foreground">
                {settings.denoiseStrength}%
              </span>
            </div>
            <Slider
              value={[settings.denoiseStrength]}
              onValueChange={([value]) => 
                onSettingsChange({ ...settings, denoiseStrength: value })
              }
              max={100}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{tx({ de: "Schärfe-Boost", en: "Sharpness boost", es: "Aumento de nitidez" })}</Label>
              <span className="text-sm text-muted-foreground">
                {settings.sharpnessBoost}%
              </span>
            </div>
            <Slider
              value={[settings.sharpnessBoost]}
              onValueChange={([value]) => 
                onSettingsChange({ ...settings, sharpnessBoost: value })
              }
              max={100}
              step={5}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <Button 
            onClick={handleUpscale} 
            disabled={isProcessing || !videoUrl}
            className="w-full gap-2"
          >
            {isProcessing ? (
              <>
                <Zap className="h-4 w-4 animate-pulse" />
                {tx({ de: 'Upscaling läuft...', en: 'Upscaling in progress...', es: 'Escalando...' })}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {tx({ de: 'Upscaling starten', en: 'Start upscaling', es: 'Iniciar escalado' })} ({selectedOption?.credits} Credits)
              </>
            )}
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
<strong>{tx({ de: 'Tipp:', en: 'Tip:', es: 'Consejo:' })}</strong> {tx({ de: '4K Upscaling bietet das beste Verhältnis zwischen Qualität und Renderzeit. 8K eignet sich für großflächige Displays.', en: '4K upscaling offers the best balance between quality and render time. 8K is best suited for large-format displays.', es: 'El escalado a 4K ofrece el mejor equilibrio entre calidad y tiempo de renderizado. 8K es ideal para pantallas de gran formato.' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
