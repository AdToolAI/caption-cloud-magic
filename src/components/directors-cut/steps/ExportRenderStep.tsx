import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Download, 
  Film, 
  Sparkles, 
  Clock, 
  HardDrive,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { ExportSettings, GlobalEffects, AudioEnhancements, SceneAnalysis } from '@/types/directors-cut';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExportRenderStepProps {
  exportSettings: ExportSettings;
  onExportSettingsChange: (settings: ExportSettings) => void;
  videoUrl: string;
  effects: GlobalEffects;
  audio: AudioEnhancements;
  scenes: SceneAnalysis[];
  onRender: () => void;
}

const QUALITY_OPTIONS = [
  { 
    value: 'hd', 
    label: 'HD 1080p', 
    description: 'Full HD Qualität',
    credits: 10,
    size: '~50-100 MB/min'
  },
  { 
    value: '4k', 
    label: '4K Ultra HD', 
    description: 'Höchste Qualität',
    credits: 20,
    size: '~200-400 MB/min'
  },
];

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4', description: 'Universell kompatibel' },
  { value: 'webm', label: 'WebM', description: 'Web-optimiert' },
  { value: 'mov', label: 'MOV', description: 'Apple ProRes' },
];

export function ExportRenderStep({
  exportSettings,
  onExportSettingsChange,
  videoUrl,
  effects,
  audio,
  scenes,
  onRender,
}: ExportRenderStepProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderComplete, setRenderComplete] = useState(false);

  const selectedQuality = QUALITY_OPTIONS.find(q => q.value === exportSettings.quality);
  
  const calculateCredits = () => {
    const baseCredits = selectedQuality?.credits || 10;
    const effectMultiplier = effects.filter ? 1.2 : 1;
    const audioMultiplier = audio.noise_reduction || audio.voice_enhancement ? 1.3 : 1;
    return Math.round(baseCredits * effectMultiplier * audioMultiplier);
  };

  const handleRender = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('render-directors-cut', {
        body: {
          source_video_url: videoUrl,
          effects,
          audio_settings: audio,
          export_settings: exportSettings,
          duration_seconds: 30, // TODO: Get actual duration
        },
      });

      if (error) throw error;

      if (data?.error === 'INSUFFICIENT_CREDITS') {
        toast.error(data.message);
        setIsRendering(false);
        return;
      }

      toast.success('Rendering gestartet!');
      
      // Poll for progress (simplified)
      const interval = setInterval(() => {
        setRenderProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsRendering(false);
            setRenderComplete(true);
            return 100;
          }
          return prev + Math.random() * 10;
        });
      }, 1000);
    } catch (error) {
      console.error('Render error:', error);
      toast.error('Fehler beim Starten des Renderings');
      setIsRendering(false);
    }
  };

  const appliedEffectsCount = [
    effects.filter,
    effects.brightness !== 100,
    effects.contrast !== 100,
    effects.saturation !== 100,
    effects.sharpness > 0,
    effects.vignette > 0,
  ].filter(Boolean).length;

  const appliedAudioCount = [
    audio.noise_reduction,
    audio.voice_enhancement,
    audio.auto_ducking,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Export & Render</h3>
        <p className="text-sm text-muted-foreground">
          Wähle Qualität und Format für dein fertiges Video
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Preview & Summary */}
        <div className="space-y-4">
          {/* Video Preview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Vorschau mit Effekten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  style={{
                    filter: `
                      brightness(${effects.brightness / 100})
                      contrast(${effects.contrast / 100})
                      saturate(${effects.saturation / 100})
                    `.trim(),
                  }}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              </div>
            </CardContent>
          </Card>

          {/* Applied Changes Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-muted-foreground" />
                  Szenen analysiert
                </span>
                <Badge variant="secondary">{scenes.length}</Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  Visuelle Effekte
                </span>
                <Badge variant="secondary">{appliedEffectsCount} aktiv</Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  Audio Enhancements
                </span>
                <Badge variant="secondary">{appliedAudioCount} aktiv</Badge>
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="flex items-center justify-between font-medium">
                  <span>Geschätzte Credits</span>
                  <span className="text-primary">{calculateCredits()} Credits</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Export Settings */}
        <div className="space-y-4">
          {/* Quality Selection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Qualität</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.quality}
                onValueChange={(v) => onExportSettingsChange({ 
                  ...exportSettings, 
                  quality: v as 'hd' | '4k' 
                })}
                className="space-y-3"
              >
                {QUALITY_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    className={`
                      flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${exportSettings.quality === option.value 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                      }
                    `}
                    onClick={() => onExportSettingsChange({ 
                      ...exportSettings, 
                      quality: option.value as 'hd' | '4k' 
                    })}
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <div className="flex-1">
                      <Label htmlFor={option.value} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">{option.credits} Credits</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{option.size}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Format Selection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Format</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.format}
                onValueChange={(v) => onExportSettingsChange({ 
                  ...exportSettings, 
                  format: v as 'mp4' | 'webm' | 'mov' 
                })}
                className="grid grid-cols-3 gap-2"
              >
                {FORMAT_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    className={`
                      flex flex-col items-center p-3 rounded-lg border cursor-pointer transition-all
                      ${exportSettings.format === option.value 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                      }
                    `}
                    onClick={() => onExportSettingsChange({ 
                      ...exportSettings, 
                      format: option.value as 'mp4' | 'webm' | 'mov' 
                    })}
                  >
                    <RadioGroupItem value={option.value} id={`format-${option.value}`} className="sr-only" />
                    <span className="font-medium text-sm">.{option.value}</span>
                    <span className="text-xs text-muted-foreground text-center">{option.description}</span>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Render Button / Progress */}
          <Card>
            <CardContent className="pt-6">
              {renderComplete ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Rendering abgeschlossen!</h4>
                    <p className="text-sm text-muted-foreground">
                      Dein Video ist fertig und kann heruntergeladen werden
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1">
                      <Download className="h-4 w-4 mr-2" />
                      Video herunterladen
                    </Button>
                    <Button variant="outline" onClick={() => setRenderComplete(false)}>
                      Neu rendern
                    </Button>
                  </div>
                </div>
              ) : isRendering ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rendering...
                    </span>
                    <span>{Math.round(renderProgress)}%</span>
                  </div>
                  <Progress value={renderProgress} />
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      ~2-5 Min
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {selectedQuality?.size}
                    </span>
                  </div>
                </div>
              ) : (
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleRender}
                >
                  <Film className="h-4 w-4 mr-2" />
                  Video rendern ({calculateCredits()} Credits)
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
