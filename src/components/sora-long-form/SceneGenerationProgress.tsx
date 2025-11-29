import { useState, useEffect } from 'react';
import { Play, Loader2, Check, X, RefreshCw, ArrowLeft, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

interface SceneGenerationProgressProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onUpdateProject: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function SceneGenerationProgress({
  project,
  scenes,
  onUpdateScenes,
  onUpdateProject,
  onNext,
  onBack,
}: SceneGenerationProgressProps) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [currentGenerating, setCurrentGenerating] = useState<Set<number>>(new Set());

  const completedScenes = scenes.filter(s => s.status === 'completed').length;
  const failedScenes = scenes.filter(s => s.status === 'failed').length;
  const progress = (completedScenes / scenes.length) * 100;
  const allCompleted = completedScenes === scenes.length;

  // Subscribe to scene updates
  useEffect(() => {
    const channel = supabase
      .channel('scene-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sora_long_form_scenes',
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const updated = payload.new as Sora2Scene;
          const newScenes = scenes.map(s =>
            s.id === updated.id ? { ...s, ...updated } : s
          );
          onUpdateScenes(newScenes);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project.id, scenes]);

  const startGeneration = async () => {
    setGenerating(true);
    await onUpdateProject({ status: 'generating' });

    try {
      const { data, error } = await supabase.functions.invoke('generate-sora-scenes-batch', {
        body: {
          projectId: project.id,
          model: project.model,
          aspectRatio: project.aspect_ratio,
        },
      });

      if (error) throw error;

      toast({
        title: 'Generierung gestartet',
        description: `${scenes.length} Szenen werden parallel generiert`,
      });

      // Mark all as generating
      const updatedScenes = scenes.map(s => ({ ...s, status: 'generating' as const }));
      await onUpdateScenes(updatedScenes);
    } catch (error) {
      console.error('Error starting generation:', error);
      toast({
        title: 'Fehler',
        description: 'Generierung konnte nicht gestartet werden',
        variant: 'destructive',
      });
      setGenerating(false);
      await onUpdateProject({ status: 'draft' });
    }
  };

  const retryScene = async (index: number) => {
    const scene = scenes[index];
    setCurrentGenerating(prev => new Set(prev).add(index));

    try {
      const { error } = await supabase.functions.invoke('generate-sora-scenes-batch', {
        body: {
          projectId: project.id,
          model: project.model,
          aspectRatio: project.aspect_ratio,
          sceneIds: [scene.id],
        },
      });

      if (error) throw error;

      const updatedScenes = scenes.map((s, i) =>
        i === index ? { ...s, status: 'generating' as const } : s
      );
      await onUpdateScenes(updatedScenes);
    } catch (error) {
      console.error('Error retrying scene:', error);
      toast({ title: 'Retry fehlgeschlagen', variant: 'destructive' });
    } finally {
      setCurrentGenerating(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const getStatusIcon = (status: string, index: number) => {
    if (currentGenerating.has(index)) {
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    }
    switch (status) {
      case 'completed':
        return <Check className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <X className="h-5 w-5 text-destructive" />;
      case 'generating':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-border" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">Fertig</Badge>;
      case 'failed':
        return <Badge variant="destructive">Fehlgeschlagen</Badge>;
      case 'generating':
        return <Badge className="bg-primary">Generiert...</Badge>;
      default:
        return <Badge variant="outline">Wartend</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold">Video-Szenen generieren</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Jede Szene wird parallel mit Sora 2 {project.model === 'sora-2-pro' ? 'Pro' : 'Standard'} generiert
        </p>
      </div>

      {/* Progress */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Fortschritt</span>
            <span className="text-sm text-muted-foreground">
              {completedScenes} / {scenes.length} Szenen
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          {failedScenes > 0 && (
            <p className="text-sm text-destructive">
              {failedScenes} Szene(n) fehlgeschlagen - klicke auf Retry
            </p>
          )}
        </div>
      </Card>

      {/* Scene List */}
      <div className="grid gap-4">
        {scenes.map((scene, index) => (
          <Card
            key={scene.id}
            className={cn(
              'p-4 transition-all',
              scene.status === 'completed' && 'border-green-500/50 bg-green-500/5',
              scene.status === 'failed' && 'border-destructive/50 bg-destructive/5'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                {getStatusIcon(scene.status, index)}
              </div>
              
              <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-muted">
                {scene.generated_video_url ? (
                  <video
                    src={scene.generated_video_url}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : scene.reference_image_url ? (
                  <img
                    src={scene.reference_image_url}
                    alt={`Szene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">Szene {index + 1}</span>
                  {getStatusBadge(scene.status)}
                  <Badge variant="outline">{scene.duration}s</Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {scene.prompt.slice(0, 80)}...
                </p>
              </div>

              {scene.status === 'failed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryScene(index)}
                  disabled={currentGenerating.has(index)}
                >
                  <RefreshCw className={cn(
                    'h-4 w-4 mr-1',
                    currentGenerating.has(index) && 'animate-spin'
                  )} />
                  Retry
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            {!generating && !allCompleted && (
              <p className="text-sm text-muted-foreground">
                Klicke auf Start um alle Szenen zu generieren
              </p>
            )}
            {generating && !allCompleted && (
              <p className="text-sm text-muted-foreground">
                Generierung läuft... Dies kann 5-10 Minuten dauern
              </p>
            )}
            {allCompleted && (
              <p className="text-sm text-green-600 font-medium">
                ✓ Alle Szenen erfolgreich generiert!
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} disabled={generating}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            {!generating && !allCompleted && (
              <Button onClick={startGeneration}>
                <Play className="h-4 w-4 mr-2" />
                Generierung starten
              </Button>
            )}
            {allCompleted && (
              <Button onClick={onNext}>
                Weiter zu Übergängen
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
