import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, Play, Pause, Loader2, Check, ChevronLeft, 
  Monitor, Smartphone, Square, RefreshCw, ExternalLink,
  Film, Settings, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Player } from '@remotion/player';
import { ExplainerVideo } from '@/remotion/templates/ExplainerVideo';
import type { ExplainerBriefing, ExplainerScript, GeneratedAsset } from '@/types/explainer-studio';
import type { AnimationConfig } from './AnimationStep';
import type { AudioConfig } from './AudioStep';

const EXPORT_FORMATS = [
  { id: 'landscape', label: 'Landscape', icon: Monitor, width: 1920, height: 1080, description: 'YouTube, Website' },
  { id: 'portrait', label: 'Portrait', icon: Smartphone, width: 1080, height: 1920, description: 'TikTok, Reels, Stories' },
  { id: 'square', label: 'Square', icon: Square, width: 1080, height: 1080, description: 'Instagram, Facebook' },
];

const QUALITY_OPTIONS = [
  { id: 'high', label: 'Hohe Qualität', description: '1080p, 60fps', fps: 60 },
  { id: 'medium', label: 'Standard', description: '1080p, 30fps', fps: 30 },
  { id: 'fast', label: 'Schnell', description: '720p, 30fps', fps: 30, scale: 0.67 },
];

interface ExportStepProps {
  briefing: ExplainerBriefing;
  script: ExplainerScript;
  assets: GeneratedAsset[];
  animationConfig: AnimationConfig;
  audioConfig: AudioConfig;
  onBack: () => void;
}

