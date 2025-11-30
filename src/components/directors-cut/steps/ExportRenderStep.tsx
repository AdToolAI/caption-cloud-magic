import { useState, useEffect } from 'react';
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
  Loader2,
  ExternalLink,
  Image,
  Mic,
  Zap,
  Wand2,
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { ExportSettings, GlobalEffects, AudioEnhancements, SceneAnalysis } from '@/types/directors-cut';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface PremiumFeatureState {
  styleTransfer?: { enabled: boolean; style: string | null };
  colorGrading?: { enabled: boolean; grade: string | null };
  upscaling?: { enabled: boolean; targetResolution: string };
  interpolation?: { enabled: boolean; targetFps: number };
  restoration?: { enabled: boolean; level: string };
  objectRemoval?: { enabled: boolean; objectsCount: number };
}

interface ExportRenderStepProps {
  exportSettings: ExportSettings;
  onExportSettingsChange: (settings: ExportSettings) => void;
  videoUrl: string;
  effects: GlobalEffects;
  audio: AudioEnhancements;
  scenes: SceneAnalysis[];
  voiceOverUrl?: string;
  videoDuration?: number;
  premiumFeatures?: PremiumFeatureState;
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  onRender: () => void;
}

const QUALITY_OPTIONS = [
  { 
    value: 'hd', 
    label: 'HD 1080p', 
    description: 'Full HD Qualität',
    baseCredits: 10,
    size: '~50-100 MB/min'
  },
  { 
    value: '4k', 
    label: '4K Ultra HD', 
    description: 'Höchste Qualität',
    baseCredits: 20,
    size: '~200-400 MB/min'
  },
];

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4', description: 'Universell kompatibel' },
  { value: 'webm', label: 'WebM', description: 'Web-optimiert' },
  { value: 'mov', label: 'MOV', description: 'Apple ProRes' },
];

// Credit costs for premium features
const PREMIUM_CREDITS = {
  styleTransfer: 5,
  colorGrading: 4,
  upscaling: 15,
  interpolation: 10,
  restoration: 12,
  objectRemoval: 8,
  voiceOver: 5,
};

