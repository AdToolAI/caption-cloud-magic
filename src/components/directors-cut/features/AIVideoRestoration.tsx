import { tx } from "@/lib/i18nText";
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
        title: tx({ de: 'Kein Video ausgewählt', en: 'No video selected', es: 'Ningún vídeo seleccionado' }),
        description: tx({ de: 'Bitte wähle zuerst ein Video aus.', en: 'Please select a video first.', es: 'Por favor, selecciona un video primero.' }),
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
          title: tx({ de: 'Nicht genügend Credits', en: 'Insufficient credits', es: 'Créditos insuficientes' }),
          description: data.message,
          variant: 'destructive'
        });
        return;
      }

      if (data?.success) {
        toast({
          title: tx({ de: 'Video-Restaurierung gestartet', en: 'Video restoration started', es: 'Restauración de vídeo iniciada' }),
          description: tx({ de: `${data.active_features} Features aktiv. ${data.credits_required} Credits reserviert.`, en: `${data.active_features} features active. ${data.credits_required} credits reserved.`, es: `${data.active_features} funciones activas. ${data.credits_required} créditos reservados.` })
        });
        onRestorationComplete?.(data);
      }
    } catch (err) {
      console.error('Restoration error:', err);
      setError(err instanceof Error ? err.message : tx({ de: 'Restaurierung fehlgeschlagen', en: 'Restoration failed', es: 'La restauración falló' }));
      toast({
        title: tx({ de: 'Fehler bei Restaurierung', en: 'Restoration error', es: 'Error de restauración' }),
        description: tx({ de: 'Bitte versuche es später erneut.', en: 'Please try again later.', es: 'Por favor, inténtalo de nuevo más tarde.' }),
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
      label: tx({ de: 'Filmkorn entfernen', en: 'Remove film grain', es: 'Eliminar el grano de la película' }),
      description: tx({ de: 'Entfernt analoges Filmkorn', en: 'Removes analog film grain', es: 'Elimina el grano de película analógico' }),
      icon: ScanLine,
      hasStrength: true,
      strengthKey: 'grainStrength',
      credits: 3,
    },
    {
      id: 'removeScratches',
      label: tx({ de: 'Kratzer & Staub entfernen', en: 'Remove scratches & dust', es: 'Eliminar arañazos y polvo' }),
      description: tx({ de: 'Repariert physische Beschädigungen', en: 'Repairs physical damage', es: 'Repara daños físicos' }),
      icon: Focus,
      hasStrength: true,
      strengthKey: 'scratchDetection',
      credits: 3,
    },
    {
      id: 'stabilizeFootage',
      label: tx({ de: 'Bildstabilisierung', en: 'Image stabilization', es: 'Estabilización de imagen' }),
      description: tx({ de: 'Korrigiert verwackeltes Material', en: 'Corrects shaky material', es: 'Corrige material inestable' }),
      icon: Focus,
      hasStrength: true,
      strengthKey: 'stabilizationStrength',
      credits: 5,
    },
    {
      id: 'colorCorrection',
      label: tx({ de: 'Farbrestaurierung', en: 'Color restoration', es: 'Restauración de color' }),
      description: tx({ de: 'Stellt verblasste Farben wieder her', en: 'Restores faded colors', es: 'Restaura los colores desvaídos' }),
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
          <h3 className="font-semibold">{tx({ de: "AI Video Restaurierung", en: "AI Video Restoration", es: "Restauración de vídeo por IA" })}</h3>
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
                    <span className="text-xs text-muted-foreground">{tx({ de: "Stärke", en: "Strength", es: "Intensidad" })}</span>
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
            <Label className="text-sm font-medium">{tx({ de: "Zusätzliche Optionen", en: "Additional options", es: "Opciones adicionales" })}</Label>
            
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
                  {tx({ de: "KI Gesichtsverbesserung", en: "AI face enhancement", es: "Mejora facial por IA" })}
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
                  {tx({ de: "Deinterlacing (für alte TV-Aufnahmen)", en: "Deinterlacing (for old TV recordings)", es: "Desentrelazado (para grabaciones de TV antiguas)" })}
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
                {tx({ de: "Restaurierung läuft...", en: "Restoration in progress...", es: "Restauración en curso..." })}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {tx({ de: `Restaurierung starten (${calculateCredits()} Credits)`, en: `Start restoration (${calculateCredits()} credits)`, es: `Iniciar restauración (${calculateCredits()} créditos)` })}
              </>
            )}
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>{tx({ de: "Perfekt für:", en: "Perfect for:", es: "Perfecto para:" })}</strong> Alte Familienvideos, VHS-Aufnahmen, 
              {tx({ de: "{tx({ de: \"historisches Filmmaterial und beschädigte Aufnahmen.\", en: \"historical footage and damaged recordings.\", es: \"material histórico y grabaciones dañadas.\" })}", en: "historical footage and damaged recordings.", es: "material histórico y grabaciones dañadas." })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
