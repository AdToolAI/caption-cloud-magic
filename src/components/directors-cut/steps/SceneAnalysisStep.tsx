import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import type { SceneAnalysisStepProps, SceneAnalysis, GlobalEffects, SceneEffects, TransitionAssignment } from '@/types/directors-cut';
import { FILTER_EFFECT_MAPPING, AVAILABLE_FILTERS } from '@/types/directors-cut';
import { AIAutoCut } from '../features/AIAutoCut';
import { AITransitions, TRANSITION_TYPES } from '../features/AITransitions';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';

// Extract video frames for Vision AI analysis
const extractVideoFrames = async (videoUrl: string, duration: number): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    
    video.onerror = () => reject(new Error('Video konnte nicht geladen werden'));
    
    video.onloadedmetadata = async () => {
      const frames: string[] = [];
      const frameCount = Math.min(10, Math.max(4, Math.ceil(duration / 3))); // 1 Frame alle ~3 Sekunden
      
      console.log(`[extractVideoFrames] Extracting ${frameCount} frames from ${duration}s video`);
      
      const canvas = document.createElement('canvas');
      canvas.width = 512; // Reduced for API efficiency
      canvas.height = 288;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context nicht verfügbar'));
        return;
      }
      
      for (let i = 0; i < frameCount; i++) {
        const time = (i / frameCount) * duration;
        video.currentTime = time;
        
        await new Promise<void>((seekResolve) => {
          video.onseeked = () => seekResolve();
        });
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg', 0.6);
        frames.push(frameData);
        console.log(`[extractVideoFrames] Frame ${i + 1}/${frameCount} at ${time.toFixed(1)}s`);
      }
      
      resolve(frames);
    };
    
    video.src = videoUrl;
  });
};

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
  transitions: externalTransitions = [],
  onTransitionsChange,
}: SceneAnalysisStepPropsExtended) {
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [autoCuts, setAutoCuts] = useState<any[]>([]);
  const [transitions, setTransitionsInternal] = useState<TransitionAssignment[]>(externalTransitions);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Scene-specific transitions state
  const [sceneTransitions, setSceneTransitions] = useState<Record<string, {
    type: string;
    duration: number;
  }>>({});

  // Sync internal transitions with external when changed from outside
  useEffect(() => {
    if (externalTransitions.length > 0) {
      setTransitionsInternal(externalTransitions);
    }
  }, [externalTransitions]);

  // Notify parent when transitions change
  const setTransitions = (updater: TransitionAssignment[] | ((prev: TransitionAssignment[]) => TransitionAssignment[])) => {
    setTransitionsInternal(prev => {
      const newTransitions = typeof updater === 'function' ? updater(prev) : updater;
      // Notify parent about transitions change
      if (onTransitionsChange) {
        onTransitionsChange(newTransitions);
      }
      return newTransitions;
    });
  };

  // Synchronize AI-generated transitions to sceneTransitions for UI display
  useEffect(() => {
    if (transitions.length > 0) {
      const syncedTransitions: Record<string, { type: string; duration: number }> = {};
      
      transitions.forEach(transition => {
        syncedTransitions[transition.sceneId] = {
          type: transition.transitionType,
          duration: transition.duration
        };
      });
      
      setSceneTransitions(prev => ({
        ...prev,
        ...syncedTransitions
      }));
      
      console.log('[Sync] AI-Transitions synchronized to sceneTransitions:', syncedTransitions);
    }
  }, [transitions]);

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

  // Find current scene based on video time - memoized with useCallback
  const getCurrentScene = useCallback((time: number): SceneAnalysis | undefined => {
    return scenes.find(scene => time >= scene.start_time && time < scene.end_time);
  }, [scenes]);

  // Get effects for current time (scene-specific or global) - FIXED: useCallback with correct dependencies
  const getCurrentEffects = useCallback((time: number): Partial<GlobalEffects> => {
    const currentScene = getCurrentScene(time);
    
    console.log(`[getCurrentEffects] time=${time.toFixed(2)}, scene=${currentScene?.id || 'none'}, sceneEffects keys:`, Object.keys(sceneEffects));
    
    if (currentScene && sceneEffects[currentScene.id]) {
      const sceneEffect = sceneEffects[currentScene.id];
      console.log(`[getCurrentEffects] Found effects for ${currentScene.id}:`, sceneEffect);
      
      // Merge scene-specific effects with global as fallback
      return {
        brightness: sceneEffect.brightness ?? appliedEffects?.brightness ?? 100,
        contrast: sceneEffect.contrast ?? appliedEffects?.contrast ?? 100,
        saturation: sceneEffect.saturation ?? appliedEffects?.saturation ?? 100,
        filter: sceneEffect.filter ?? appliedEffects?.filter,
        vignette: appliedEffects?.vignette ?? 0,
        temperature: appliedEffects?.temperature ?? 0,
      };
    }
    
    console.log(`[getCurrentEffects] No scene effects found, using global:`, appliedEffects);
    return appliedEffects || {};
  }, [getCurrentScene, sceneEffects, appliedEffects]);

  // Build CSS filter string - FIXED: useMemo with correct dependencies
  const videoFilter = useMemo(() => {
    const effects = getCurrentEffects(currentVideoTime);
    
    if (!effects || Object.keys(effects).length === 0) {
      return 'none';
    }
    
    // FIXED: Only use numeric values from effects (already includes filter mapping values)
    const brightness = (effects.brightness || 100) / 100;
    const contrast = (effects.contrast || 100) / 100;
    const saturation = (effects.saturation || 100) / 100;
    
    let filterString = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
    
    // Temperature effect
    if (effects.temperature && effects.temperature !== 0) {
      if (effects.temperature > 0) {
        filterString += ` sepia(${effects.temperature / 100})`;
      } else {
        filterString += ` hue-rotate(${effects.temperature * 2}deg)`;
      }
    }
    
    console.log(`[videoFilter] Final: ${filterString}`);
    return filterString;
  }, [getCurrentEffects, currentVideoTime]);

  // FIXED: Create a stable key to force video re-render when effects change
  const videoKey = useMemo(() => {
    return JSON.stringify(sceneEffects);
  }, [sceneEffects]);

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
    
    console.log(`[parseEffectName] Input: "${name}", Type: "${effectType}"`);
    
    // SKIP transitions - they don't apply visual filters
    if (effectType === 'transition' || 
        lowerName.includes('fade') || 
        lowerName.includes('slide') || 
        lowerName.includes('wipe') ||
        lowerName.includes('crossfade')) {
      console.log(`[parseEffectName] SKIPPED (transition)`);
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
        console.log(`[parseEffectName] FILTER matched: "${filter.id}"`, effects);
        return effects;
      }
    }
    
    // Parse vignette (color effect type) - STRONGER values
    if (lowerName.includes('vignette')) {
      const strength = extractNumber(lowerName, 60);
      // Simulate vignette with stronger contrast/saturation boost
      effects.contrast = 100 + Math.round(strength);
      effects.saturation = 100 + Math.round(strength / 2);
      console.log(`[parseEffectName] VIGNETTE: strength=${strength} → contrast=${effects.contrast}, saturation=${effects.saturation}`);
      return effects;
    }
    
    // Parse brightness - STRONGER default
    if (lowerName.includes('bright') || lowerName.includes('hell')) {
      effects.brightness = extractNumber(lowerName, 140);
      console.log(`[parseEffectName] BRIGHTNESS: ${effects.brightness}`);
      return effects;
    }
    
    // Parse saturation - STRONGER default
    if (lowerName.includes('saturat') || lowerName.includes('sättig')) {
      effects.saturation = extractNumber(lowerName, 160);
      console.log(`[parseEffectName] SATURATION: ${effects.saturation}`);
      return effects;
    }
    
    // Parse contrast - STRONGER default
    if (lowerName.includes('contrast') || lowerName.includes('kontrast')) {
      effects.contrast = extractNumber(lowerName, 140);
      console.log(`[parseEffectName] CONTRAST: ${effects.contrast}`);
      return effects;
    }
    
    // Parse warm/cool - STRONGER values
    if (lowerName.includes('warm')) {
      effects.saturation = 145;
      effects.brightness = 108;
      effects.contrast = 115;
      console.log(`[parseEffectName] WARM filter applied`, effects);
      return effects;
    }
    if (lowerName.includes('cool') || lowerName.includes('kalt')) {
      effects.saturation = 75;
      effects.brightness = 96;
      effects.contrast = 120;
      console.log(`[parseEffectName] COOL filter applied`, effects);
      return effects;
    }
    
    // NO fallback - let caller decide
    console.log(`[parseEffectName] NO MATCH for "${name}"`);
    return {};
  };

  // Merge effects intelligently instead of overwriting
  const mergeEffects = (base: Partial<SceneEffects>, add: Partial<SceneEffects>): Partial<SceneEffects> => {
    const result: Partial<SceneEffects> = { ...base };
    
    // Filter: last one wins
    if (add.filter) result.filter = add.filter;
    
    // Brightness/Contrast/Saturation: additive combination (relative to 100)
    // e.g., brightness 120 + brightness 110 = 100 + (120-100) + (110-100) = 130
    if (add.brightness !== undefined) {
      const baseBr = result.brightness ?? 100;
      result.brightness = baseBr + (add.brightness - 100);
    }
    
    if (add.contrast !== undefined) {
      const baseCo = result.contrast ?? 100;
      result.contrast = baseCo + (add.contrast - 100);
    }
    
    if (add.saturation !== undefined) {
      const baseSa = result.saturation ?? 100;
      result.saturation = baseSa + (add.saturation - 100);
    }
    
    // Speed/Transitions: last one wins
    if (add.speed !== undefined) result.speed = add.speed;
    if (add.transition_in) result.transition_in = add.transition_in;
    if (add.transition_out) result.transition_out = add.transition_out;
    
    console.log(`[mergeEffects] Base:`, base, `+ Add:`, add, `= Result:`, result);
    return result;
  };

  // Apply all suggestions - scene by scene
  const applyAllSuggestions = () => {
    if (!onApplySuggestions) {
      toast.error('Vorschläge können nicht angewendet werden');
      return;
    }

    const newSceneEffects: Record<string, SceneEffects> = {};
    let appliedCount = 0;
    let skippedTransitions = 0;
    
    for (const scene of scenes) {
      let sceneEffect: Partial<SceneEffects> = {};
      
      for (const effect of scene.suggested_effects) {
        const parsed = parseEffectName(effect.name, effect.type);
        if (Object.keys(parsed).length > 0) {
          // FIXED: Use mergeEffects instead of Object.assign
          sceneEffect = mergeEffects(sceneEffect, parsed);
          appliedCount++;
        } else if (effect.type === 'transition') {
          skippedTransitions++;
        }
      }
      
      // Ensure at least subtle enhancement per scene if no effects parsed
      if (Object.keys(sceneEffect).length === 0) {
        sceneEffect.contrast = 108;
        sceneEffect.saturation = 108;
        console.log(`[applyAllSuggestions] Scene ${scene.id}: using fallback effects`);
      }
      
      newSceneEffects[scene.id] = sceneEffect as SceneEffects;
      console.log(`[applyAllSuggestions] Scene ${scene.id} final effects:`, sceneEffect);
    }
    
    console.log(`[applyAllSuggestions] Applied ${appliedCount} effects, skipped ${skippedTransitions} transitions`);
    
    // Pass empty global effects, but scene-specific effects
    onApplySuggestions({}, newSceneEffects);
    
    const transitionInfo = skippedTransitions > 0 ? ` (${skippedTransitions} Transitions übersprungen)` : '';
    toast.success(`${appliedCount} visuelle Effekte für ${scenes.length} Szenen angewendet${transitionInfo}`);
  };

  // Apply suggestions for single scene
  const applySingleSceneSuggestion = (scene: SceneAnalysis) => {
    if (!onApplySuggestions) return;
    
    if (scene.suggested_effects.length === 0) {
      toast.info('Keine Vorschläge für diese Szene');
      return;
    }
    
    let sceneEffect: Partial<SceneEffects> = {};
    let appliedCount = 0;
    let skippedTransitions = 0;
    
    for (const effect of scene.suggested_effects) {
      const parsed = parseEffectName(effect.name, effect.type);
      if (Object.keys(parsed).length > 0) {
        // FIXED: Use mergeEffects instead of Object.assign
        sceneEffect = mergeEffects(sceneEffect, parsed);
        appliedCount++;
      } else if (effect.type === 'transition') {
        skippedTransitions++;
      }
    }
    
    // Ensure visible effect if nothing was parsed
    if (Object.keys(sceneEffect).length === 0) {
      sceneEffect.contrast = 110;
      sceneEffect.saturation = 112;
      console.log(`[applySingleSceneSuggestion] Scene ${scene.id}: using fallback effects`);
    }
    
    console.log(`[applySingleSceneSuggestion] Scene ${scene.id} (${scene.start_time}s - ${scene.end_time}s) final effects:`, sceneEffect);
    
    // Pass only this scene's effects
    onApplySuggestions({}, { [scene.id]: sceneEffect as SceneEffects });
    
    // FIXED: Jump to the scene so user sees the effects immediately
    if (videoRef.current) {
      const targetTime = scene.start_time + 0.5;
      videoRef.current.currentTime = targetTime;
      setCurrentVideoTime(targetTime);
      console.log(`[applySingleSceneSuggestion] Jumped to scene ${scene.id} at ${targetTime}s`);
    }
    
    const transitionInfo = skippedTransitions > 0 ? ` (${skippedTransitions} Transition übersprungen)` : '';
    toast.success(`${appliedCount} Effekte für Szene angewendet${transitionInfo} (${formatTime(scene.start_time)} - ${formatTime(scene.end_time)})`);
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

  // Handle scene transition change
  const handleSetSceneTransition = (sceneId: string, transitionType: string) => {
    setSceneTransitions(prev => ({
      ...prev,
      [sceneId]: {
        type: transitionType,
        duration: prev[sceneId]?.duration || 0.5
      }
    }));
    
    // Sync with global transitions state
    setTransitions(prev => {
      const existingIndex = prev.findIndex(t => t.sceneId === sceneId);
      const newTransition: TransitionAssignment = {
        sceneId,
        transitionType,
        duration: sceneTransitions[sceneId]?.duration || 0.5,
        aiSuggested: false
      };
      
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newTransition;
        return updated;
      }
      return [...prev, newTransition];
    });
    
    const transitionName = TRANSITION_TYPES.find(t => t.id === transitionType)?.name || transitionType;
    toast.success(`Übergang "${transitionName}" gesetzt`);
  };

  // Handle scene transition duration change
  const handleSetSceneTransitionDuration = (sceneId: string, duration: number) => {
    setSceneTransitions(prev => ({
      ...prev,
      [sceneId]: {
        ...prev[sceneId],
        type: prev[sceneId]?.type || 'none',
        duration
      }
    }));
    
    // Also update parent transitions state
    setTransitions(prev => {
      const existingIndex = prev.findIndex(t => t.sceneId === sceneId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], duration };
        return updated;
      }
      return prev;
    });
  };

  // Get transition info helper
  const getTransitionInfo = (id: string) => TRANSITION_TYPES.find(t => t.id === id);

  return (
    <div className="space-y-6">
      {/* Video Preview with Timeline */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        {/* Filter-Container - CSS-Filter auf Container für Browser-Kompatibilität */}
        <div 
          className="w-full h-full"
          style={{ 
            filter: videoFilter,
            willChange: 'filter',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)', // Force GPU layer für Filter
          }}
        >
          <video
            key={videoKey}
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full h-full"
            onTimeUpdate={handleVideoTimeUpdate}
          />
        </div>
        
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
                          {sceneTransitions[scene.id]?.type && sceneTransitions[scene.id]?.type !== 'none' && (
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 dark:text-blue-400">
                              → {getTransitionInfo(sceneTransitions[scene.id].type)?.name}
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

                        {/* Scene-specific Transition Selector - only show for non-last scenes */}
                        {index < scenes.length - 1 && (
                          <div className="bg-muted/30 rounded-lg p-3">
                            <h5 className="text-sm font-medium mb-3 flex items-center gap-2">
                              <Play className="w-4 h-4 text-blue-500" />
                              Übergang zur nächsten Szene
                            </h5>
                            <div className="grid grid-cols-4 gap-2">
                              {TRANSITION_TYPES.slice(0, 8).map((transition) => (
                                <button
                                  key={transition.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetSceneTransition(scene.id, transition.id);
                                  }}
                                  className={`p-2 rounded-lg border-2 transition-all text-center ${
                                    sceneTransitions[scene.id]?.type === transition.id 
                                      ? 'border-primary ring-2 ring-primary/20 bg-primary/10' 
                                      : 'border-border hover:border-primary/50 bg-background'
                                  }`}
                                >
                                  <div 
                                    className="w-full h-6 rounded mb-1"
                                    style={{ background: transition.preview }}
                                  />
                                  <span className="text-[9px] font-medium block truncate">{transition.name}</span>
                                </button>
                              ))}
                            </div>
                            
                            {/* Duration Slider */}
                            {sceneTransitions[scene.id]?.type && (
                              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                                <span className="text-xs font-medium">Dauer:</span>
                                <Slider
                                  value={[sceneTransitions[scene.id]?.duration || 0.5]}
                                  onValueChange={(v) => handleSetSceneTransitionDuration(scene.id, v[0])}
                                  min={0.2}
                                  max={2}
                                  step={0.1}
                                  className="flex-1"
                                />
                                <span className="text-xs text-muted-foreground w-10 text-right">
                                  {(sceneTransitions[scene.id]?.duration || 0.5).toFixed(1)}s
                                </span>
                              </div>
                            )}
                          </div>
                        )}

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
              scenes={scenes.map(s => ({
                id: s.id,
                startTime: s.start_time,
                endTime: s.end_time,
                mood: s.mood || 'neutral',
                energy: 'medium',
                content: s.description || `Szene ${s.id}`
              }))}
              videoMood={scenes[0]?.mood || 'neutral'}
              videoGenre="allgemein"
            />
          </div>
        </>
      )}
    </div>
  );
}
