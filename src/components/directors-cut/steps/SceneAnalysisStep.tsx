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
import { FILTER_EFFECT_MAPPING } from '@/types/directors-cut';
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

  // Find best suggestion across all scenes
  const getBestSuggestion = () => {
    let bestEffect: { name: string; confidence: number } | null = null;
    
    for (const scene of scenes) {
      for (const effect of scene.suggested_effects) {
        if (effect.type === 'filter' && (!bestEffect || effect.confidence > bestEffect.confidence)) {
          bestEffect = { name: effect.name.toLowerCase(), confidence: effect.confidence };
        }
      }
    }
    return bestEffect;
  };

  const applyAllSuggestions = () => {
    if (!onApplySuggestions) {
      toast.error('Vorschläge können nicht angewendet werden');
      return;
    }

    const bestSuggestion = getBestSuggestion();
    if (!bestSuggestion) {
      toast.info('Keine Vorschläge zum Anwenden gefunden');
      return;
    }

    const effectMapping = FILTER_EFFECT_MAPPING[bestSuggestion.name];
    if (effectMapping) {
      onApplySuggestions(effectMapping);
      toast.success(`"${bestSuggestion.name}" Filter angewendet (${Math.round(bestSuggestion.confidence * 100)}% Konfidenz)`);
    } else {
      // Fallback: just apply filter name
      onApplySuggestions({ filter: bestSuggestion.name });
      toast.success(`"${bestSuggestion.name}" Filter angewendet`);
    }
  };

  const applySingleSceneSuggestion = (scene: SceneAnalysis) => {
    if (!onApplySuggestions) return;
    
    const filterEffect = scene.suggested_effects.find(e => e.type === 'filter');
    if (filterEffect) {
      const effectName = filterEffect.name.toLowerCase();
      const effectMapping = FILTER_EFFECT_MAPPING[effectName];
      if (effectMapping) {
        onApplySuggestions(effectMapping);
        toast.success(`"${filterEffect.name}" Filter für Szene angewendet`);
      } else {
        onApplySuggestions({ filter: effectName });
        toast.success(`"${filterEffect.name}" Filter angewendet`);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Video Preview with Timeline */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          src={videoUrl}
          controls
          className="w-full h-full"
        />
        
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
