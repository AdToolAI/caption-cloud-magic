import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { History, Sparkles, Zap, ScanLine, Palette, Focus, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AIVideoRestorationProps {
  videoUrl?: string;
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
  onRestorationComplete?: (result: { job_id: string; status: string }) => void;
}

export function AIVideoRestoration({ 
  videoUrl, 
  settings, 
  onSettingsChange,
  onRestorationComplete 
}: AIVideoRestorationProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
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
      const { data, error: fnError } = await supabase.functions.invoke('director-cut-restoration', {
        body: {
          video_url: videoUrl,
          restoration_options: {
            denoise: settings.removeGrain,
            denoise_strength: settings.grainStrength,
            deblock: settings.removeScratches,
            deblock_strength: settings.scratchDetection,
            stabilize: settings.stabilizeFootage,
            stabilize_strength: settings.stabilizationStrength,
            color_correction: settings.colorCorrection,
            face_enhance: settings.enhanceFaces,
            deinterlace: settings.deinterlace
          }
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
          title: 'Video-Restaurierung gestartet',
          description: `${data.active_features} Features aktiv. ${data.credits_required} Credits reserviert.`
        });
        onRestorationComplete?.(data);
      }
    } catch (err) {
      console.error('Restoration error:', err);
      setError(err instanceof Error ? err.message : 'Restaurierung fehlgeschlagen');
      toast({
        title: 'Fehler bei Restaurierung',
        description: 'Bitte versuche es später erneut.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate credits based on active features
  const calculateCredits = () => {
    let credits = 5; // base
    if (settings.removeGrain) credits += 3;
    if (settings.removeScratches) credits += 3;
    if (settings.stabilizeFootage) credits += 5;
    if (settings.colorCorrection) credits += 3;
    if (settings.enhanceFaces) credits += 5;
    if (settings.deinterlace) credits += 2;
    return credits;
  };

  const restorationFeatures = [
    {
      id: 'removeGrain',
      label: 'Filmkorn entfernen',
      description: 'Entfernt analoges Filmkorn',
      icon: ScanLine,
      hasStrength: true,
      strengthKey: 'grainStrength',
      credits: 3,
    },
    {
      id: 'removeScratches',
      label: 'Kratzer & Staub entfernen',
      description: 'Repariert physische Beschädigungen',
      icon: Focus,
      hasStrength: true,
      strengthKey: 'scratchDetection',
      credits: 3,
    },
    {
      id: 'stabilizeFootage',
      label: 'Bildstabilisierung',
      description: 'Korrigiert verwackeltes Material',
      icon: Focus,
      hasStrength: true,
      strengthKey: 'stabilizationStrength',
      credits: 5,
    },
    {
      id: 'colorCorrection',
      label: 'Farbrestaurierung',
      description: 'Stellt verblasste Farben wieder her',
      icon: Palette,
      hasStrength: false,
      credits: 3,
    },
  ];

  return (
    <div className="p-4 space-y-4 rounded-xl border border-border bg-card">
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
                    <div className="flex items-center gap-2">
                      <Label className="cursor-pointer">{feature.label}</Label>
                      <span className="text-xs text-primary">+{feature.credits}</span>
                    </div>
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
            
            <div className="flex items-center justify-between">
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
              <span className="text-xs text-primary">+5</span>
            </div>

            <div className="flex items-center justify-between">
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
              <span className="text-xs text-primary">+2</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <Button 
            onClick={handleRestore} 
            disabled={isProcessing || !videoUrl}
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
                Restaurierung starten ({calculateCredits()} Credits)
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
    </div>
  );
}
