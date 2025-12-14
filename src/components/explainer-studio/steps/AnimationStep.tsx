import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight,
  Settings,
  Eye,
  Sparkles,
  Loader2,
  RotateCcw,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { 
  ExplainerScript, 
  ExplainerBriefing, 
  GeneratedAsset, 
  ScriptScene 
} from '@/types/explainer-studio';

interface AnimationStepProps {
  briefing: ExplainerBriefing;
  script: ExplainerScript;
  assets: GeneratedAsset[];
  onComplete: (animationConfig: AnimationConfig) => void;
  onBack: () => void;
}

export interface AnimationConfig {
  sceneAnimations: Record<string, SceneAnimationSettings>;
  globalSettings: GlobalAnimationSettings;
  transitions: TransitionSettings;
}

interface SceneAnimationSettings {
  sceneId: string;
  entryAnimation: 'fadeIn' | 'slideUp' | 'slideLeft' | 'zoomIn' | 'bounce' | 'none';
  textAnimation: 'typewriter' | 'fadeWords' | 'highlight' | 'none';
  backgroundMotion: 'static' | 'zoomSlow' | 'panLeft' | 'panRight';
  duration: number;
}

interface GlobalAnimationSettings {
  showSceneTitles: boolean;
  showProgressBar: boolean;
  transitionDuration: number;
  textDisplayDuration: number;
}

interface TransitionSettings {
  type: 'fade' | 'crossfade' | 'slide' | 'wipe' | 'none';
  duration: number;
}

const ANIMATION_PRESETS = {
  fadeIn: { label: 'Einblenden', icon: '✨' },
  slideUp: { label: 'Von unten', icon: '⬆️' },
  slideLeft: { label: 'Von rechts', icon: '➡️' },
  zoomIn: { label: 'Zoom', icon: '🔍' },
  bounce: { label: 'Bounce', icon: '🎾' },
  none: { label: 'Keine', icon: '—' },
};

const TEXT_ANIMATIONS = {
  typewriter: { label: 'Schreibmaschine', icon: '⌨️' },
  fadeWords: { label: 'Wort für Wort', icon: '💬' },
  highlight: { label: 'Highlight', icon: '🌟' },
  none: { label: 'Keine', icon: '—' },
};

const MOTION_PRESETS = {
  static: { label: 'Statisch', icon: '🖼️' },
  zoomSlow: { label: 'Langsamer Zoom', icon: '🔎' },
  panLeft: { label: 'Pan Links', icon: '⬅️' },
  panRight: { label: 'Pan Rechts', icon: '➡️' },
};

