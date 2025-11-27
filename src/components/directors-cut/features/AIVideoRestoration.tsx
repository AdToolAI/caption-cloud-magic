import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { History, Sparkles, Zap, ScanLine, Palette, Focus } from 'lucide-react';

interface AIVideoRestorationProps {
  settings: {
    enabled: boolean;
    removeGrain: boolean;
    grainStrength: number;
    removeScratches: boolean;
    scratchDetection: number;
    stabilizeFootage: boolean;
    stabilizationStrength: number;
    colorCorrection: boolean;
    enhanceFaces: boolean;
    deinterlace: boolean;
  };
  onSettingsChange: (settings: AIVideoRestorationProps['settings']) => void;
}

export function AIVideoRestoration({ settings, onSettingsChange }: AIVideoRestorationProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRestore = async () => {
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 4000));
    setIsProcessing(false);
  };

  const restorationFeatures = [
    {
      id: 'removeGrain',
      label: 'Filmkorn entfernen',
      description: 'Entfernt analoges Filmkorn',
      icon: ScanLine,
      hasStrength: true,
      strengthKey: 'grainStrength',
    },
    {
      id: 'removeScratches',
      label: 'Kratzer & Staub entfernen',
      description: 'Repariert physische Beschädigungen',
      icon: Focus,
      hasStrength: true,
      strengthKey: 'scratchDetection',
    },
    {
      id: 'stabilizeFootage',
      label: 'Bildstabilisierung',
      description: 'Korrigiert verwackeltes Material',
      icon: Focus,
      hasStrength: true,
      strengthKey: 'stabilizationStrength',
    },
    {
      id: 'colorCorrection',
      label: 'Farbrestaurierung',
      description: 'Stellt verblasste Farben wieder her',
      icon: Palette,
      hasStrength: false,
    },
  ];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Video Restoration</h3>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) => onSettingsChange({ ...settings, enabled })}
        />
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          {restorationFeatures.map((feature) => (
            <div key={feature.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <feature.icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label className="cursor-pointer">{feature.label}</Label>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
                <Switch
                  checked={settings[feature.id as keyof typeof settings] as boolean}
                  onCheckedChange={(checked) => 
                    onSettingsChange({ ...settings, [feature.id]: checked })
                  }
                />
              </div>
              
              {feature.hasStrength && settings[feature.id as keyof typeof settings] && (
                <div className="pl-6 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Stärke</span>
                    <span className="text-xs text-muted-foreground">
                      {settings[feature.strengthKey as keyof typeof settings]}%
                    </span>
                  </div>
                  <Slider
                    value={[settings[feature.strengthKey as keyof typeof settings] as number]}
                    onValueChange={([value]) => 
                      onSettingsChange({ ...settings, [feature.strengthKey!]: value })
                    }
                    max={100}
                    step={5}
                  />
                </div>
              )}
            </div>
          ))}

          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm font-medium">Zusätzliche Optionen</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enhanceFaces"
                checked={settings.enhanceFaces}
                onCheckedChange={(checked) => 
                  onSettingsChange({ ...settings, enhanceFaces: checked as boolean })
                }
              />
              <Label htmlFor="enhanceFaces" className="text-sm cursor-pointer">
                KI Gesichtsverbesserung
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="deinterlace"
                checked={settings.deinterlace}
                onCheckedChange={(checked) => 
                  onSettingsChange({ ...settings, deinterlace: checked as boolean })
                }
              />
              <Label htmlFor="deinterlace" className="text-sm cursor-pointer">
                Deinterlacing (für alte TV-Aufnahmen)
              </Label>
            </div>
          </div>

          <Button 
            onClick={handleRestore} 
            disabled={isProcessing}
            className="w-full gap-2"
          >
            {isProcessing ? (
              <>
                <Zap className="h-4 w-4 animate-pulse" />
                Restaurierung läuft...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Restaurierung starten
              </>
            )}
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Perfekt für:</strong> Alte Familienvideos, VHS-Aufnahmen, 
              historisches Filmmaterial und beschädigte Aufnahmen.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
