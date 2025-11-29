import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TRANSITION_OPTIONS } from '@/types/sora-long-form';
import type { Sora2LongFormProject, Sora2Scene, TransitionType } from '@/types/sora-long-form';

interface TransitionEditorProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function TransitionEditor({
  project,
  scenes,
  onUpdateScenes,
  onNext,
  onBack,
}: TransitionEditorProps) {
  const updateTransition = (index: number, type: TransitionType, duration?: number) => {
    const newScenes = [...scenes];
    newScenes[index] = {
      ...newScenes[index],
      transition_type: type,
      ...(duration !== undefined && { transition_duration: duration }),
    };
    onUpdateScenes(newScenes);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Übergänge anpassen</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Definiere präzise Übergänge zwischen den Szenen
        </p>
      </div>

      {/* Timeline View */}
      <div className="space-y-4">
        {scenes.map((scene, index) => (
          <div key={scene.id} className="flex items-stretch gap-4">
            {/* Scene Preview */}
            <Card className="flex-shrink-0 w-48 p-3">
              <div className="aspect-video rounded-lg overflow-hidden bg-muted mb-2">
                {scene.generated_video_url ? (
                  <video
                    src={scene.generated_video_url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm">
                    Szene {index + 1}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {scene.duration} Sekunden
              </p>
            </Card>

            {/* Transition (if not last scene) */}
            {index < scenes.length - 1 && (
              <Card className="flex-1 p-4">
                <div className="flex items-center gap-4 h-full">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Übergang</Label>
                    <Select
                      value={scene.transition_type}
                      onValueChange={(v) => updateTransition(index, v as TransitionType)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSITION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {scene.transition_type !== 'none' && (
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">
                        Dauer: {scene.transition_duration.toFixed(1)}s
                      </Label>
                      <Slider
                        value={[scene.transition_duration]}
                        onValueChange={([v]) => updateTransition(index, scene.transition_type, v)}
                        min={0.1}
                        max={2}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>
                  )}

                  {/* Visual Indicator */}
                  <div className="flex-shrink-0 flex items-center">
                    <div className={cn(
                      'h-8 w-16 rounded flex items-center justify-center text-xs font-medium',
                      scene.transition_type === 'none' && 'bg-muted text-muted-foreground',
                      scene.transition_type === 'fade' && 'bg-blue-500/20 text-blue-600',
                      scene.transition_type === 'crossfade' && 'bg-purple-500/20 text-purple-600',
                      scene.transition_type === 'slide' && 'bg-green-500/20 text-green-600',
                      scene.transition_type === 'zoom' && 'bg-orange-500/20 text-orange-600',
                      scene.transition_type === 'wipe' && 'bg-pink-500/20 text-pink-600',
                    )}>
                      {TRANSITION_OPTIONS.find(t => t.value === scene.transition_type)?.label}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="p-4">
        <Label className="text-sm font-medium mb-3 block">Schnellaktionen</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newScenes = scenes.map(s => ({ ...s, transition_type: 'crossfade' as TransitionType }));
              onUpdateScenes(newScenes);
            }}
          >
            Alle: Crossfade
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newScenes = scenes.map(s => ({ ...s, transition_type: 'fade' as TransitionType }));
              onUpdateScenes(newScenes);
            }}
          >
            Alle: Fade
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newScenes = scenes.map(s => ({ ...s, transition_type: 'none' as TransitionType }));
              onUpdateScenes(newScenes);
            }}
          >
            Alle: Keine
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newScenes = scenes.map(s => ({ ...s, transition_duration: 0.5 }));
              onUpdateScenes(newScenes);
            }}
          >
            Dauer: 0.5s
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newScenes = scenes.map(s => ({ ...s, transition_duration: 1.0 }));
              onUpdateScenes(newScenes);
            }}
          >
            Dauer: 1.0s
          </Button>
        </div>
      </Card>

      {/* Navigation */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {scenes.filter(s => s.transition_type !== 'none').length} Übergänge definiert
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            <Button onClick={onNext}>
              Zum Export
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
