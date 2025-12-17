import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Player, PlayerRef } from '@remotion/player';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RefreshCw, Check, AlertCircle, Loader2, Download, ArrowRight, Volume2, VolumeX, Monitor, Smartphone, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExplainerVideo } from '@/remotion/templates/ExplainerVideo';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FormatOption {
  key: 'landscape' | 'portrait' | 'square';
  label: string;
  aspect: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { key: 'landscape', label: '16:9', aspect: 'Landscape', icon: Monitor },
  { key: 'portrait', label: '9:16', aspect: 'Portrait', icon: Smartphone },
  { key: 'square', label: '1:1', aspect: 'Square', icon: Square },
];

interface UniversalVideoPreviewProps {
  project: any;
  consultationResult: any;
  onConfirm: (formats: string[]) => void;
  onRegenerateScene: (sceneId: string) => Promise<void>;
  onBack: () => void;
}

export function UniversalVideoPreview({
  project,
  consultationResult,
  onConfirm,
  onRegenerateScene,
  onBack,
}: UniversalVideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['landscape']);
  const [isExporting, setIsExporting] = useState(false);
  
  // Native HTML5 Audio Elements
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Setup Native Audio Elements
  useEffect(() => {
    console.log('[UniversalVideoPreview] Setting up native audio elements');
    console.log('[UniversalVideoPreview] voiceoverUrl:', project?.voiceoverUrl);
    console.log('[UniversalVideoPreview] backgroundMusicUrl:', project?.backgroundMusicUrl);

    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.pause();
      voiceoverAudioRef.current.src = '';
      voiceoverAudioRef.current = null;
    }
    if (backgroundMusicAudioRef.current) {
      backgroundMusicAudioRef.current.pause();
      backgroundMusicAudioRef.current.src = '';
      backgroundMusicAudioRef.current = null;
    }

    if (project?.voiceoverUrl) {
      const vo = new Audio(project.voiceoverUrl);
      vo.preload = 'auto';
      vo.crossOrigin = 'anonymous';
      vo.volume = isMuted ? 0 : volume;
      voiceoverAudioRef.current = vo;
      
      vo.onloadeddata = () => {
        console.log('[UniversalVideoPreview] ✅ Voiceover audio loaded');
        setAudioLoaded(true);
      };
      vo.onerror = (e) => console.error('[UniversalVideoPreview] ❌ Voiceover error:', e);
    }

    if (project?.backgroundMusicUrl) {
      const bg = new Audio(project.backgroundMusicUrl);
      bg.preload = 'auto';
      bg.crossOrigin = 'anonymous';
      bg.volume = (isMuted ? 0 : volume) * 0.3;
      bg.loop = true;
      backgroundMusicAudioRef.current = bg;
      
      bg.onloadeddata = () => console.log('[UniversalVideoPreview] ✅ Background music loaded');
      bg.onerror = (e) => console.error('[UniversalVideoPreview] ❌ Background music error:', e);
    }

    return () => {
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.src = '';
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.src = '';
      voiceoverAudioRef.current = null;
      backgroundMusicAudioRef.current = null;
    };
  }, [project?.voiceoverUrl, project?.backgroundMusicUrl]);

  const totalDuration = useMemo(() => {
    if (!project?.script?.scenes) return 60;
    return project.script.scenes.reduce((sum: number, scene: any) => sum + (scene.durationSeconds || 5), 0);
  }, [project?.script?.scenes]);

  const fps = 30;
  const durationInFrames = Math.ceil(totalDuration * fps);
  
  useEffect(() => {
    const effectiveVolume = isMuted ? 0 : volume;
    if (voiceoverAudioRef.current) voiceoverAudioRef.current.volume = effectiveVolume;
    if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.volume = effectiveVolume * 0.3;
  }, [volume, isMuted]);

  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      setIsPlaying(false);
    } else {
      const currentFrame = player.getCurrentFrame();
      const currentTime = currentFrame / fps;
      
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = currentTime;
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = currentTime;
      
      player.play();
      voiceoverAudioRef.current?.play().catch(console.warn);
      backgroundMusicAudioRef.current?.play().catch(console.warn);
      setIsPlaying(true);
    }
  }, [isPlaying, fps]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPause = () => {
      setIsPlaying(false);
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    };
    
    const onSeek = (e: { detail: { frame: number } }) => {
      const time = e.detail.frame / fps;
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = time;
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = time;
    };
    
    const onEnded = () => {
      setIsPlaying(false);
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
      if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;
    };

    player.addEventListener('pause', onPause);
    player.addEventListener('seeked', onSeek as any);
    player.addEventListener('ended', onEnded);

    return () => {
      player.removeEventListener('pause', onPause);
      player.removeEventListener('seeked', onSeek as any);
      player.removeEventListener('ended', onEnded);
    };
  }, [fps]);

  const enhancedScenes = useMemo(() => {
    if (!project?.script?.scenes) return [];
    
    let currentTime = 0;
    return project.script.scenes.map((scene: any, index: number) => {
      const asset = project.assets?.find((a: any) => a.sceneId === scene.id);
      
      const durationSeconds = scene.durationSeconds || scene.duration || 5;
      const startTime = scene.startTime ?? currentTime;
      const endTime = scene.endTime ?? (startTime + durationSeconds);
      currentTime = endTime;
      
      const sceneType = scene.type || ['hook', 'problem', 'solution', 'feature', 'cta'][index % 5];
      
      const animationByType: Record<string, string> = {
        hook: 'kenBurns',
        problem: 'parallax',
        solution: 'popIn',
        feature: 'flyIn',
        cta: 'zoomIn',
        proof: 'kenBurns',
      };
      
      const animation = animationByType[sceneType] || ['kenBurns', 'parallax', 'popIn', 'flyIn'][index % 4];
      const kenBurnsDirections = ['in', 'out', 'left', 'right', 'up', 'down'] as const;
      const kenBurnsDirection = kenBurnsDirections[index % kenBurnsDirections.length];
      const textAnimations = ['fadeWords', 'splitReveal', 'glowPulse', 'highlight', 'bounceIn'] as const;
      const textAnimation = textAnimations[index % textAnimations.length];
      
      return {
        ...scene,
        id: scene.id || `scene${index + 1}`,
        type: sceneType,
        durationSeconds,
        startTime,
        endTime,
        imageUrl: asset?.imageUrl,
        animation,
        kenBurnsDirection,
        textAnimation,
        parallaxLayers: 3,
      };
    });
  }, [project?.script?.scenes, project?.assets]);

  const subtitles = useMemo(() => {
    if (!project?.script?.scenes) return [];
    
    const subs: Array<{ text: string; startTime: number; endTime: number }> = [];
    let subtitleTime = 0;
    
    for (const scene of project.script.scenes) {
      const spokenText = scene.spokenText || '';
      const sceneDuration = scene.durationSeconds || 5;
      
      if (spokenText) {
        const sentences = spokenText.match(/[^.!?]+[.!?]+/g) || [spokenText];
        const timePerSentence = sceneDuration / sentences.length;
        
        for (let i = 0; i < sentences.length; i++) {
          subs.push({
            text: sentences[i].trim(),
            startTime: subtitleTime + (i * timePerSentence),
            endTime: subtitleTime + ((i + 1) * timePerSentence) - 0.1,
          });
        }
      }
      subtitleTime += sceneDuration;
    }
    
    return subs;
  }, [project?.script?.scenes]);

  const handleRegenerateScene = async (sceneId: string) => {
    setRegeneratingScene(sceneId);
    try {
      await onRegenerateScene(sceneId);
      toast.success('Szene wurde neu generiert');
    } catch (error) {
      toast.error('Fehler beim Regenerieren der Szene');
    } finally {
      setRegeneratingScene(null);
    }
  };

  const inputProps = {
    scenes: enhancedScenes,
    voiceoverUrl: project?.voiceoverUrl || null,
    backgroundMusicUrl: project?.backgroundMusicUrl || null,
    backgroundMusicVolume: 0.3,
    soundEffects: [],
    subtitles,
    subtitleConfig: {
      enabled: true,
      position: 'bottom' as const,
      fontSize: 32,
      fontColor: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.75)',
      animation: 'wordByWord' as const,
    },
    style: project?.briefing?.style || 'flat-design',
    primaryColor: consultationResult?.extractedStyleGuide?.colorPalette?.primary || '#F5C76A',
    secondaryColor: consultationResult?.extractedStyleGuide?.colorPalette?.secondary || '#8B5CF6',
    showSceneTitles: true,
    showProgressBar: true,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <Badge variant="outline" className="mb-4 px-4 py-1.5 border-primary/30 bg-primary/10">
          <Check className="h-3 w-3 mr-1.5 text-primary" />
          Video erstellt
        </Badge>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Live-Vorschau
        </h2>
        <p className="text-muted-foreground mt-2">
          Prüfe dein Video und passe einzelne Szenen an
        </p>
      </motion.div>

      {/* Main Preview Player */}
      <Card className="backdrop-blur-xl bg-card/60 border-white/10 overflow-hidden">
        <CardContent className="p-0">
          <div className="aspect-video bg-black rounded-t-lg overflow-hidden">
            <Player
              ref={playerRef}
              component={ExplainerVideo}
              inputProps={{ ...inputProps, masterVolume: 0 }}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%', height: '100%' }}
              controls
              autoPlay={false}
              numberOfSharedAudioTags={10}
              initiallyMuted={true}
              clickToPlay={false}
              renderPlayPauseButton={(props) => (
                <button
                  {...props}
                  onClickCapture={(e) => {
                    e.stopPropagation();
                    handlePlayPause();
                  }}
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 64,
                    height: 64,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 20px hsl(var(--primary) / 0.4)',
                  }}
                >
                  {isPlaying ? (
                    <Pause className="h-6 w-6 text-primary-foreground" />
                  ) : (
                    <Play className="h-6 w-6 text-primary-foreground ml-1" />
                  )}
                </button>
              )}
            />
          </div>

          {/* Controls Bar */}
          <div className="p-4 border-t border-white/10 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={([v]) => {
                    setVolume(v / 100);
                    if (v > 0) setIsMuted(false);
                  }}
                  max={100}
                  step={1}
                  className="w-24"
                />
              </div>

              <div className="flex items-center gap-2">
                {audioLoaded && (
                  <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-400">
                    <Volume2 className="h-3 w-3 mr-1" />
                    Audio bereit
                  </Badge>
                )}
                <Badge variant="secondary" className="bg-muted/30">
                  {enhancedScenes.length} Szenen
                </Badge>
                <Badge variant="secondary" className="bg-muted/30">
                  {Math.round(totalDuration)}s
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scene Timeline with Regeneration */}
      <Card className="backdrop-blur-xl bg-card/60 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg">Szenen-Timeline</CardTitle>
          <CardDescription>
            Klicke auf eine Szene, um sie einzeln neu zu generieren
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {enhancedScenes.map((scene: any, index: number) => (
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all',
                  selectedSceneId === scene.id 
                    ? 'border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]' 
                    : 'border-white/10 hover:border-primary/50'
                )}
                onClick={() => setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)}
              >
                <div className="aspect-video bg-muted/30 relative">
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={scene.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-white/20 backdrop-blur-sm hover:bg-white/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRegenerateScene(scene.id);
                      }}
                      disabled={regeneratingScene === scene.id}
                    >
                      {regeneratingScene === scene.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5 text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5 text-xs">
                    {scene.durationSeconds}s
                  </div>
                </div>

                <div className="p-2 bg-muted/20">
                  <p className="text-xs font-medium truncate">{scene.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{scene.type}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Multi-Format Export Selection */}
      <Card className="backdrop-blur-xl bg-card/60 border-white/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export-Formate
          </CardTitle>
          <CardDescription>
            Wähle die Formate für den Export (mehrere möglich)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {FORMAT_OPTIONS.map((format) => {
              const Icon = format.icon;
              const isSelected = selectedFormats.includes(format.key);
              return (
                <Button
                  key={format.key}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'flex items-center gap-2 transition-all',
                    isSelected 
                      ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)]' 
                      : 'border-white/20 hover:border-primary/50'
                  )}
                  onClick={() => {
                    if (isSelected) {
                      if (selectedFormats.length > 1) {
                        setSelectedFormats(prev => prev.filter(f => f !== format.key));
                      }
                    } else {
                      setSelectedFormats(prev => [...prev, format.key]);
                    }
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span>{format.label}</span>
                  <Badge variant="secondary" className="text-xs bg-muted/30">
                    {format.aspect}
                  </Badge>
                  {isSelected && <Check className="h-3 w-3 ml-1" />}
                </Button>
              );
            })}
          </div>
          
          {selectedFormats.length > 1 && (
            <p className="text-sm text-muted-foreground mt-3">
              ✨ {selectedFormats.length} Formate werden parallel gerendert
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="border-white/20">
          Zurück
        </Button>
        
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-muted/30 px-3 py-1.5">
            {selectedFormats.length} Format{selectedFormats.length > 1 ? 'e' : ''}
          </Badge>
          
          <Button
            variant="default"
            onClick={() => onConfirm(selectedFormats)}
            disabled={isExporting}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-6"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exportiere...
              </>
            ) : (
              <>
                Bestätigen & Exportieren
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
