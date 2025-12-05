import { useState, useEffect } from 'react';
import { Play, Loader2, Check, X, ArrowLeft, ArrowRight, AlertCircle, Wallet, Link2, ExternalLink, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useNavigate } from 'react-router-dom';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

interface SceneGenerationProgressProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onUpdateScenesLocal: (scenes: Sora2Scene[]) => void;
  onUpdateProject: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

// Pricing per second (same as AI Video Studio)
const MODEL_PRICING = {
  'sora-2-standard': { EUR: 0.25, USD: 0.25 },
  'sora-2-pro': { EUR: 0.53, USD: 0.53 },
};

export function SceneGenerationProgress({
  project,
  scenes,
  onUpdateScenes,
  onUpdateScenesLocal,
  onUpdateProject,
  onNext,
  onBack,
}: SceneGenerationProgressProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { wallet, loading: walletLoading, refetch: refetchWallet } = useAIVideoWallet();
  const [generating, setGenerating] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(null);

  const completedScenes = scenes.filter(s => s.status === 'completed');
  const failedScenes = scenes.filter(s => s.status === 'failed');
  const generatingScenes = scenes.filter(s => s.status === 'generating');
  const pendingScenes = scenes.filter(s => s.status === 'pending' || s.status === 'failed');
  const progress = (completedScenes.length / scenes.length) * 100;
  const allCompleted = completedScenes.length === scenes.length;

  // Calculate cost only for PENDING scenes
  const totalDuration = pendingScenes.reduce((sum, s) => sum + s.duration, 0);
  const currency = wallet?.currency || 'EUR';
  const pricing = MODEL_PRICING[project.model] || MODEL_PRICING['sora-2-standard'];
  const costPerSecond = pricing[currency as keyof typeof pricing] || pricing.EUR;
  const totalCost = totalDuration * costPerSecond;
  const currencySymbol = currency === 'USD' ? '$' : '€';
  const hasEnoughCredits = (wallet?.balance_euros || 0) >= totalCost;

  // Find first pending/failed scene for resume
  const firstPendingScene = pendingScenes.length > 0 ? pendingScenes[0] : null;
  const isResume = completedScenes.length > 0 && pendingScenes.length > 0;

  // Find current generating scene
  useEffect(() => {
    const generatingIndex = scenes.findIndex(s => s.status === 'generating');
    setCurrentSceneIndex(generatingIndex >= 0 ? generatingIndex : null);
  }, [scenes]);

  // Fallback polling for stuck scenes - checks Replicate directly every 30 seconds
  useEffect(() => {
    const generatingScenesList = scenes.filter(s => s.status === 'generating' && s.replicate_prediction_id);
    if (generatingScenesList.length === 0) return;

    const pollSceneStatus = async () => {
      try {
        console.log('[SceneGenerationProgress] Polling scene status for', generatingScenesList.length, 'generating scenes');
        const { data, error } = await supabase.functions.invoke('check-sora-scene-status', {
          body: { projectId: project.id },
        });
        
        if (error) {
          console.error('[SceneGenerationProgress] Polling error:', error);
          return;
        }
        
        if (data?.updated > 0) {
          console.log('[SceneGenerationProgress] Polling updated', data.updated, 'scenes');
          refetchWallet();
          // Scenes will be updated via realtime subscription
        }
      } catch (err) {
        console.error('[SceneGenerationProgress] Polling failed:', err);
      }
    };

    // Initial poll after 30 seconds
    const initialTimeout = setTimeout(pollSceneStatus, 30000);
    
    // Then poll every 30 seconds
    const interval = setInterval(pollSceneStatus, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [project.id, scenes, refetchWallet]);

  // Subscribe to scene updates
  useEffect(() => {
    const channel = supabase
      .channel('scene-chain-updates')
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
          // ✅ CRITICAL: Only update local state, NOT the database!
          onUpdateScenesLocal(newScenes);
          
          // Refetch wallet when scene completes or fails
          if (updated.status === 'completed' || updated.status === 'failed') {
            refetchWallet();
            
            // Show toast for completed scenes
            if (updated.status === 'completed') {
              toast({
                title: `✅ Szene ${updated.scene_order} fertig`,
                description: 'In Mediathek gespeichert',
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project.id, scenes, refetchWallet, toast]);

  const startChainGeneration = async () => {
    if (!hasEnoughCredits) {
      toast({
        title: 'Nicht genügend Guthaben',
        description: `Du benötigst ${currencySymbol}${totalCost.toFixed(2)}, hast aber nur ${currencySymbol}${(wallet?.balance_euros || 0).toFixed(2)}.`,
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    await onUpdateProject({ status: 'generating' });

    try {
      const { data, error } = await supabase.functions.invoke('generate-sora-chain', {
        body: {
          projectId: project.id,
          model: project.model,
          aspectRatio: project.aspect_ratio,
        },
      });

      if (error) {
        const errorData = error.context ? await error.context.json?.() : null;
        if (errorData?.code === 'INSUFFICIENT_CREDITS' || errorData?.code === 'NO_WALLET') {
          toast({
            title: 'Nicht genügend Guthaben',
            description: errorData?.error || 'Bitte kaufe mehr AI Video Credits.',
            variant: 'destructive',
          });
          setGenerating(false);
          await onUpdateProject({ status: 'draft' });
          return;
        }
        throw error;
      }

      if (data?.code === 'INSUFFICIENT_CREDITS' || data?.code === 'NO_WALLET') {
        toast({
          title: 'Nicht genügend Guthaben',
          description: data?.error,
          variant: 'destructive',
        });
        setGenerating(false);
        await onUpdateProject({ status: 'draft' });
        return;
      }

      toast({
        title: isResume ? '🔄 Fortsetzen gestartet' : '🚀 Chain-Generierung gestartet',
        description: data.message,
      });

      // Mark first pending scene as generating (local only)
      if (firstPendingScene) {
        const updatedScenes = scenes.map(s => 
          s.id === firstPendingScene.id ? { ...s, status: 'generating' as const } : s
        );
        onUpdateScenesLocal(updatedScenes);
      }
      
      refetchWallet();
      
    } catch (error: any) {
      console.error('Error starting chain generation:', error);
      toast({
        title: 'Fehler',
        description: error?.message || 'Generierung konnte nicht gestartet werden',
        variant: 'destructive',
      });
      setGenerating(false);
      await onUpdateProject({ status: 'draft' });
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'generating') {
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    }
    switch (status) {
      case 'completed':
        return <Check className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <X className="h-5 w-5 text-destructive" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-border" />;
    }
  };

  const getStatusBadge = (status: string, index: number) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500 gap-1">
            <Check className="h-3 w-3" />
            In Mediathek
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Fehlgeschlagen</Badge>;
      case 'generating':
        return <Badge className="bg-primary animate-pulse">Generiert...</Badge>;
      default:
        return <Badge variant="outline">Wartend</Badge>;
    }
  };

  const estimatedTime = pendingScenes.length * 5;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold">Video-Szenen mit Frame-Chain generieren</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Jede Szene nutzt den letzten Frame der vorherigen Szene für nahtlose Übergänge
        </p>
      </div>

      {/* Cost Info - only show if there are pending scenes */}
      {pendingScenes.length > 0 && !generating && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">
                  {isResume ? 'Restliche Kosten' : 'Kosten'}: {currencySymbol}{totalCost.toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pendingScenes.length} Szene(n) × {totalDuration}s @ {currencySymbol}{costPerSecond.toFixed(2)}/s
                </p>
                {isResume && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ {completedScenes.length} Szene(n) bereits fertig (keine zusätzlichen Kosten)
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">AI Video Guthaben</p>
              <p className={cn(
                "font-semibold",
                hasEnoughCredits ? "text-green-600" : "text-destructive"
              )}>
                {currencySymbol}{(wallet?.balance_euros || 0).toFixed(2)}
              </p>
            </div>
          </div>
          {!hasEnoughCredits && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Du benötigst {currencySymbol}{(totalCost - (wallet?.balance_euros || 0)).toFixed(2)} mehr Guthaben.
                <Button variant="link" className="h-auto p-0 ml-1" onClick={() => navigate('/ai-video-studio')}>
                  Credits kaufen →
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </Card>
      )}

      {/* Resume Info */}
      {isResume && !generating && (
        <Alert className="border-green-500/20 bg-green-500/5">
          <RefreshCw className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            <strong>Intelligentes Fortsetzen:</strong> {completedScenes.length} Szene(n) bereits fertig und in der Mediathek gespeichert.
            Der Generator startet automatisch bei Szene {firstPendingScene?.scene_order} mit Frame-Referenz von der vorherigen Szene.
          </AlertDescription>
        </Alert>
      )}

      {/* Chain Generation Info */}
      <Alert className="border-blue-500/20 bg-blue-500/5">
        <Link2 className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Frame-Chain Technologie:</strong> Jede Szene wird basierend auf dem letzten Frame der vorherigen Szene generiert. 
          Dies sorgt für visuell nahtlose Übergänge. {pendingScenes.length > 0 && `Geschätzte Zeit: ~${estimatedTime} Minuten.`}
        </AlertDescription>
      </Alert>

      {/* Beta Info */}
      <Alert className="border-amber-500/20 bg-amber-500/5">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Beta-Hinweis:</strong> Sora 2 ist in der Beta-Phase. Bei Generierungsfehlern werden deine Credits automatisch zurückerstattet.
          Fertige Szenen bleiben erhalten und du kannst jederzeit fortsetzen.
        </AlertDescription>
      </Alert>

      {/* Progress */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Fortschritt</span>
            <span className="text-sm text-muted-foreground">
              {completedScenes.length} / {scenes.length} Szenen
              {currentSceneIndex !== null && ` (Szene ${currentSceneIndex + 1} wird generiert)`}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          {failedScenes.length > 0 && !generating && (
            <p className="text-sm text-amber-600">
              {failedScenes.length} Szene(n) fehlgeschlagen - Credits wurden automatisch zurückerstattet. Du kannst jederzeit fortsetzen.
            </p>
          )}
          {generatingScenes.length > 0 && (
            <p className="text-sm text-blue-600 animate-pulse">
              Szene {currentSceneIndex !== null ? currentSceneIndex + 1 : '?'} wird generiert... 
              Nach Abschluss wird die Szene in der Mediathek gespeichert.
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
              scene.status === 'failed' && 'border-amber-500/50 bg-amber-500/5',
              scene.status === 'generating' && 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                {getStatusIcon(scene.status)}
              </div>
              
              <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-muted relative">
                {scene.generated_video_url ? (
                  <video
                    src={scene.generated_video_url}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : scene.reference_image_url ? (
                  <>
                    <img
                      src={scene.reference_image_url}
                      alt={`Szene ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {index > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-blue-500/80 text-white text-[8px] text-center py-0.5">
                        Frame-Ref
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">Szene {index + 1}</span>
                  {getStatusBadge(scene.status, index)}
                  <Badge variant="outline">{scene.duration}s</Badge>
                  {scene.status === 'failed' && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {currencySymbol}{(scene.duration * costPerSecond).toFixed(2)} erstattet
                    </Badge>
                  )}
                  {index > 0 && (scene.status === 'pending' || scene.status === 'generating') && (
                    <Badge variant="outline" className="text-blue-600 border-blue-600 text-[10px]">
                      <Link2 className="h-3 w-3 mr-1" />
                      Frame-Chain
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {scene.prompt.slice(0, 80)}...
                </p>
              </div>

              {/* Media Library Link for completed scenes */}
              {scene.status === 'completed' && scene.generated_video_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => navigate('/media-library?tab=ai')}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Mediathek
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
                {isResume 
                  ? `Klicke auf Fortsetzen um ab Szene ${firstPendingScene?.scene_order} weiterzumachen`
                  : `Klicke auf Start um ${pendingScenes.length} Szene(n) zu generieren`
                }
              </p>
            )}
            {generating && !allCompleted && (
              <p className="text-sm text-muted-foreground">
                Chain-Generierung läuft... Fertige Szenen werden automatisch in der Mediathek gespeichert.
              </p>
            )}
            {allCompleted && (
              <p className="text-sm text-green-600 font-medium">
                ✓ Alle Szenen erfolgreich generiert und in der Mediathek gespeichert!
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} disabled={generating}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            {!generating && !allCompleted && pendingScenes.length > 0 && (
              <Button onClick={startChainGeneration} disabled={!hasEnoughCredits || walletLoading}>
                {isResume ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Ab Szene {firstPendingScene?.scene_order} fortsetzen ({currencySymbol}{totalCost.toFixed(2)})
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Chain starten ({currencySymbol}{totalCost.toFixed(2)})
                  </>
                )}
              </Button>
            )}
            {(allCompleted || (completedScenes.length > 0 && failedScenes.length > 0)) && (
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
