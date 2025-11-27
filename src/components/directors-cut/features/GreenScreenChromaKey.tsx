import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, Eraser, Pipette, Upload, Wand2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const PRESET_COLORS = [
  { id: 'green', name: 'Grün', color: '#00ff00', hsl: [120, 100, 50] },
  { id: 'blue', name: 'Blau', color: '#0000ff', hsl: [240, 100, 50] },
  { id: 'red', name: 'Rot', color: '#ff0000', hsl: [0, 100, 50] },
  { id: 'white', name: 'Weiß', color: '#ffffff', hsl: [0, 0, 100] },
  { id: 'black', name: 'Schwarz', color: '#000000', hsl: [0, 0, 0] },
];

interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  edgeSoftness: number;
  spillSuppression: number;
  backgroundUrl?: string;
}

interface GreenScreenChromaKeyProps {
  videoUrl: string;
  settings: ChromaKeySettings;
  onSettingsChange: (settings: ChromaKeySettings) => void;
}

export function GreenScreenChromaKey({
  videoUrl,
  settings,
  onSettingsChange,
}: GreenScreenChromaKeyProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleColorPick = (color: string) => {
    onSettingsChange({ ...settings, color, enabled: true });
    setAiConfidence(null);
  };

  const handleAIDetect = async () => {
    if (!videoUrl) {
      toast({
        title: 'Fehler',
        description: 'Kein Video zum Analysieren vorhanden',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('director-cut-chroma-key', {
        body: {
          video_url: videoUrl,
        },
      });

      if (error) {
        throw new Error(error.message || 'AI Chroma-Key-Analyse fehlgeschlagen');
      }

      if (data?.analysis) {
        const analysis = data.analysis;
        
        onSettingsChange({ 
          ...settings, 
          color: analysis.detected_color || '#00ff00',
          enabled: true,
          tolerance: analysis.recommended_tolerance || 35,
          edgeSoftness: analysis.recommended_edge_softness || 2,
          spillSuppression: analysis.recommended_spill_suppression || 50,
        });
        
        setAiConfidence(analysis.confidence || 0.85);
        
        toast({
          title: 'AI Erkennung abgeschlossen',
          description: `${analysis.color_name || 'Farbe'} erkannt mit ${Math.round((analysis.confidence || 0.85) * 100)}% Konfidenz. (${data.credits_used || 3} Credits)`,
        });
      } else {
        throw new Error('Ungültige Antwort vom Server');
      }
    } catch (err: any) {
      console.error('Chroma Key detection error:', err);
      toast({
        title: 'Fehler',
        description: err.message || 'AI Chroma-Key-Analyse fehlgeschlagen',
        variant: 'destructive',
      });
      
      // Fallback to default green screen settings
      onSettingsChange({ 
        ...settings, 
        color: '#00ff00', 
        enabled: true,
        tolerance: 35,
        edgeSoftness: 2,
        spillSuppression: 50,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onSettingsChange({ ...settings, backgroundUrl: url });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eraser className="h-4 w-4 text-green-500" />
          Green Screen / Chroma Key
          <Badge variant="secondary" className="ml-auto">3 Credits</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Auto-Detect */}
        <Button
          onClick={handleAIDetect}
          disabled={isProcessing || !videoUrl}
          className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Erkenne Hintergrund...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              AI Auto-Erkennung
            </>
          )}
        </Button>

        {/* Color Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Key-Farbe auswählen</label>
          <div className="flex gap-2">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleColorPick(preset.color)}
                className={`
                  w-8 h-8 rounded-full border-2 transition-all
                  ${settings.color === preset.color 
                    ? 'ring-2 ring-primary ring-offset-2' 
                    : 'border-border hover:scale-110'
                  }
                `}
                style={{ backgroundColor: preset.color }}
                title={preset.name}
              />
            ))}
            <button
              onClick={() => setIsPicking(!isPicking)}
              className={`
                w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all
                ${isPicking ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
              `}
              title="Farbe aus Video"
            >
              <Pipette className="h-4 w-4" />
            </button>
          </div>
          {isPicking && (
            <p className="text-[10px] text-muted-foreground">
              Klicke im Video auf die zu entfernende Farbe
            </p>
          )}
        </div>

        {/* Current Color Display */}
        {settings.enabled && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
            <div 
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: settings.color }}
            />
            <div className="flex-1">
              <span className="text-xs">Aktive Key-Farbe: {settings.color}</span>
              {aiConfidence !== null && (
                <span className="text-[10px] text-green-600 ml-2">
                  AI Konfidenz: {Math.round(aiConfidence * 100)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tolerance Slider */}
        {settings.enabled && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Toleranz</Label>
              <span className="text-xs text-muted-foreground">{settings.tolerance}%</span>
            </div>
            <Slider
              value={[settings.tolerance]}
              onValueChange={(v) => onSettingsChange({ ...settings, tolerance: v[0] })}
              min={5}
              max={80}
              step={1}
            />
          </div>
        )}

        {/* Edge Softness */}
        {settings.enabled && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Kanten-Weichheit</Label>
              <span className="text-xs text-muted-foreground">{settings.edgeSoftness}px</span>
            </div>
            <Slider
              value={[settings.edgeSoftness]}
              onValueChange={(v) => onSettingsChange({ ...settings, edgeSoftness: v[0] })}
              min={0}
              max={10}
              step={0.5}
            />
          </div>
        )}

        {/* Spill Suppression */}
        {settings.enabled && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Farbüberlauf-Unterdrückung</Label>
              <span className="text-xs text-muted-foreground">{settings.spillSuppression}%</span>
            </div>
            <Slider
              value={[settings.spillSuppression]}
              onValueChange={(v) => onSettingsChange({ ...settings, spillSuppression: v[0] })}
              min={0}
              max={100}
              step={5}
            />
          </div>
        )}

        {/* Background Replacement */}
        {settings.enabled && (
          <div className="space-y-2 pt-2 border-t">
            <label className="text-xs font-medium">Ersatz-Hintergrund</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleBackgroundUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {settings.backgroundUrl ? 'Hintergrund ändern' : 'Hintergrund hochladen'}
            </Button>
            {settings.backgroundUrl && (
              <div className="relative aspect-video bg-muted rounded overflow-hidden">
                <img 
                  src={settings.backgroundUrl} 
                  alt="Background" 
                  className="w-full h-full object-cover"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 h-6 text-xs"
                  onClick={() => onSettingsChange({ ...settings, backgroundUrl: undefined })}
                >
                  Entfernen
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Preview Toggle */}
        {settings.enabled && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setPreviewEnabled(!previewEnabled)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {previewEnabled ? 'Vorschau deaktivieren' : 'Vorschau aktivieren'}
          </Button>
        )}

        {/* Disable */}
        {settings.enabled && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              onSettingsChange({ ...settings, enabled: false });
              setAiConfidence(null);
            }}
          >
            Chroma Key deaktivieren
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
