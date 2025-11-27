import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Crop, Smartphone, Monitor, Square, RectangleVertical, Wand2 } from 'lucide-react';

const ASPECT_RATIOS = [
  { id: '16:9', name: '16:9', description: 'YouTube, TV', icon: Monitor, width: 1920, height: 1080 },
  { id: '9:16', name: '9:16', description: 'TikTok, Reels', icon: Smartphone, width: 1080, height: 1920 },
  { id: '1:1', name: '1:1', description: 'Instagram Feed', icon: Square, width: 1080, height: 1080 },
  { id: '4:5', name: '4:5', description: 'Instagram Portrait', icon: RectangleVertical, width: 1080, height: 1350 },
  { id: '4:3', name: '4:3', description: 'Standard', icon: Monitor, width: 1440, height: 1080 },
  { id: '21:9', name: '21:9', description: 'Cinematic', icon: Monitor, width: 2560, height: 1080 },
];

interface CropVariant {
  aspectRatio: string;
  enabled: boolean;
  focusPoint: { x: number; y: number };
  autoTrack: boolean;
}

interface SmartCroppingProps {
  sourceAspectRatio: string;
  cropVariants: CropVariant[];
  onVariantsChange: (variants: CropVariant[]) => void;
  videoUrl: string;
}

export function SmartCropping({
  sourceAspectRatio,
  cropVariants,
  onVariantsChange,
  videoUrl,
}: SmartCroppingProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedSubjects, setDetectedSubjects] = useState<string[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

  const handleAutoDetect = async () => {
    setIsAnalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setDetectedSubjects(['Person (Hauptfokus)', 'Produkt', 'Text/Logo']);
    
    // Auto-enable common ratios with smart focus
    const updatedVariants = ASPECT_RATIOS.map(ratio => ({
      aspectRatio: ratio.id,
      enabled: ['16:9', '9:16', '1:1'].includes(ratio.id),
      focusPoint: { x: 0.5, y: 0.4 }, // Slightly above center for faces
      autoTrack: true,
    }));
    onVariantsChange(updatedVariants);
    setIsAnalyzing(false);
  };

  const toggleVariant = (ratioId: string) => {
    const existing = cropVariants.find(v => v.aspectRatio === ratioId);
    if (existing) {
      onVariantsChange(
        cropVariants.map(v => 
          v.aspectRatio === ratioId ? { ...v, enabled: !v.enabled } : v
        )
      );
    } else {
      onVariantsChange([
        ...cropVariants,
        { aspectRatio: ratioId, enabled: true, focusPoint: { x: 0.5, y: 0.5 }, autoTrack: true }
      ]);
    }
  };

  const toggleAutoTrack = (ratioId: string) => {
    onVariantsChange(
      cropVariants.map(v => 
        v.aspectRatio === ratioId ? { ...v, autoTrack: !v.autoTrack } : v
      )
    );
  };

  const getVariant = (ratioId: string) => cropVariants.find(v => v.aspectRatio === ratioId);
  const enabledCount = cropVariants.filter(v => v.enabled).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Crop className="h-4 w-4 text-blue-500" />
          Smart Cropping / Reframing
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Auto-Detect */}
        <Button
          onClick={handleAutoDetect}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Erkenne Subjekte...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              AI Auto-Erkennung
            </>
          )}
        </Button>

        {/* Detected Subjects */}
        {detectedSubjects.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium">Erkannte Elemente</label>
            <div className="flex flex-wrap gap-1">
              {detectedSubjects.map((subject, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {subject}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Aspect Ratio Selection */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium">Export-Formate</label>
            <Badge variant="secondary" className="text-[10px]">
              {enabledCount} aktiv
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIOS.map((ratio) => {
              const variant = getVariant(ratio.id);
              const isEnabled = variant?.enabled || false;
              const Icon = ratio.icon;
              
              return (
                <button
                  key={ratio.id}
                  onClick={() => toggleVariant(ratio.id)}
                  className={`
                    relative p-2 rounded-lg border-2 transition-all text-center
                    ${isEnabled 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <Icon className={`h-5 w-5 mx-auto mb-1 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium block">{ratio.name}</span>
                  <span className="text-[9px] text-muted-foreground">{ratio.description}</span>
                  {isEnabled && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Auto-Track Settings */}
        {enabledCount > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <label className="text-xs font-medium">Tracking-Einstellungen</label>
            {cropVariants.filter(v => v.enabled).map((variant) => {
              const ratio = ASPECT_RATIOS.find(r => r.id === variant.aspectRatio);
              return (
                <div key={variant.aspectRatio} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{ratio?.name}</Badge>
                    <span className="text-[10px] text-muted-foreground">Auto-Track Subjekt</span>
                  </div>
                  <Switch
                    checked={variant.autoTrack}
                    onCheckedChange={() => toggleAutoTrack(variant.aspectRatio)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Preview Selection */}
        {enabledCount > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <label className="text-xs font-medium">Vorschau</label>
            <div className="flex gap-1 flex-wrap">
              {cropVariants.filter(v => v.enabled).map((variant) => (
                <Button
                  key={variant.aspectRatio}
                  variant={selectedPreview === variant.aspectRatio ? "default" : "outline"}
                  size="sm"
                  className="text-[10px] h-7"
                  onClick={() => setSelectedPreview(
                    selectedPreview === variant.aspectRatio ? null : variant.aspectRatio
                  )}
                >
                  {variant.aspectRatio}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Export Info */}
        {enabledCount > 0 && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground">
              <strong>{enabledCount} Varianten</strong> werden beim Export erstellt. 
              Jede Variante wird mit KI-gestütztem Tracking optimiert.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
