import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ArrowUpCircle, Sparkles, Zap } from 'lucide-react';

interface AIVideoUpscalingProps {
  settings: {
    enabled: boolean;
    targetResolution: '2k' | '4k' | '8k';
    enhanceDetails: boolean;
    denoiseStrength: number;
    sharpnessBoost: number;
  };
  onSettingsChange: (settings: AIVideoUpscalingProps['settings']) => void;
}

export function AIVideoUpscaling({ settings, onSettingsChange }: AIVideoUpscalingProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUpscale = async () => {
    setIsProcessing(true);
    // Simulate AI upscaling process
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsProcessing(false);
  };

  const resolutionOptions = [
    { value: '2k', label: '2K (2560×1440)', description: '2x Upscale' },
    { value: '4k', label: '4K (3840×2160)', description: '4x Upscale' },
    { value: '8k', label: '8K (7680×4320)', description: '8x Upscale' },
  ];

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

          <Button 
            onClick={handleUpscale} 
            disabled={isProcessing}
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
                Vorschau generieren
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
