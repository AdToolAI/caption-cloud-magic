import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Scissors, 
  Sparkles, 
  X, 
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Lightbulb,
  Palette,
  Clock,
  Wand2
} from 'lucide-react';
import { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { SceneCard } from '../ui/SceneCard';
import { TransitionPicker } from '../ui/TransitionPicker';
import { VisualTimeline } from '../ui/VisualTimeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cn } from '@/lib/utils';

interface SceneEditingStepProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  transitions: TransitionAssignment[];
  onTransitionsChange: (transitions: TransitionAssignment[]) => void;
}

export function SceneEditingStep({
  videoUrl,
  videoDuration,
  scenes,
  onScenesUpdate,
  transitions,
  onTransitionsChange,
}: SceneEditingStepProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [editingTransitionId, setEditingTransitionId] = useState<string | null>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const selectedScene = scenes.find(s => s.id === selectedSceneId);
  const selectedSceneIndex = scenes.findIndex(s => s.id === selectedSceneId);

  // Get transition for editing scene
  const editingTransition = transitions.find(t => t.sceneId === editingTransitionId);

  // Keyboard navigation
  const navigateScene = useCallback((direction: 'prev' | 'next') => {
    if (scenes.length === 0) return;
    
    if (!selectedSceneId) {
      setSelectedSceneId(scenes[0].id);
      return;
    }
    
    const currentIndex = scenes.findIndex(s => s.id === selectedSceneId);
    let newIndex = direction === 'next' 
      ? Math.min(currentIndex + 1, scenes.length - 1)
      : Math.max(currentIndex - 1, 0);
    
    setSelectedSceneId(scenes[newIndex].id);
  }, [scenes, selectedSceneId]);

  useKeyboardShortcuts({
    onClose: () => {
      setSelectedSceneId(null);
      setEditingTransitionId(null);
    },
  }, true);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigateScene('prev');
      if (e.key === 'ArrowRight') navigateScene('next');
      if (e.key === '?') setShowKeyboardHelp(v => !v);
      if (e.key === 't' && selectedSceneId) {
        setEditingTransitionId(selectedSceneId);
      }
      // Number keys for quick transition selection
      if (['1', '2', '3', '4', '5', '6'].includes(e.key) && editingTransitionId) {
        const types = ['none', 'crossfade', 'fade', 'dissolve', 'wipe', 'slide'];
        handleTransitionTypeChange(types[parseInt(e.key) - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateScene, selectedSceneId, editingTransitionId]);

  const handleTransitionTypeChange = (type: string) => {
    if (!editingTransitionId) return;
    
    const existing = transitions.find(t => t.sceneId === editingTransitionId);
    
    if (type === 'none') {
      onTransitionsChange(transitions.filter(t => t.sceneId !== editingTransitionId));
    } else if (existing) {
      onTransitionsChange(transitions.map(t => 
        t.sceneId === editingTransitionId ? { ...t, transitionType: type } : t
      ));
    } else {
      onTransitionsChange([...transitions, {
        sceneId: editingTransitionId,
        transitionType: type,
        duration: 0.5,
        aiSuggested: false,
      }]);
    }
  };

  const handleTransitionDurationChange = (duration: number) => {
    if (!editingTransitionId) return;
    
    onTransitionsChange(transitions.map(t =>
      t.sceneId === editingTransitionId ? { ...t, duration } : t
    ));
  };

  const applyAiSuggestions = () => {
    // Apply AI-suggested transitions to all scenes
    const aiTransitions: TransitionAssignment[] = scenes.slice(0, -1).map((scene, index) => {
      const existing = transitions.find(t => t.sceneId === scene.id);
      if (existing?.aiSuggested) return existing;
      
      // Smart AI logic based on scene mood
      const mood = scene.mood?.toLowerCase() || 'neutral';
      let transitionType = 'crossfade';
      let confidence = 0.85;
      let reasoning = 'Standard-Überblendung für neutrale Szenen';
      
      if (mood === 'energetic' || mood === 'action') {
        transitionType = 'wipe';
        confidence = 0.9;
        reasoning = 'Dynamischer Wipe-Effekt passt zur energetischen Stimmung';
      } else if (mood === 'calm' || mood === 'peaceful') {
        transitionType = 'dissolve';
        confidence = 0.92;
        reasoning = 'Sanfter Dissolve-Effekt für ruhige, friedliche Szenen';
      } else if (mood === 'dramatic') {
        transitionType = 'fade';
        confidence = 0.88;
        reasoning = 'Fade to Black verstärkt dramatische Momente';
      }
      
      return {
        sceneId: scene.id,
        transitionType,
        duration: 0.5,
        aiSuggested: true,
        confidence,
        reasoning,
      };
    });
    
    onTransitionsChange(aiTransitions);
  };

  const getTransitionForScene = (sceneId: string) => {
    return transitions.find(t => t.sceneId === sceneId);
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            Szenen-Editor
          </h3>
          <p className="text-sm text-muted-foreground">
            Bearbeite Szenen und konfiguriere Übergänge visuell
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKeyboardHelp(v => !v)}
            className="text-xs"
          >
            <Keyboard className="h-3.5 w-3.5 mr-1.5" />
            Shortcuts
          </Button>
          <Button
            onClick={applyAiSuggestions}
            size="sm"
            className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            AI Übergänge
          </Button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      <AnimatePresence>
        {showKeyboardHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="py-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {[
                    { key: '← →', action: 'Szene wechseln' },
                    { key: 'T', action: 'Transition öffnen' },
                    { key: '1-6', action: 'Transition wählen' },
                    { key: 'ESC', action: 'Schließen' },
                    { key: '?', action: 'Hilfe ein/aus' },
                    { key: 'Space', action: 'Play/Pause' },
                  ].map(({ key, action }) => (
                    <div key={key} className="flex items-center gap-2">
                      <kbd className="px-2 py-1 rounded bg-background border text-[10px] font-mono">
                        {key}
                      </kbd>
                      <span className="text-muted-foreground">{action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Timeline */}
      <VisualTimeline
        scenes={scenes}
        transitions={transitions}
        videoDuration={videoDuration}
        selectedSceneId={selectedSceneId}
        onSceneSelect={setSelectedSceneId}
        onTransitionClick={setEditingTransitionId}
        thumbnails={thumbnails}
      />

      {/* Scene Cards Grid */}
      {scenes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Scissors className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Keine Szenen vorhanden. Bitte zuerst die KI-Analyse durchführen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {scenes.map((scene, index) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              index={index}
              isSelected={selectedSceneId === scene.id}
              thumbnail={thumbnails[scene.id]}
              transitionType={getTransitionForScene(scene.id)?.transitionType}
              onClick={() => {
                setSelectedSceneId(scene.id);
                setEditingTransitionId(null);
              }}
            />
          ))}
        </div>
      )}

      {/* Selected Scene Details Panel */}
      <AnimatePresence>
        {selectedScene && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50"
          >
            <Card className="backdrop-blur-xl bg-card/95 border shadow-2xl">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono">
                      Szene {selectedSceneIndex + 1}
                    </Badge>
                    <span className="text-sm font-mono text-muted-foreground">
                      {selectedScene.start_time.toFixed(1)}s – {selectedScene.end_time.toFixed(1)}s
                    </span>
                    {selectedScene.mood && (
                      <Badge variant="outline" className="capitalize">
                        <Palette className="h-3 w-3 mr-1" />
                        {selectedScene.mood}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigateScene('prev')}
                      disabled={selectedSceneIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigateScene('next')}
                      disabled={selectedSceneIndex === scenes.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedSceneId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm mb-4">{selectedScene.description}</p>

                {/* AI Suggestions */}
                {selectedScene.ai_suggestions && selectedScene.ai_suggestions.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs font-medium">AI Vorschläge</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedScene.ai_suggestions.map((suggestion, i) => (
                        <Badge key={i} variant="secondary" className="bg-primary/10 text-primary">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {suggestion}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transition Editor (if not last scene) */}
                {selectedSceneIndex < scenes.length - 1 && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">Übergang zur nächsten Szene</span>
                    </div>
                    <TransitionPicker
                      selectedType={getTransitionForScene(selectedScene.id)?.transitionType || 'none'}
                      duration={getTransitionForScene(selectedScene.id)?.duration || 0.5}
                      onTypeChange={(type) => {
                        setEditingTransitionId(selectedScene.id);
                        handleTransitionTypeChange(type);
                      }}
                      onDurationChange={(duration) => {
                        setEditingTransitionId(selectedScene.id);
                        handleTransitionDurationChange(duration);
                      }}
                      aiRecommendation={getTransitionForScene(selectedScene.id)?.aiSuggested 
                        ? getTransitionForScene(selectedScene.id)?.transitionType 
                        : undefined}
                      aiConfidence={getTransitionForScene(selectedScene.id)?.confidence}
                      aiReasoning={getTransitionForScene(selectedScene.id)?.reasoning}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Footer */}
      <div className="flex items-center justify-center gap-6 py-4 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Scissors className="h-4 w-4" />
          <span>{scenes.length} Szenen</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>{transitions.length} Übergänge</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{videoDuration.toFixed(1)}s gesamt</span>
        </div>
      </div>
    </div>
  );
}
