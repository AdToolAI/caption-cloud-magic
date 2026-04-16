import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import SceneCard from './SceneCard';
import type { ComposerScene, ClipSource } from '@/types/video-composer';
import { DEFAULT_TEXT_OVERLAY, CLIP_SOURCE_COSTS } from '@/types/video-composer';

interface StoryboardTabProps {
  scenes: ComposerScene[];
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onGoToClips: () => void;
  language: string;
}

export default function StoryboardTab({ scenes, onUpdateScenes, onGoToClips, language }: StoryboardTabProps) {
  const addScene = () => {
    const newScene: ComposerScene = {
      id: `scene_${Date.now()}`,
      projectId: '',
      orderIndex: scenes.length,
      sceneType: 'custom',
      durationSeconds: 5,
      clipSource: 'stock',
      clipStatus: 'pending',
      textOverlay: { ...DEFAULT_TEXT_OVERLAY },
      transitionType: 'fade',
      transitionDuration: 0.5,
      retryCount: 0,
      costEuros: 0,
    };
    onUpdateScenes([...scenes, newScene]);
  };

  const updateScene = (id: string, updates: Partial<ComposerScene>) => {
    onUpdateScenes(
      scenes.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, ...updates };
        // Recalculate cost when source or duration changes (per-second × duration)
        if (updates.clipSource || updates.durationSeconds) {
          const perSec = CLIP_SOURCE_COSTS[(updates.clipSource ?? updated.clipSource) as ClipSource] || 0;
          updated.costEuros = perSec * updated.durationSeconds;
        }
        return updated;
      })
    );
  };

  const deleteScene = (id: string) => {
    onUpdateScenes(
      scenes
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, orderIndex: i }))
    );
  };

  const moveScene = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= scenes.length) return;
    const updated = [...scenes];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onUpdateScenes(updated.map((s, i) => ({ ...s, orderIndex: i })));
  };

  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalCost = scenes.reduce((sum, s) => sum + (CLIP_SOURCE_COSTS[s.clipSource] || 0) * s.durationSeconds, 0);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Summary Bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border/40">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{scenes.length} Szenen</span>
          <span>•</span>
          <span>{totalDuration}s Gesamtdauer</span>
          <span>•</span>
          <span className="text-primary font-medium">~€{totalCost.toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addScene} className="gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Szene
          </Button>
          <Button
            size="sm"
            onClick={onGoToClips}
            disabled={scenes.length === 0}
            className="gap-1 text-xs"
          >
            Clips generieren <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Scene Cards */}
      {scenes.length === 0 ? (
        <Card className="border-border/40 bg-card/50">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm mb-3">Noch keine Szenen vorhanden</p>
            <Button onClick={addScene} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Erste Szene hinzufügen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, index) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              index={index}
              totalScenes={scenes.length}
              onUpdate={(updates) => updateScene(scene.id, updates)}
              onDelete={() => deleteScene(scene.id)}
              onMoveUp={() => moveScene(index, index - 1)}
              onMoveDown={() => moveScene(index, index + 1)}
              language={language}
            />
          ))}
        </div>
      )}
    </div>
  );
}
