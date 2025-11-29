import { useState, useEffect } from 'react';
import { Play, Loader2, Check, X, RefreshCw, ArrowLeft, ArrowRight, AlertCircle, Coins } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { calculateSoraLongformCost } from '@/lib/featureCosts';
import { useCredits } from '@/hooks/useCredits';
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
  const { balance, refetch: refetchBalance } = useCredits();
  const [generating, setGenerating] = useState(false);
  const [currentGenerating, setCurrentGenerating] = useState<Set<number>>(new Set());

  const completedScenes = scenes.filter(s => s.status === 'completed').length;
  const failedScenes = scenes.filter(s => s.status === 'failed').length;
  const pendingScenes = scenes.filter(s => s.status === 'pending' || s.status === 'failed');
  const progress = (completedScenes / scenes.length) * 100;
  const allCompleted = completedScenes === scenes.length;

  // Calculate cost for pending scenes
  const totalDuration = pendingScenes.reduce((sum, s) => sum + s.duration, 0);
  const costInfo = calculateSoraLongformCost(totalDuration, project.model);
  const hasEnoughCredits = (balance?.balance || 0) >= costInfo.credits;

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
          
          // Refetch balance when scene completes or fails
          if (updated.status === 'completed' || updated.status === 'failed') {
            refetchBalance();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project.id, scenes, refetchBalance]);

  const startGeneration = async () => {
    if (!hasEnoughCredits) {
      toast({
        title: 'Nicht genügend Credits',
        description: `Du benötigst ${costInfo.credits} Credits, hast aber nur ${balance?.balance || 0}.`,
        variant: 'destructive',
      });
      return;
    }

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

      if (error) {
        // Check for credit-related errors
        if (error.message?.includes('402') || error.message?.includes('INSUFFICIENT_CREDITS')) {
          toast({
            title: 'Nicht genügend Credits',
            description: 'Bitte kaufe mehr Credits, um fortzufahren.',
            variant: 'destructive',
          });
          setGenerating(false);
          await onUpdateProject({ status: 'draft' });
          return;
        }
        throw error;
      }

      // Check response for credit errors
      if (data?.code === 'INSUFFICIENT_CREDITS') {
        toast({
          title: 'Nicht genügend Credits',
          description: `Du benötigst ${data.required_credits} Credits.`,
          variant: 'destructive',
        });
        setGenerating(false);
        await onUpdateProject({ status: 'draft' });
        return;
      }

      toast({
        title: 'Generierung gestartet',
        description: `${data.started} Szenen werden sequentiell generiert (Rate-Limit: 1 Szene alle 12 Sekunden)`,
      });

      // Mark all pending as generating
      const updatedScenes = scenes.map(s => 
        s.status === 'pending' || s.status === 'failed' 
          ? { ...s, status: 'generating' as const } 
          : s
      );
      await onUpdateScenes(updatedScenes);
      
      // Refetch balance after successful start
      refetchBalance();
      
    } catch (error: any) {
      console.error('Error starting generation:', error);
      toast({
        title: 'Fehler',
        description: error?.message || 'Generierung konnte nicht gestartet werden',
        variant: 'destructive',
      });
      setGenerating(false);
      await onUpdateProject({ status: 'draft' });
    }
  };

  const retryScene = async (index: number) => {
    const scene = scenes[index];
    const sceneCost = calculateSoraLongformCost(scene.duration, project.model);
    
    if ((balance?.balance || 0) < sceneCost.credits) {
      toast({
        title: 'Nicht genügend Credits',
        description: `Du benötigst ${sceneCost.credits} Credits für diese Szene.`,
        variant: 'destructive',
      });
      return;
    }

    setCurrentGenerating(prev => new Set(prev).add(index));

    try {
      const { data, error } = await supabase.functions.invoke('generate-sora-scenes-batch', {
        body: {
          projectId: project.id,
          model: project.model,
          aspectRatio: project.aspect_ratio,
          sceneIds: [scene.id],
        },
      });

      if (error) throw error;

      if (data?.code === 'INSUFFICIENT_CREDITS') {
        toast({
          title: 'Nicht genügend Credits',
          variant: 'destructive',
        });
        return;
      }

      const updatedScenes = scenes.map((s, i) =>
        i === index ? { ...s, status: 'generating' as const } : s
      );
      await onUpdateScenes(updatedScenes);
      refetchBalance();
      
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
          Jede Szene wird sequentiell mit Sora 2 {project.model === 'sora-2-pro' ? 'Pro' : 'Standard'} generiert
        </p>
      </div>

      {/* Cost Info */}
      {pendingScenes.length > 0 && !generating && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coins className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">
                  Kosten: {costInfo.credits.toLocaleString('de-DE')} Credits (~€{costInfo.euros.toFixed(2)})
                </p>
                <p className="text-sm text-muted-foreground">
                  {pendingScenes.length} Szene(n) × {totalDuration}s Gesamtdauer
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Dein Guthaben</p>
              <p className={cn(
                "font-semibold",
                hasEnoughCredits ? "text-green-600" : "text-destructive"
              )}>
                {(balance?.balance || 0).toLocaleString('de-DE')} Credits
              </p>
            </div>
          </div>
          {!hasEnoughCredits && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Du benötigst {(costInfo.credits - (balance?.balance || 0)).toLocaleString('de-DE')} weitere Credits.
              </AlertDescription>
            </Alert>
          )}
        </Card>
      )}

      {/* Beta Info */}
      <Alert className="border-amber-500/20 bg-amber-500/5">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Beta-Hinweis:</strong> Sora 2 ist in der Beta-Phase. Bei Generierungsfehlern werden deine Credits automatisch zurückerstattet. 
          Die Generierung erfolgt sequentiell (1 Szene alle 12 Sekunden) um Rate-Limits zu vermeiden.
        </AlertDescription>
      </Alert>

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
            <p className="text-sm text-amber-600">
              {failedScenes} Szene(n) fehlgeschlagen - Credits wurden automatisch zurückerstattet. Klicke auf Retry um es erneut zu versuchen.
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
              scene.status === 'failed' && 'border-amber-500/50 bg-amber-500/5'
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
                  {scene.status === 'failed' && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Credits erstattet
                    </Badge>
                  )}
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
            {!generating && !allCompleted && pendingScenes.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Klicke auf Start um {pendingScenes.length} Szene(n) zu generieren
              </p>
            )}
            {generating && !allCompleted && (
              <p className="text-sm text-muted-foreground">
                Generierung läuft... Dies kann {Math.ceil(pendingScenes.length * 0.5)} - {pendingScenes.length * 2} Minuten dauern
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
            {!generating && !allCompleted && pendingScenes.length > 0 && (
              <Button onClick={startGeneration} disabled={!hasEnoughCredits}>
                <Play className="h-4 w-4 mr-2" />
                Generierung starten ({costInfo.credits} Credits)
              </Button>
            )}
            {(allCompleted || (completedScenes > 0 && failedScenes > 0)) && (
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
