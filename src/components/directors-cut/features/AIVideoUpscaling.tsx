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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpscale = async () => {
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
          title: 'Nicht genügend Credits',
          description: data.message,
          variant: 'destructive'
        });
        return;
      }

      if (data?.success) {
        toast({
          title: 'Upscaling gestartet',
          description: `Job ${data.job_id} wurde erstellt. ${data.credits_required} Credits reserviert.`
        });
        onUpscaleComplete?.(data);
      }
    } catch (err) {
      console.error('Upscaling error:', err);
      setError(err instanceof Error ? err.message : 'Upscaling fehlgeschlagen');
      toast({
        title: 'Fehler beim Upscaling',
        description: 'Bitte versuche es später erneut.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resolutionOptions = [
    { value: '2k', label: '2K (2560×1440)', description: '2x Upscale', credits: 15 },
    { value: '4k', label: '4K (3840×2160)', description: '4x Upscale', credits: 25 },
    { value: '8k', label: '8K (7680×4320)', description: '8x Upscale', credits: 50 },
  ];

  const selectedOption = resolutionOptions.find(o => o.value === settings.targetResolution);

  return (
    <Card className="p-4 space-y-4">
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
            <Label>Ziel-Auflösung</Label>
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
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                    <span className="text-xs text-primary font-medium mt-1">{option.credits} Credits</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>KI Detail-Enhancement</Label>
              <p className="text-xs text-muted-foreground">
                Verbessert feine Details und Texturen
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
              <Label>Rauschunterdrückung</Label>
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
              <Label>Schärfe-Boost</Label>
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
                Upscaling läuft...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Upscaling starten ({selectedOption?.credits} Credits)
              </>
            )}
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Tipp:</strong> 4K Upscaling bietet das beste Verhältnis zwischen 
              Qualität und Renderzeit. 8K eignet sich für großflächige Displays.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