export function ExportStep({ 
  briefing, 
  script, 
  assets, 
  animationConfig, 
  audioConfig,
  onBack 
}: ExportStepProps) {
  const [activeTab, setActiveTab] = useState('preview');
  const [selectedFormat, setSelectedFormat] = useState('landscape');
  const [selectedQuality, setSelectedQuality] = useState('high');
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Calculate total duration from scenes
  const totalDuration = useMemo(() => {
    return script.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  }, [script.scenes]);

  // Prepare scenes with assets for Remotion
  const preparedScenes = useMemo(() => {
    return script.scenes.map((scene, index) => {
      const asset = assets.find(a => a.sceneId === scene.id);
      const sceneAnimation = animationConfig.sceneAnimations[scene.id];
      
      return {
        id: scene.id,
        type: scene.type,
        title: scene.title,
        spokenText: scene.spokenText,
        visualDescription: scene.visualDescription,
        durationSeconds: scene.durationSeconds,
        startTime: scene.startTime,
        endTime: scene.endTime,
        emotionalTone: scene.emotionalTone,
        imageUrl: asset?.imageUrl,
        animation: sceneAnimation?.entryAnimation || 'fadeIn',
        textAnimation: sceneAnimation?.textAnimation || 'fadeWords',
      };
    });
  }, [script.scenes, assets, animationConfig]);

  // Get selected format dimensions
  const format = EXPORT_FORMATS.find(f => f.id === selectedFormat) || EXPORT_FORMATS[0];
  const quality = QUALITY_OPTIONS.find(q => q.id === selectedQuality) || QUALITY_OPTIONS[0];

  // Player input props
  const inputProps = useMemo(() => ({
    scenes: preparedScenes,
    voiceoverUrl: audioConfig.voiceoverUrl || undefined,
    backgroundMusicUrl: audioConfig.backgroundMusicUrl || undefined,
    backgroundMusicVolume: (audioConfig.musicVolume / 100) * 0.3,
    style: briefing.style,
    primaryColor: '#F5C76A',
    secondaryColor: '#8B5CF6',
    showSceneTitles: animationConfig.globalSettings.showSceneTitles,
    showProgressBar: animationConfig.globalSettings.showProgressBar,
  }), [preparedScenes, audioConfig, briefing.style, animationConfig.globalSettings]);

  // Start rendering
  const handleStartRender = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStatus('Vorbereitung...');
    setOutputUrl(null);

    try {
      // Call render edge function
      const { data, error } = await supabase.functions.invoke('render-explainer-video', {
        body: {
          scenes: preparedScenes,
          voiceoverUrl: audioConfig.voiceoverUrl,
          backgroundMusicUrl: audioConfig.backgroundMusicUrl,
          backgroundMusicVolume: (audioConfig.musicVolume / 100) * 0.3,
          style: briefing.style,
          showSceneTitles: animationConfig.globalSettings.showSceneTitles,
          showProgressBar: animationConfig.globalSettings.showProgressBar,
          format: {
            width: format.width,
            height: format.height,
            fps: quality.fps,
          },
          totalDuration,
        },
      });

      if (error) throw error;

      // Poll for progress
      if (data?.renderId) {
        await pollRenderProgress(data.renderId);
      } else if (data?.outputUrl) {
        setOutputUrl(data.outputUrl);
        setRenderProgress(100);
        setRenderStatus('Fertig!');
        toast.success('Video erfolgreich gerendert!');
      }
    } catch (error) {
      console.error('Render error:', error);
      toast.error('Fehler beim Rendern des Videos');
      setRenderStatus('Fehler aufgetreten');
    } finally {
      setIsRendering(false);
    }
  };

  // Poll render progress
  const pollRenderProgress = async (renderId: string) => {
    const maxAttempts = 120; // 10 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        const { data, error } = await supabase.functions.invoke('check-explainer-render', {
          body: { renderId },
        });

        if (error) throw error;

        if (data?.progress) {
          setRenderProgress(data.progress);
          setRenderStatus(data.status || 'Rendering...');
        }

        if (data?.done && data?.outputUrl) {
          setOutputUrl(data.outputUrl);
          setRenderProgress(100);
          setRenderStatus('Fertig!');
          toast.success('Video erfolgreich gerendert!');
          return;
        }

        if (data?.error) {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error('Progress check error:', error);
      }

      attempts++;
    }

    toast.error('Rendering-Timeout erreicht');
  };

  // Download video
  const handleDownload = () => {
    if (outputUrl) {
      window.open(outputUrl, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 mb-4"
        >
          <Download className="h-4 w-4 text-primary" />
          <span className="text-sm text-primary font-medium">Export</span>
        </motion.div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Vorschau & Export
        </h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Überprüfe dein Erklärvideo und exportiere es in deinem gewünschten Format.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-muted/20 border border-white/10">
          <TabsTrigger value="preview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Play className="h-4 w-4 mr-2" />
            Vorschau
          </TabsTrigger>
          <TabsTrigger value="export" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Download className="h-4 w-4 mr-2" />
            Export
          </TabsTrigger>
        </TabsList>

        {/* Preview Tab */}
        <TabsContent value="preview" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Video Player */}
            <div className="lg:col-span-2">
              <Card className="bg-card/60 backdrop-blur-xl border-white/10 overflow-hidden">
                <div className="aspect-video bg-black relative">
                  <Player
                    component={ExplainerVideo}
                    inputProps={inputProps}
                    durationInFrames={Math.ceil(totalDuration * 30)}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    fps={30}
                    style={{ width: '100%', height: '100%' }}
                    controls
                    autoPlay={false}
                    loop={false}
                  />
                </div>
              </Card>
            </div>

            {/* Video Info */}
            <div className="space-y-4">
              <Card className="bg-card/60 backdrop-blur-xl border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Film className="h-5 w-5 text-primary" />
                    Video-Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Dauer</span>
                    <span className="font-medium">{Math.ceil(totalDuration)} Sekunden</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Szenen</span>
                    <span className="font-medium">{script.scenes.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Style</span>
                    <span className="font-medium capitalize">{briefing.style.replace('-', ' ')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Voice-Over</span>
                    <span className="font-medium">{audioConfig.voiceName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Musik</span>
                    <span className="font-medium">{audioConfig.backgroundMusicId || 'Keine'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="bg-card/60 backdrop-blur-xl border-white/10">
                <CardContent className="pt-4 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setActiveTab('export')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Zum Export
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Format Selection */}
            <Card className="bg-card/60 backdrop-blur-xl border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-primary" />
                  Format wählen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedFormat} onValueChange={setSelectedFormat}>
                  <div className="grid gap-3">
                    {EXPORT_FORMATS.map((format) => {
                      const Icon = format.icon;
                      return (
                        <div key={format.id}>
                          <RadioGroupItem
                            value={format.id}
                            id={format.id}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={format.id}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                              "hover:bg-muted/20",
                              selectedFormat === format.id
                                ? "bg-primary/20 border-primary/50"
                                : "bg-muted/10 border-white/10"
                            )}
                          >
                            <div className={cn(
                              "w-12 h-12 rounded-lg flex items-center justify-center",
                              selectedFormat === format.id ? "bg-primary/30" : "bg-muted/30"
                            )}>
                              <Icon className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{format.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {format.width}x{format.height} • {format.description}
                              </p>
                            </div>
                            {selectedFormat === format.id && (
                              <Check className="h-5 w-5 text-primary" />
                            )}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Quality Selection */}
            <Card className="bg-card/60 backdrop-blur-xl border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  Qualität
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedQuality} onValueChange={setSelectedQuality}>
                  <div className="grid gap-3">
                    {QUALITY_OPTIONS.map((quality) => (
                      <div key={quality.id}>
                        <RadioGroupItem
                          value={quality.id}
                          id={`quality-${quality.id}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`quality-${quality.id}`}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                            "hover:bg-muted/20",
                            selectedQuality === quality.id
                              ? "bg-primary/20 border-primary/50"
                              : "bg-muted/10 border-white/10"
                          )}
                        >
                          <div className="flex-1">
                            <p className="font-medium">{quality.label}</p>
                            <p className="text-sm text-muted-foreground">{quality.description}</p>
                          </div>
                          {selectedQuality === quality.id && (
                            <Check className="h-5 w-5 text-primary" />
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>

                {/* Render Button */}
                <div className="mt-6 pt-6 border-t border-white/10">
                  {isRendering ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-sm font-medium">{renderStatus}</span>
                      </div>
                      <Progress value={renderProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">
                        {renderProgress}% abgeschlossen
                      </p>
                    </div>
                  ) : outputUrl ? (
                    <div className="space-y-3">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-center"
                      >
                        <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                        <p className="font-medium text-green-400">Video bereit!</p>
                      </motion.div>
                      <div className="grid grid-cols-2 gap-3">
                        <Button onClick={handleDownload} className="w-full">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => window.open(outputUrl, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Öffnen
                        </Button>
                      </div>
                      <Button 
                        variant="ghost" 
                        onClick={handleStartRender}
                        className="w-full"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Erneut rendern
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleStartRender}
                      className="w-full bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
                      size="lg"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Video rendern
                    </Button>
                  )}

                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Geschätzte Renderzeit: ~{Math.ceil(totalDuration / 10)} Minuten
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-white/10">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>

        <div className="text-sm text-muted-foreground">
          {outputUrl ? (
            <span className="text-green-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Export abgeschlossen
            </span>
          ) : (
            'Rendere dein Video im Export-Tab'
          )}
        </div>
      </div>
    </div>
  );
}
