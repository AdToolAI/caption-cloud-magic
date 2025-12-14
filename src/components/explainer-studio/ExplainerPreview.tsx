import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Player } from '@remotion/player';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RefreshCw, Check, AlertCircle, Loader2, Download, ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExplainerVideo } from '@/remotion/templates/ExplainerVideo';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExplainerPreviewProps {
  project: any;
  consultationResult: any;
  onConfirm: () => void;
  onRegenerateScene: (sceneId: string) => Promise<void>;
  onBack: () => void;
}

export function ExplainerPreview({
  project,
  consultationResult,
  onConfirm,
  onRegenerateScene,
  onBack,
}: ExplainerPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Calculate total duration from scenes
  const totalDuration = useMemo(() => {
    if (!project?.script?.scenes) return 60;
    return project.script.scenes.reduce((sum: number, scene: any) => sum + (scene.durationSeconds || 5), 0);
  }, [project?.script?.scenes]);

  const fps = 30;
  const durationInFrames = Math.ceil(totalDuration * fps);

  // Prepare scenes with assets for Remotion - with timing fallback
  const enhancedScenes = useMemo(() => {
    if (!project?.script?.scenes) return [];
    
    let currentTime = 0;
    return project.script.scenes.map((scene: any, index: number) => {
      const asset = project.assets?.find((a: any) => a.sceneId === scene.id);
      
      // ✅ Calculate timing with fallback if not present
      const durationSeconds = scene.durationSeconds || scene.duration || 5;
      const startTime = scene.startTime ?? currentTime;
      const endTime = scene.endTime ?? (startTime + durationSeconds);
      currentTime = endTime;
      
      // Animation variations
      const animation = index % 3 === 0 ? 'kenBurns' : index % 3 === 1 ? 'parallax' : 'zoomIn';
      const kenBurnsDirections = ['in', 'out', 'left', 'right', 'up', 'down'] as const;
      const kenBurnsDirection = kenBurnsDirections[index % kenBurnsDirections.length];
      const textAnimations = ['fadeWords', 'splitReveal', 'glowPulse', 'highlight'] as const;
      const textAnimation = textAnimations[index % textAnimations.length];
      
      return {
        ...scene,
        id: scene.id || `scene${index + 1}`,
        type: scene.type || ['hook', 'problem', 'solution', 'feature', 'cta'][index] || 'hook',
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

  // Generate subtitles from script
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
              component={ExplainerVideo}
              inputProps={{
                ...inputProps,
                masterVolume: isMuted ? 0 : volume,
              }}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%', height: '100%' }}
              controls
              autoPlay={false}
              numberOfSharedAudioTags={5}
              initiallyMuted={false}
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
                    ? 'border-primary shadow-[0_0_20px_rgba(245,199,106,0.3)]' 
                    : 'border-white/10 hover:border-primary/50'
                )}
                onClick={() => setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)}
              >
                {/* Scene Thumbnail */}
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
                  
                  {/* Overlay */}
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

                  {/* Scene Number Badge */}
                  <div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5 text-xs font-medium">
                    {index + 1}
                  </div>

                  {/* Duration Badge */}
                  <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5 text-xs">
                    {scene.durationSeconds}s
                  </div>
                </div>

                {/* Scene Title */}
                <div className="p-2 bg-muted/20">
                  <p className="text-xs font-medium truncate">{scene.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{scene.type}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="border-white/20">
          Zurück
        </Button>
        
        <div className="flex items-center gap-3">
          <Button
            variant="default"
            onClick={onConfirm}
            className="bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-primary-foreground px-6"
          >
            Bestätigen & Exportieren
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}