export function ExportRenderStep({
  exportSettings,
  onExportSettingsChange,
  videoUrl,
  effects,
  audio,
  scenes,
  voiceOverUrl,
  videoDuration = 30,
  premiumFeatures,
  sceneColorGrading,
  onRender,
}: ExportRenderStepProps) {
  const navigate = useNavigate();
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderComplete, setRenderComplete] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);

  const selectedQuality = QUALITY_OPTIONS.find(q => q.value === exportSettings.quality);
  
  // Calculate credits based on duration, quality, and features
  const calculateCredits = () => {
    // Base credits from quality
    let credits = selectedQuality?.baseCredits || 10;
    
    // Duration multiplier
    if (videoDuration > 60) credits *= 1.5;
    if (videoDuration > 180) credits *= 2;
    
    // Basic effects add-ons
    if (effects.filter) credits += 2;
    if (audio.noise_reduction) credits += 3;
    if (audio.voice_enhancement) credits += 3;
    if (voiceOverUrl) credits += PREMIUM_CREDITS.voiceOver;
    
    // Premium feature add-ons
    if (premiumFeatures?.styleTransfer?.enabled) credits += PREMIUM_CREDITS.styleTransfer;
    if (premiumFeatures?.colorGrading?.enabled) credits += PREMIUM_CREDITS.colorGrading;
    if (premiumFeatures?.upscaling?.enabled) credits += PREMIUM_CREDITS.upscaling;
    if (premiumFeatures?.interpolation?.enabled) credits += PREMIUM_CREDITS.interpolation;
    if (premiumFeatures?.restoration?.enabled) credits += PREMIUM_CREDITS.restoration;
    if (premiumFeatures?.objectRemoval?.enabled) credits += PREMIUM_CREDITS.objectRemoval;
    
    return Math.round(credits);
  };

  // Realtime subscription for render status updates
  useEffect(() => {
    if (!currentRenderId) return;

    const channel = supabase
      .channel(`director-cut-render-${currentRenderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'director_cut_renders',
          filter: `id=eq.${currentRenderId}`,
        },
        (payload) => {
          const record = payload.new as any;
          
          if (record.progress) {
            setRenderProgress(record.progress);
          }
          
          if (record.status === 'completed' && record.output_url) {
            setRenderedVideoUrl(record.output_url);
            setRenderComplete(true);
            setIsRendering(false);
            toast.success('Video erfolgreich gerendert!');
          }
          
          if (record.status === 'failed') {
            setIsRendering(false);
            toast.error(record.error_message || 'Rendering fehlgeschlagen');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRenderId]);

  const handleRender = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    setRenderComplete(false);
    setRenderedVideoUrl(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('render-directors-cut', {
        body: {
          source_video_url: videoUrl,
          effects,
          audio_settings: {
            master_volume: audio.master_volume,
            noise_reduction: audio.noise_reduction,
            voice_enhancement: audio.voice_enhancement,
            auto_ducking: audio.auto_ducking,
            voiceover_volume: 100,
            background_music_volume: 30,
          },
          voiceover_url: voiceOverUrl,
          export_settings: exportSettings,
          duration_seconds: videoDuration,
          // Scene-specific color grading
          scene_color_grading: sceneColorGrading && Object.keys(sceneColorGrading).length > 0 
            ? sceneColorGrading 
            : undefined,
          // Premium features
          style_transfer: premiumFeatures?.styleTransfer?.enabled ? {
            enabled: true,
            style: premiumFeatures.styleTransfer.style,
            intensity: 0.8,
          } : undefined,
          color_grading: premiumFeatures?.colorGrading?.enabled ? {
            enabled: true,
            grade: premiumFeatures.colorGrading.grade,
            intensity: 0.8,
          } : undefined,
          upscaling: premiumFeatures?.upscaling?.enabled ? {
            enabled: true,
            target_resolution: premiumFeatures.upscaling.targetResolution,
          } : undefined,
          interpolation: premiumFeatures?.interpolation?.enabled ? {
            enabled: true,
            target_fps: premiumFeatures.interpolation.targetFps,
          } : undefined,
          restoration: premiumFeatures?.restoration?.enabled ? {
            enabled: true,
            level: premiumFeatures.restoration.level,
          } : undefined,
          object_removal: premiumFeatures?.objectRemoval?.enabled ? {
            enabled: true,
            objects_count: premiumFeatures.objectRemoval.objectsCount,
          } : undefined,
        },
      });

      if (error) throw error;

      if (data?.error === 'INSUFFICIENT_CREDITS') {
        toast.error(data.message);
        setIsRendering(false);
        return;
      }

      if (data?.render_id) {
        setCurrentRenderId(data.render_id);
        toast.success('Rendering gestartet!');
      }
    } catch (error) {
      console.error('Render error:', error);
      toast.error('Fehler beim Starten des Renderings');
      setIsRendering(false);
    }
  };

  const handleDownload = async () => {
    if (!renderedVideoUrl) return;
    
    try {
      const response = await fetch(renderedVideoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `directors-cut-${Date.now()}.${exportSettings.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Download gestartet');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download fehlgeschlagen');
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
    !!voiceOverUrl,
  ].filter(Boolean).length;

  const appliedPremiumCount = [
    premiumFeatures?.styleTransfer?.enabled,
    premiumFeatures?.colorGrading?.enabled,
    premiumFeatures?.upscaling?.enabled,
    premiumFeatures?.interpolation?.enabled,
    premiumFeatures?.restoration?.enabled,
    premiumFeatures?.objectRemoval?.enabled,
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

              {voiceOverUrl && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-muted-foreground" />
                    AI Voice-Over
                  </span>
                  <Badge variant="default">+{PREMIUM_CREDITS.voiceOver}</Badge>
                </div>
              )}

              {appliedPremiumCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    Premium Features
                  </span>
                  <Badge variant="secondary">{appliedPremiumCount} aktiv</Badge>
                </div>
              )}

              {/* Premium Feature Details */}
              {premiumFeatures?.styleTransfer?.enabled && (
                <div className="flex items-center justify-between text-xs pl-6">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Wand2 className="h-3 w-3" />
                    Style Transfer
                  </span>
                  <Badge variant="outline" className="text-xs">+{PREMIUM_CREDITS.styleTransfer}</Badge>
                </div>
              )}
              {premiumFeatures?.upscaling?.enabled && (
                <div className="flex items-center justify-between text-xs pl-6">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Maximize2 className="h-3 w-3" />
                    Upscaling ({premiumFeatures.upscaling.targetResolution})
                  </span>
                  <Badge variant="outline" className="text-xs">+{PREMIUM_CREDITS.upscaling}</Badge>
                </div>
              )}
              {premiumFeatures?.interpolation?.enabled && (
                <div className="flex items-center justify-between text-xs pl-6">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Interpolation ({premiumFeatures.interpolation.targetFps}fps)
                  </span>
                  <Badge variant="outline" className="text-xs">+{PREMIUM_CREDITS.interpolation}</Badge>
                </div>
              )}

              {/* Scene-specific Color Grading */}
              {sceneColorGrading && Object.keys(sceneColorGrading).length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Szenen Color Grading
                  </span>
                  <Badge variant="secondary">{Object.keys(sceneColorGrading).length} Szenen</Badge>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Video-Länge
                </span>
                <Badge variant="outline">{Math.round(videoDuration)}s</Badge>
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
                      <Badge variant="outline">{option.baseCredits}+ Credits</Badge>
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
              {renderComplete && renderedVideoUrl ? (
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
                  
                  {/* Download Button */}
                  <Button className="w-full" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Video herunterladen
                  </Button>
                  
                  {/* Post-Export Actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => navigate('/media-library?tab=rendered')}
                    >
                      <Image className="h-4 w-4 mr-2" />
                      Zur Mediathek
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => navigate(`/ai-post-generator?video_url=${encodeURIComponent(renderedVideoUrl)}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      An KI-Post
                    </Button>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      setRenderComplete(false);
                      setRenderedVideoUrl(null);
                      setCurrentRenderId(null);
                    }}
                  >
                    Neu rendern
                  </Button>
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
                  <p className="text-xs text-center text-muted-foreground">
                    Status-Updates werden automatisch empfangen. Bitte diese Seite nicht schließen.
                  </p>
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
