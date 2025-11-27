import { useState } from 'react';
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
  Loader2
} from 'lucide-react';
import type { SceneAnalysisStepProps, SceneAnalysis, GlobalEffects } from '@/types/directors-cut';
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

export function SceneAnalysisStep({
  videoUrl,
  videoDuration,
  scenes,
  onScenesUpdate,
  isAnalyzing,
  onStartAnalysis,
  onApplySuggestions,
  appliedEffects,
}: SceneAnalysisStepProps) {
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [autoCuts, setAutoCuts] = useState<any[]>([]);
  const [transitions, setTransitions] = useState<TransitionAssignment[]>([]);

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

  // Build CSS filter string for native video element - using AVAILABLE_FILTERS like VisualEffectsStep
  const buildVideoFilter = () => {
    if (!appliedEffects) {
      console.log('[SceneAnalysisStep] No appliedEffects, returning none');
      return 'none';
    }
    
    console.log('[SceneAnalysisStep] Building filter with effects:', appliedEffects);
    
    // Find the preset filter CSS from AVAILABLE_FILTERS
    const presetFilter = AVAILABLE_FILTERS.find(f => f.id === appliedEffects.filter);
    const presetCSS = presetFilter?.preview || '';
    
    console.log('[SceneAnalysisStep] Preset filter:', appliedEffects.filter, '-> CSS:', presetCSS);
    
    // Build base effects (brightness, contrast, saturation)
    const baseEffects = `brightness(${(appliedEffects.brightness || 100) / 100}) contrast(${(appliedEffects.contrast || 100) / 100}) saturate(${(appliedEffects.saturation || 100) / 100})`;
    
    // Temperature effect
    let tempEffect = '';
    if (appliedEffects.temperature && appliedEffects.temperature !== 0) {
      if (appliedEffects.temperature > 0) {
        tempEffect = ` sepia(${appliedEffects.temperature / 100})`;
      } else {
        tempEffect = ` hue-rotate(${appliedEffects.temperature * 2}deg)`;
      }
    }
    
    // Combine all: base + preset + temperature
    const finalFilter = `${baseEffects} ${presetCSS}${tempEffect}`.trim();
    
    console.log('[SceneAnalysisStep] Final CSS filter:', finalFilter);
    
    return finalFilter || 'none';
  };

  // Helper to extract number from string
  const extractNumber = (text: string, defaultValue: number): number => {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : defaultValue;
  };

  // Parse effect name to extract filter/effect type
  const parseEffectName = (name: string, effectType?: string): Partial<GlobalEffects> => {
    const lowerName = name.toLowerCase();
    const effects: Partial<GlobalEffects> = {};
    
    console.log('[SceneAnalysisStep] Parsing effect:', name, '| Type:', effectType);
    
    // SKIP transitions - they don't apply visual filters
    if (effectType === 'transition' || 
        lowerName.includes('fade') || 
        lowerName.includes('slide') || 
        lowerName.includes('wipe') ||
        lowerName.includes('crossfade')) {
      console.log('[SceneAnalysisStep] Skipping transition effect');
      return {};
    }
    
    // Match AVAILABLE_FILTERS by id or name (fuzzy matching)
    for (const filter of AVAILABLE_FILTERS) {
      if (filter.id === 'none') continue;
      if (lowerName.includes(filter.id) || lowerName.includes(filter.name.toLowerCase())) {
        effects.filter = filter.id;
        // Also apply associated values from FILTER_EFFECT_MAPPING
        const mapping = FILTER_EFFECT_MAPPING[filter.id];
        if (mapping) {
          Object.assign(effects, mapping);
        }
        console.log('[SceneAnalysisStep] Matched filter:', filter.id, '-> Effects:', effects);
        return effects;
      }
    }
    
    // Parse vignette
    if (lowerName.includes('vignette')) {
      effects.vignette = extractNumber(lowerName, 40);
      console.log('[SceneAnalysisStep] Parsed vignette:', effects.vignette);
      return effects;
    }
    
    // Parse brightness
    if (lowerName.includes('bright') || lowerName.includes('hell')) {
      effects.brightness = extractNumber(lowerName, 115);
      console.log('[SceneAnalysisStep] Parsed brightness:', effects.brightness);
      return effects;
    }
    
    // Parse saturation
    if (lowerName.includes('saturat') || lowerName.includes('sättig')) {
      effects.saturation = extractNumber(lowerName, 125);
      console.log('[SceneAnalysisStep] Parsed saturation:', effects.saturation);
      return effects;
    }
    
    // Parse contrast
    if (lowerName.includes('contrast') || lowerName.includes('kontrast')) {
      effects.contrast = extractNumber(lowerName, 115);
      console.log('[SceneAnalysisStep] Parsed contrast:', effects.contrast);
      return effects;
    }
    
    // Parse warm/cool temperature
    if (lowerName.includes('warm')) {
      effects.temperature = 25;
      effects.saturation = 110;
      console.log('[SceneAnalysisStep] Parsed warm:', effects);
      return effects;
    }
    if (lowerName.includes('cool') || lowerName.includes('kalt') || lowerName.includes('kühl')) {
      effects.temperature = -20;
      console.log('[SceneAnalysisStep] Parsed cool:', effects);
      return effects;
    }
    
    // No specific match - return subtle enhancement as fallback (NOT invalid filter)
    console.log('[SceneAnalysisStep] No match, applying subtle fallback enhancement');
    return { 
      contrast: 108,
      saturation: 108 
    };
  };

  const applyAllSuggestions = () => {
    console.log('[SceneAnalysisStep] applyAllSuggestions called');
    console.log('[SceneAnalysisStep] Scenes:', scenes);
    
    if (!onApplySuggestions) {
      console.error('[SceneAnalysisStep] onApplySuggestions callback is not defined!');
      toast.error('Vorschläge können nicht angewendet werden');
      return;
    }

    // Collect all effects from all scenes
    const combinedEffects: Partial<GlobalEffects> = {};
    let appliedCount = 0;
    let skippedTransitions = 0;
    
    for (const scene of scenes) {
      console.log('[SceneAnalysisStep] Processing scene:', scene.id, 'effects:', scene.suggested_effects);
      for (const effect of scene.suggested_effects) {
        // Pass effect.type to parseEffectName to skip transitions
        const parsed = parseEffectName(effect.name, effect.type);
        console.log('[SceneAnalysisStep] Effect:', effect.name, '| Type:', effect.type, '-> Parsed:', parsed);
        
        // Only count if we got actual effects back
        if (Object.keys(parsed).length > 0) {
          Object.assign(combinedEffects, parsed);
          appliedCount++;
        } else {
          skippedTransitions++;
        }
      }
    }
    
    console.log('[SceneAnalysisStep] Combined effects to apply:', combinedEffects);
    console.log('[SceneAnalysisStep] Applied count:', appliedCount, '| Skipped transitions:', skippedTransitions);
    
    // Ensure at least SOME visible changes even if no effects matched
    if (Object.keys(combinedEffects).length === 0) {
      combinedEffects.contrast = 110;
      combinedEffects.saturation = 115;
      console.log('[SceneAnalysisStep] No effects matched, applying default enhancement:', combinedEffects);
      toast.info('Standard-Optimierung angewendet (keine spezifischen Filter erkannt)');
    } else {
      toast.success(`${appliedCount} Effekte angewendet`);
    }

    onApplySuggestions(combinedEffects);
  };

  const applySingleSceneSuggestion = (scene: SceneAnalysis) => {
    if (!onApplySuggestions) return;
    
    if (scene.suggested_effects.length === 0) {
      toast.info('Keine Vorschläge für diese Szene');
      return;
    }
    
    // Apply all effects from this scene
    const combinedEffects: Partial<GlobalEffects> = {};
    
    for (const effect of scene.suggested_effects) {
      const parsed = parseEffectName(effect.name);
      Object.assign(combinedEffects, parsed);
    }
    
    onApplySuggestions(combinedEffects);
    toast.success(`${scene.suggested_effects.length} Effekte für Szene angewendet`);
  };

  return (
    <div className="space-y-6">
      {/* Video Preview with Timeline */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          src={videoUrl}
          controls
          className="w-full h-full"
          style={{ filter: buildVideoFilter() }}
        />
        
        {/* Vignette Overlay - CSS filter can't do vignette, so we use box-shadow */}
        {appliedEffects && appliedEffects.vignette > 0 && (
          <div 
            className="absolute inset-0 pointer-events-none rounded-lg"
            style={{
              boxShadow: `inset 0 0 ${appliedEffects.vignette * 3}px ${appliedEffects.vignette * 1.5}px rgba(0,0,0,0.6)`,
            }}
          />
        )}
        
        {/* Scene Timeline Overlay */}
        {scenes.length > 0 && (
          <div className="absolute bottom-12 left-0 right-0 px-4">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg p-2">
              <div className="flex h-8 gap-0.5">
                {scenes.map((scene, index) => {
                  const width = ((scene.end_time - scene.start_time) / videoDuration) * 100;
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
                        hover:opacity-80 transition-opacity relative group`}
                      style={{ width: `${width}%` }}
                      title={`Szene ${index + 1}: ${scene.description}`}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 
                        bg-black/80 text-white text-xs px-2 py-1 rounded 
                        opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {formatTime(scene.start_time)} - {formatTime(scene.end_time)}
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
                return (
                  <Card
                    key={scene.id}
                    className={`p-4 transition-all cursor-pointer ${
                      isExpanded ? 'ring-2 ring-primary' : 'hover:bg-accent/50'
                    }`}
                    onClick={() => toggleSceneExpand(scene.id)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Scene Number */}
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="font-bold text-primary">{index + 1}</span>
                      </div>

                      {/* Scene Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{scene.description}</h4>
                          <Badge variant="secondary" className={getMoodColor(scene.mood)}>
                            {scene.mood}
                          </Badge>
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
