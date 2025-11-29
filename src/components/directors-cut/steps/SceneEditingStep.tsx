import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Scissors, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

interface SceneEditingStepProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  transitions: TransitionAssignment[];
  onTransitionsChange: (transitions: TransitionAssignment[]) => void;
}

const TRANSITION_TYPES = [
  { id: 'none', name: 'Kein', icon: '—' },
  { id: 'crossfade', name: 'Crossfade', icon: '⨉' },
  { id: 'fade', name: 'Fade', icon: '◐' },
  { id: 'dissolve', name: 'Dissolve', icon: '◎' },
  { id: 'wipe', name: 'Wipe', icon: '▶' },
  { id: 'slide', name: 'Slide', icon: '→' },
];

export function SceneEditingStep({
  videoUrl,
  videoDuration,
  scenes,
  onScenesUpdate,
  transitions,
  onTransitionsChange,
}: SceneEditingStepProps) {
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const [sceneTransitions, setSceneTransitions] = useState<Record<string, { type: string; duration: number }>>({});

  // Sync transitions to local state
  useEffect(() => {
    const transitionMap: Record<string, { type: string; duration: number }> = {};
    transitions.forEach(t => {
      transitionMap[t.sceneId] = { type: t.transitionType, duration: t.duration };
    });
    setSceneTransitions(transitionMap);
  }, [transitions]);

  const handleTransitionChange = (sceneId: string, type: string, duration: number) => {
    const newTransitions = [...transitions];
    const existingIndex = newTransitions.findIndex(t => t.sceneId === sceneId);
    
    if (type === 'none') {
      if (existingIndex >= 0) {
        newTransitions.splice(existingIndex, 1);
      }
    } else {
      if (existingIndex >= 0) {
        newTransitions[existingIndex] = { ...newTransitions[existingIndex], transitionType: type, duration };
      } else {
        newTransitions.push({ sceneId, transitionType: type, duration, aiSuggested: false });
      }
    }
    
    onTransitionsChange(newTransitions);
    setSceneTransitions(prev => ({ ...prev, [sceneId]: { type, duration } }));
  };

  const getSceneTransition = (sceneId: string) => {
    return sceneTransitions[sceneId] || { type: 'none', duration: 0.5 };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Manuelle Szenen-Bearbeitung</h3>
        <p className="text-sm text-muted-foreground">
          Passe Szenen manuell an und konfiguriere Übergänge
        </p>
      </div>

      {/* Scene List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Szenen ({scenes.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {scenes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Szenen vorhanden. Bitte zuerst die KI-Analyse durchführen.
            </p>
          ) : (
            scenes.map((scene, index) => {
              const isExpanded = expandedSceneId === scene.id;
              const transition = getSceneTransition(scene.id);
              const isLastScene = index === scenes.length - 1;

              return (
                <div
                  key={scene.id}
                  className="border rounded-lg overflow-hidden"
                >
                  {/* Scene Header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedSceneId(isExpanded ? null : scene.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
                      </span>
                      <span className="text-sm font-medium">{scene.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isLastScene && transition.type !== 'none' && (
                        <Badge variant="outline" className="text-xs">
                          {TRANSITION_TYPES.find(t => t.id === transition.type)?.name || 'Crossfade'}
                        </Badge>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-3 border-t bg-muted/30 space-y-4">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Stimmung:</span> {scene.mood}
                      </div>
                      
                      {scene.ai_suggestions && scene.ai_suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {scene.ai_suggestions.map((suggestion, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              {suggestion}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Transition Editor (not for last scene) */}
                      {!isLastScene && (
                        <div className="space-y-3 pt-3 border-t">
                          <div className="text-xs font-medium">Übergang zur nächsten Szene</div>
                          <div className="flex flex-wrap gap-2">
                            {TRANSITION_TYPES.map((t) => (
                              <Button
                                key={t.id}
                                variant={transition.type === t.id ? 'default' : 'outline'}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransitionChange(scene.id, t.id, transition.duration);
                                }}
                              >
                                <span className="mr-1">{t.icon}</span>
                                {t.name}
                              </Button>
                            ))}
                          </div>
                          
                          {transition.type !== 'none' && (
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span>Dauer</span>
                                <span>{transition.duration.toFixed(1)}s</span>
                              </div>
                              <Slider
                                value={[transition.duration]}
                                onValueChange={([v]) => handleTransitionChange(scene.id, transition.type, v)}
                                min={0.1}
                                max={2}
                                step={0.1}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