export function AnimationStep({ 
  briefing, 
  script, 
  assets, 
  onComplete, 
  onBack 
}: AnimationStepProps) {
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showPreview, setShowPreview] = useState(true);

  // Initialize animation config for all scenes
  const [sceneAnimations, setSceneAnimations] = useState<Record<string, SceneAnimationSettings>>(() => {
    const initial: Record<string, SceneAnimationSettings> = {};
    script.scenes.forEach(scene => {
      // Assign default animations based on scene type
      const defaultAnimations: Record<string, { entry: string; text: string; motion: string }> = {
        hook: { entry: 'zoomIn', text: 'typewriter', motion: 'zoomSlow' },
        problem: { entry: 'slideUp', text: 'fadeWords', motion: 'static' },
        solution: { entry: 'fadeIn', text: 'highlight', motion: 'panRight' },
        feature: { entry: 'slideLeft', text: 'fadeWords', motion: 'panLeft' },
        proof: { entry: 'bounce', text: 'none', motion: 'zoomSlow' },
        cta: { entry: 'zoomIn', text: 'typewriter', motion: 'zoomSlow' },
      };
      
      const defaults = defaultAnimations[scene.type] || { entry: 'fadeIn', text: 'none', motion: 'static' };
      
      initial[scene.id] = {
        sceneId: scene.id,
        entryAnimation: defaults.entry as any,
        textAnimation: defaults.text as any,
        backgroundMotion: defaults.motion as any,
        duration: scene.durationSeconds,
      };
    });
    return initial;
  });

  const [globalSettings, setGlobalSettings] = useState<GlobalAnimationSettings>({
    showSceneTitles: true,
    showProgressBar: true,
    transitionDuration: 0.5,
    textDisplayDuration: 3,
  });

  const [transitions, setTransitions] = useState<TransitionSettings>({
    type: 'fade',
    duration: 0.5,
  });

  const selectedScene = script.scenes[selectedSceneIndex];
  const selectedAsset = assets.find(a => a.sceneId === selectedScene?.id);
  const selectedAnimation = sceneAnimations[selectedScene?.id || ''];

  // Simple preview animation simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          const maxTime = script.totalDuration;
          if (prev >= maxTime) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, script.totalDuration]);

  // Update selected scene based on current time
  useEffect(() => {
    if (!isPlaying) return;
    
    let accumulatedTime = 0;
    for (let i = 0; i < script.scenes.length; i++) {
      accumulatedTime += script.scenes[i].durationSeconds;
      if (currentTime < accumulatedTime) {
        setSelectedSceneIndex(i);
        break;
      }
    }
  }, [currentTime, isPlaying, script.scenes]);

  const updateSceneAnimation = useCallback((
    sceneId: string, 
    field: keyof SceneAnimationSettings, 
    value: any
  ) => {
    setSceneAnimations(prev => ({
      ...prev,
      [sceneId]: { ...prev[sceneId], [field]: value }
    }));
  }, []);

  const applyPresetToAll = useCallback((preset: 'dynamic' | 'minimal' | 'professional') => {
    const presets = {
      dynamic: { entry: 'bounce', text: 'typewriter', motion: 'zoomSlow' },
      minimal: { entry: 'fadeIn', text: 'none', motion: 'static' },
      professional: { entry: 'slideUp', text: 'fadeWords', motion: 'panRight' },
    };
    
    const p = presets[preset];
    
    setSceneAnimations(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        updated[id] = {
          ...updated[id],
          entryAnimation: p.entry as any,
          textAnimation: p.text as any,
          backgroundMotion: p.motion as any,
        };
      });
      return updated;
    });
  }, []);

  const handleContinue = () => {
    onComplete({
      sceneAnimations,
      globalSettings,
      transitions,
    });
  };

  const getSceneTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      hook: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      problem: 'bg-red-500/20 text-red-400 border-red-500/30',
      solution: 'bg-green-500/20 text-green-400 border-green-500/30',
      feature: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      proof: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cta: 'bg-primary/20 text-primary border-primary/30',
    };
    return colors[type] || 'bg-muted/20 text-muted-foreground border-border';
  };

  return (
    <div className="space-y-6">
      {/* Header with Presets */}
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Animation & Bewegung</h2>
              <p className="text-sm text-muted-foreground">
                Definiere Übergänge und Animationen für jede Szene
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPresetToAll('minimal')}
              >
                Minimal
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyPresetToAll('professional')}
              >
                Professionell
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-primary to-purple-500"
                onClick={() => applyPresetToAll('dynamic')}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Dynamisch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scene Timeline */}
        <Card className="bg-card/60 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Play className="h-4 w-4" />
              Szenen-Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {script.scenes.map((scene, index) => {
              const animation = sceneAnimations[scene.id];
              const isSelected = index === selectedSceneIndex;
              
              return (
                <motion.button
                  key={scene.id}
                  onClick={() => setSelectedSceneIndex(index)}
                  className={cn(
                    'w-full p-3 rounded-lg text-left transition-all',
                    'border backdrop-blur-sm',
                    isSelected 
                      ? 'bg-primary/20 border-primary/50 shadow-[0_0_15px_rgba(245,199,106,0.2)]'
                      : 'bg-muted/10 border-white/10 hover:bg-muted/20'
                  )}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={cn('text-xs', getSceneTypeColor(scene.type))}>
                      {scene.type.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {scene.durationSeconds}s
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate mb-1">{scene.title}</p>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {ANIMATION_PRESETS[animation?.entryAnimation || 'fadeIn'].icon}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {TEXT_ANIMATIONS[animation?.textAnimation || 'none'].icon}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {MOTION_PRESETS[animation?.backgroundMotion || 'static'].icon}
                    </Badge>
                  </div>
                </motion.button>
              );
            })}
          </CardContent>
        </Card>

        {/* Preview & Controls */}
        <Card className="lg:col-span-2 bg-card/60 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Szene {selectedSceneIndex + 1}: {selectedScene?.title}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <Eye className={cn('h-4 w-4', showPreview && 'text-primary')} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview Area */}
            {showPreview && (
              <div className="aspect-video bg-black rounded-xl border border-white/10 overflow-hidden relative">
                <AnimatePresence mode="wait">
                  {selectedAsset?.imageUrl ? (
                    <motion.div
                      key={selectedAsset.imageUrl}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ 
                        opacity: 1, 
                        scale: selectedAnimation?.backgroundMotion === 'zoomSlow' ? [1, 1.05] : 1,
                      }}
                      transition={{ 
                        duration: 0.3,
                        scale: { duration: selectedScene?.durationSeconds || 5, repeat: 0 }
                      }}
                      className="absolute inset-0"
                    >
                      <img
                        src={selectedAsset.imageUrl}
                        alt={selectedScene?.title}
                        className="w-full h-full object-cover"
                      />
                    </motion.div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-muted-foreground">Kein Visual verfügbar</p>
                    </div>
                  )}
                </AnimatePresence>
                
                {/* Scene title overlay */}
                {globalSettings.showSceneTitles && selectedScene && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-6 left-6 right-6"
                  >
                    <Badge className={cn('mb-2', getSceneTypeColor(selectedScene.type))}>
                      {selectedScene.type.toUpperCase()}
                    </Badge>
                    <h3 className="text-xl font-bold text-white drop-shadow-lg">
                      {selectedScene.title}
                    </h3>
                  </motion.div>
                )}
                
                {/* Progress bar */}
                {globalSettings.showProgressBar && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ 
                        width: `${(currentTime / script.totalDuration) * 100}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4 py-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setCurrentTime(0);
                  setSelectedSceneIndex(0);
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedSceneIndex(Math.max(0, selectedSceneIndex - 1))}
                disabled={selectedSceneIndex === 0}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                onClick={() => setIsPlaying(!isPlaying)}
                className="h-12 w-12 rounded-full bg-primary hover:bg-primary/90"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedSceneIndex(Math.min(script.scenes.length - 1, selectedSceneIndex + 1))}
                disabled={selectedSceneIndex === script.scenes.length - 1}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Animation Controls Tabs */}
            <Tabs defaultValue="scene" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="scene">Szene</TabsTrigger>
                <TabsTrigger value="transition">Übergang</TabsTrigger>
                <TabsTrigger value="global">Global</TabsTrigger>
              </TabsList>

              <TabsContent value="scene" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Entry Animation */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Eingangsanimation</Label>
                    <Select
                      value={selectedAnimation?.entryAnimation || 'fadeIn'}
                      onValueChange={(v) => updateSceneAnimation(selectedScene?.id || '', 'entryAnimation', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ANIMATION_PRESETS).map(([key, { label, icon }]) => (
                          <SelectItem key={key} value={key}>
                            {icon} {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Text Animation */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Text-Animation</Label>
                    <Select
                      value={selectedAnimation?.textAnimation || 'none'}
                      onValueChange={(v) => updateSceneAnimation(selectedScene?.id || '', 'textAnimation', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TEXT_ANIMATIONS).map(([key, { label, icon }]) => (
                          <SelectItem key={key} value={key}>
                            {icon} {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Background Motion */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Hintergrund-Bewegung</Label>
                    <Select
                      value={selectedAnimation?.backgroundMotion || 'static'}
                      onValueChange={(v) => updateSceneAnimation(selectedScene?.id || '', 'backgroundMotion', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MOTION_PRESETS).map(([key, { label, icon }]) => (
                          <SelectItem key={key} value={key}>
                            {icon} {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="transition" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Übergangstyp</Label>
                    <Select
                      value={transitions.type}
                      onValueChange={(v) => setTransitions(prev => ({ ...prev, type: v as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Übergang</SelectItem>
                        <SelectItem value="fade">Überblenden</SelectItem>
                        <SelectItem value="crossfade">Kreuzblende</SelectItem>
                        <SelectItem value="slide">Schieben</SelectItem>
                        <SelectItem value="wipe">Wischen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Dauer: {transitions.duration}s
                    </Label>
                    <Slider
                      value={[transitions.duration]}
                      min={0.2}
                      max={1.5}
                      step={0.1}
                      onValueChange={([v]) => setTransitions(prev => ({ ...prev, duration: v }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="global" className="space-y-4 pt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Szenen-Titel anzeigen</Label>
                    <Switch
                      checked={globalSettings.showSceneTitles}
                      onCheckedChange={(v) => setGlobalSettings(prev => ({ ...prev, showSceneTitles: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Fortschrittsbalken anzeigen</Label>
                    <Switch
                      checked={globalSettings.showProgressBar}
                      onCheckedChange={(v) => setGlobalSettings(prev => ({ ...prev, showProgressBar: v }))}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Zurück zu Visuals
        </Button>
        <Button 
          onClick={handleContinue}
          className="bg-gradient-to-r from-primary to-purple-500"
        >
          Weiter zu Audio
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
