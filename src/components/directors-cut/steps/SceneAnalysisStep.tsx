import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Sparkles, 
  Play, 
  Clock, 
  Lightbulb, 
  ChevronDown, 
  ChevronUp,
  Wand2,
  Loader2,
  Check,
  X
} from 'lucide-react';
import type { SceneAnalysisStepProps, SceneAnalysis, GlobalEffects, SceneEffects } from '@/types/directors-cut';
import { FILTER_EFFECT_MAPPING, AVAILABLE_FILTERS } from '@/types/directors-cut';
import { AIAutoCut } from '../features/AIAutoCut';
import { AITransitions } from '../features/AITransitions';
import { toast } from 'sonner';

interface TransitionAssignment {
  sceneId: string;
  transitionType: string;
  duration: number;
  aiSuggested: boolean;
}

interface SceneAnalysisStepPropsExtended extends SceneAnalysisStepProps {
  sceneEffects?: Record<string, SceneEffects>;
}

export function SceneAnalysisStep({
  videoUrl,
  videoDuration,
  scenes,
  onScenesUpdate,
  isAnalyzing,
  onStartAnalysis,
  onApplySuggestions,
  appliedEffects,
  sceneEffects = {},
}: SceneAnalysisStepPropsExtended) {
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [autoCuts, setAutoCuts] = useState<any[]>([]);
  const [transitions, setTransitions] = useState<TransitionAssignment[]>([]);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simulate analysis progress
  if (isAnalyzing && analysisProgress < 95) {
    setTimeout(() => setAnalysisProgress(prev => Math.min(prev + Math.random() * 15, 95)), 500);
  } else if (!isAnalyzing && analysisProgress > 0 && analysisProgress < 100) {
    setAnalysisProgress(100);
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMoodColor = (mood: string) => {
    switch (mood) {
      case 'dynamic': return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
      case 'calm': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
      case 'energetic': return 'bg-red-500/20 text-red-700 dark:text-red-400';
      case 'emotional': return 'bg-purple-500/20 text-purple-700 dark:text-purple-400';
      default: return 'bg-gray-500/20 text-gray-700 dark:text-gray-400';
    }
  };

  const toggleSceneExpand = (sceneId: string) => {
    setExpandedScene(expandedScene === sceneId ? null : sceneId);
  };

  // Find current scene based on video time
  const getCurrentScene = (time: number): SceneAnalysis | undefined => {
    return scenes.find(scene => time >= scene.start_time && time < scene.end_time);
  };

  // Get effects for current time (scene-specific or global)
  const getCurrentEffects = (time: number): Partial<GlobalEffects> => {
    const currentScene = getCurrentScene(time);
    if (currentScene && sceneEffects[currentScene.id]) {
      // Merge scene-specific effects with global as fallback
      return {
        brightness: sceneEffects[currentScene.id].brightness ?? appliedEffects?.brightness ?? 100,
        contrast: sceneEffects[currentScene.id].contrast ?? appliedEffects?.contrast ?? 100,
        saturation: sceneEffects[currentScene.id].saturation ?? appliedEffects?.saturation ?? 100,
        filter: sceneEffects[currentScene.id].filter ?? appliedEffects?.filter,
        vignette: appliedEffects?.vignette ?? 0,
        temperature: appliedEffects?.temperature ?? 0,
      };
    }
    return appliedEffects || {};
  };

  // Build CSS filter string for current time
  const buildVideoFilter = () => {
    const effects = getCurrentEffects(currentVideoTime);
    
    if (!effects || Object.keys(effects).length === 0) {
      return 'none';
    }
    
    // Find the preset filter CSS from AVAILABLE_FILTERS
    const presetFilter = AVAILABLE_FILTERS.find(f => f.id === effects.filter);
    const presetCSS = presetFilter?.preview || '';
    
    // Build base effects
    const baseEffects = `brightness(${(effects.brightness || 100) / 100}) contrast(${(effects.contrast || 100) / 100}) saturate(${(effects.saturation || 100) / 100})`;
    
    // Temperature effect
    let tempEffect = '';
    if (effects.temperature && effects.temperature !== 0) {
      if (effects.temperature > 0) {
        tempEffect = ` sepia(${effects.temperature / 100})`;
      } else {
        tempEffect = ` hue-rotate(${effects.temperature * 2}deg)`;
      }
    }
    
    return `${baseEffects} ${presetCSS}${tempEffect}`.trim() || 'none';
  };

  // Handle video time update
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentVideoTime(videoRef.current.currentTime);
    }
  };

  // Helper to extract number from string
  const extractNumber = (text: string, defaultValue: number): number => {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : defaultValue;
  };

  // Parse effect name to extract filter/effect type
  const parseEffectName = (name: string, effectType?: string): Partial<SceneEffects> => {
    const lowerName = name.toLowerCase();
    const effects: Partial<SceneEffects> = {};
    
    // SKIP transitions - they don't apply visual filters
    if (effectType === 'transition' || 
        lowerName.includes('fade') || 
        lowerName.includes('slide') || 
        lowerName.includes('wipe') ||
        lowerName.includes('crossfade')) {
      return {};
    }
    
    // Match AVAILABLE_FILTERS by id or name
    for (const filter of AVAILABLE_FILTERS) {
      if (filter.id === 'none') continue;
      if (lowerName.includes(filter.id) || lowerName.includes(filter.name.toLowerCase())) {
        effects.filter = filter.id;
        const mapping = FILTER_EFFECT_MAPPING[filter.id];
        if (mapping) {
          effects.brightness = mapping.brightness;
          effects.contrast = mapping.contrast;
          effects.saturation = mapping.saturation;
        }
        return effects;
      }
    }
    
    // Parse brightness
    if (lowerName.includes('bright') || lowerName.includes('hell')) {
      effects.brightness = extractNumber(lowerName, 115);
      return effects;
    }
    
    // Parse saturation
    if (lowerName.includes('saturat') || lowerName.includes('sättig')) {
      effects.saturation = extractNumber(lowerName, 125);
      return effects;
    }
    
    // Parse contrast
    if (lowerName.includes('contrast') || lowerName.includes('kontrast')) {
      effects.contrast = extractNumber(lowerName, 115);
      return effects;
    }
    
    // Parse warm/cool
    if (lowerName.includes('warm')) {
      effects.saturation = 115;
      effects.brightness = 102;
      return effects;
    }
    if (lowerName.includes('cool') || lowerName.includes('kalt')) {
      effects.saturation = 95;
      return effects;
    }
    
    // Fallback enhancement
    return { contrast: 108, saturation: 108 };
  };

  // Apply all suggestions - scene by scene
  const applyAllSuggestions = () => {
    if (!onApplySuggestions) {
      toast.error('Vorschläge können nicht angewendet werden');
      return;
    }

    const newSceneEffects: Record<string, SceneEffects> = {};
    let scenesWithEffects = 0;
    
    for (const scene of scenes) {
      const sceneEffect: SceneEffects = {};
      
      for (const effect of scene.suggested_effects) {
        const parsed = parseEffectName(effect.name, effect.type);
        if (Object.keys(parsed).length > 0) {
          Object.assign(sceneEffect, parsed);
        }
      }
      
      // Ensure at least subtle enhancement per scene
      if (Object.keys(sceneEffect).length === 0) {
        sceneEffect.contrast = 108;
        sceneEffect.saturation = 108;
      }
      
      newSceneEffects[scene.id] = sceneEffect;
      scenesWithEffects++;
    }
    
    // Pass empty global effects, but scene-specific effects
    onApplySuggestions({}, newSceneEffects);
    toast.success(`Effekte für ${scenesWithEffects} Szenen angewendet`);
  };

  // Apply suggestions for single scene
  const applySingleSceneSuggestion = (scene: SceneAnalysis) => {
    if (!onApplySuggestions) return;
    
    if (scene.suggested_effects.length === 0) {
      toast.info('Keine Vorschläge für diese Szene');
      return;
    }
    
    const sceneEffect: SceneEffects = {};
    
    for (const effect of scene.suggested_effects) {
      const parsed = parseEffectName(effect.name, effect.type);
      Object.assign(sceneEffect, parsed);
    }
    
    // Ensure visible effect
    if (Object.keys(sceneEffect).length === 0) {
      sceneEffect.contrast = 110;
      sceneEffect.saturation = 112;
    }
    
    // Pass only this scene's effects
    onApplySuggestions({}, { [scene.id]: sceneEffect });
    toast.success(`Effekte für Szene ${scene.id} angewendet (${formatTime(scene.start_time)} - ${formatTime(scene.end_time)})`);
  };

  // Clear effects for a scene
  const clearSceneEffects = (sceneId: string) => {
    if (!onApplySuggestions) return;
    
    // Pass empty effects for this scene to clear it
    onApplySuggestions({}, { [sceneId]: {} });
    toast.info('Szeneneffekte zurückgesetzt');
  };

  // Check if scene has effects applied
  const hasSceneEffects = (sceneId: string): boolean => {
    const effects = sceneEffects[sceneId];
    return effects && Object.keys(effects).length > 0;
  };

  return (
    <div className="space-y-6">
      {/* Video Preview with Timeline */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full h-full"
          style={{ filter: buildVideoFilter() }}
          onTimeUpdate={handleVideoTimeUpdate}
        />
        
        {/* Vignette Overlay */}
        {appliedEffects && appliedEffects.vignette > 0 && (
          <div 
            className="absolute inset-0 pointer-events-none rounded-lg"
            style={{
              boxShadow: `inset 0 0 ${appliedEffects.vignette * 3}px ${appliedEffects.vignette * 1.5}px rgba(0,0,0,0.6)`,
            }}
          />
        )}

        {/* Current Scene Indicator */}
        {scenes.length > 0 && (
          <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded px-2 py-1">
            <span className="text-xs text-white">
              {(() => {
                const currentScene = getCurrentScene(currentVideoTime);
                if (currentScene) {
                  const index = scenes.findIndex(s => s.id === currentScene.id);
                  return `Szene ${index + 1}: ${currentScene.description}`;
                }
                return 'Keine Szene';
              })()}
            </span>
            {(() => {
              const currentScene = getCurrentScene(currentVideoTime);
              if (currentScene && hasSceneEffects(currentScene.id)) {
                return (
                  <Badge variant="secondary" className="ml-2 text-xs bg-primary/20 text-primary">
                    <Check className="w-3 h-3 mr-1" />
                    Effekte aktiv
                  </Badge>
                );
              }
              return null;
            })()}
          </div>
        )}
        
        {/* Scene Timeline Overlay */}
        {scenes.length > 0 && (
          <div className="absolute bottom-12 left-0 right-0 px-4">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg p-2">
              <div className="flex h-8 gap-0.5">
                {scenes.map((scene, index) => {
                  const width = ((scene.end_time - scene.start_time) / videoDuration) * 100;
                  const isActive = currentVideoTime >= scene.start_time && currentVideoTime < scene.end_time;
                  const hasEffects = hasSceneEffects(scene.id);
                  const colors = [
                    'bg-primary',
                    'bg-blue-500',
                    'bg-green-500',
                    'bg-yellow-500',
                    'bg-purple-500',
                    'bg-pink-500',
                  ];
                  return (
                    <div
                      key={scene.id}
                      className={`${colors[index % colors.length]} rounded cursor-pointer 
                        transition-all relative group ${isActive ? 'ring-2 ring-white scale-y-110' : 'hover:opacity-80'}`}
                      style={{ width: `${width}%` }}
                      title={`Szene ${index + 1}: ${scene.description}`}
                    >
                      {/* Effects indicator */}
                      {hasEffects && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white" />
                      )}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 
                        bg-black/80 text-white text-xs px-2 py-1 rounded 
                        opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {formatTime(scene.start_time)} - {formatTime(scene.end_time)}
                        {hasEffects && ' ✓'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Section */}
      {scenes.length === 0 ? (
        <Card className="p-8 text-center">
          {isAnalyzing ? (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
              <h3 className="text-lg font-semibold">KI analysiert dein Video...</h3>
              <p className="text-muted-foreground">
                Die KI erkennt Szenen und erstellt Verbesserungsvorschläge
              </p>
              <Progress value={analysisProgress} className="w-full max-w-md mx-auto" />
              <p className="text-sm text-muted-foreground">{Math.round(analysisProgress)}% abgeschlossen</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Sparkles className="w-12 h-12 text-primary mx-auto" />
              <h3 className="text-lg font-semibold">KI-Szenenanalyse starten</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Unsere KI analysiert dein Video, erkennt automatisch Szenen und 
                gibt dir personalisierte Verbesserungsvorschläge für jeden Abschnitt.
              </p>
              <Button onClick={onStartAnalysis} size="lg" className="mt-4">
                <Wand2 className="w-4 h-4 mr-2" />
                Analyse starten
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          {/* Analysis Summary */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                {scenes.length} Szenen erkannt
              </h3>
              <p className="text-sm text-muted-foreground">
                Klicke auf eine Szene für Details und Vorschläge
              </p>
            </div>
            <Button variant="outline" onClick={applyAllSuggestions}>
              <Wand2 className="w-4 h-4 mr-2" />
              Alle Vorschläge anwenden
            </Button>
          </div>

          {/* Scene List */}
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {scenes.map((scene, index) => {
                const isExpanded = expandedScene === scene.id;
                const hasEffects = hasSceneEffects(scene.id);
                return (
                  <Card
                    key={scene.id}
                    className={`p-4 transition-all cursor-pointer ${
                      isExpanded ? 'ring-2 ring-primary' : 'hover:bg-accent/50'
                    } ${hasEffects ? 'border-l-4 border-l-green-500' : ''}`}
                    onClick={() => toggleSceneExpand(scene.id)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Scene Number */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        hasEffects ? 'bg-green-500/20' : 'bg-primary/10'
                      }`}>
                        {hasEffects ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <span className="font-bold text-primary">{index + 1}</span>
                        )}
                      </div>

                      {/* Scene Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{scene.description}</h4>
                          <Badge variant="secondary" className={getMoodColor(scene.mood)}>
                            {scene.mood}
                          </Badge>
                          {hasEffects && (
                            <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400">
                              Effekte aktiv
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(scene.start_time)} - {formatTime(scene.end_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Lightbulb className="w-3 h-3" />
                            {scene.suggested_effects.length} Vorschläge
                          </span>
                        </div>
                      </div>

                      {/* Expand Icon */}
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                        {/* AI Suggestions */}
                        <div>
                          <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            KI-Empfehlungen
                          </h5>
                          <ul className="space-y-2">
                            {scene.ai_suggestions.map((suggestion, i) => (
                              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Suggested Effects */}
                        <div>
                          <h5 className="text-sm font-medium mb-2">Vorgeschlagene Effekte</h5>
                          <div className="flex flex-wrap gap-2">
                            {scene.suggested_effects.map((effect, i) => (
                              <Button
                                key={i}
                                variant="outline"
                                size="sm"
                                className="h-auto py-1.5"
                              >
                                <span className="capitalize">{effect.name}</span>
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {Math.round(effect.confidence * 100)}%
                                </Badge>
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Scene Actions */}
                        <div className="flex gap-2">
                          <Button variant="default" size="sm">
                            <Play className="w-3 h-3 mr-1" />
                            Szene abspielen
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => applySingleSceneSuggestion(scene)}
                            disabled={!onApplySuggestions || scene.suggested_effects.length === 0}
                          >
                            <Wand2 className="w-3 h-3 mr-1" />
                            Vorschläge anwenden
                          </Button>
                          {hasSceneEffects(scene.id) && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => clearSceneEffects(scene.id)}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Zurücksetzen
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>

          {/* Phase 4: AI Editing Tools */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t">
            <AIAutoCut
              videoUrl={videoUrl}
              videoDuration={videoDuration}
              onCutsGenerated={setAutoCuts}
            />
            <AITransitions
              sceneCount={scenes.length}
              transitions={transitions}
              onTransitionsChange={setTransitions}
            />
          </div>
        </>
      )}
    </div>
  );
}
