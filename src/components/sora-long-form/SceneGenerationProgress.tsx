import { useState, useEffect } from 'react';
import { Play, Loader2, Check, X, ArrowLeft, ArrowRight, AlertCircle, Wallet, Link2, ExternalLink, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { getCurrencyForLanguage } from '@/lib/currency';
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
  const { t, language } = useTranslation();
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

  const totalDuration = pendingScenes.reduce((sum, s) => sum + s.duration, 0);
  const currency = getCurrencyForLanguage(language);
  const pricing = MODEL_PRICING[project.model] || MODEL_PRICING['sora-2-standard'];
  const costPerSecond = pricing[currency as keyof typeof pricing] || pricing.EUR;
  const totalCost = totalDuration * costPerSecond;
  const currencySymbol = currency === 'USD' ? '$' : '€';
  const hasEnoughCredits = (wallet?.balance_euros || 0) >= totalCost;

  const firstPendingScene = pendingScenes.length > 0 ? pendingScenes[0] : null;
  const isResume = completedScenes.length > 0 && pendingScenes.length > 0;

  useEffect(() => {
    const generatingIndex = scenes.findIndex(s => s.status === 'generating');
    setCurrentSceneIndex(generatingIndex >= 0 ? generatingIndex : null);
  }, [scenes]);

  useEffect(() => {
    const generatingScenesList = scenes.filter(s => s.status === 'generating' && s.replicate_prediction_id);
    if (generatingScenesList.length === 0) return;

    const pollSceneStatus = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-sora-scene-status', {
          body: { projectId: project.id },
        });
        if (error) return;
        if (data?.updated > 0) refetchWallet();
      } catch (err) {
        console.error('[SceneGenerationProgress] Polling failed:', err);
      }
    };

    const initialTimeout = setTimeout(pollSceneStatus, 30000);
    const interval = setInterval(pollSceneStatus, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [project.id, scenes, refetchWallet]);

  useEffect(() => {
    const channel = supabase
      .channel('scene-chain-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sora_long_form_scenes', filter: `project_id=eq.${project.id}` },
        (payload) => {
          const updated = payload.new as Sora2Scene;
          const newScenes = scenes.map(s => s.id === updated.id ? { ...s, ...updated } : s);
          onUpdateScenesLocal(newScenes);

          if (updated.status === 'completed' || updated.status === 'failed') {
            refetchWallet();
            if (updated.status === 'completed') {
              toast({
                title: t('soraLf.sceneCompleted').replace('{order}', String(updated.scene_order)),
                description: t('soraLf.savedToLibrary'),
              });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [project.id, scenes, refetchWallet, toast, t]);

  const startChainGeneration = async () => {
    if (!hasEnoughCredits) {
      toast({
        title: t('soraLf.insufficientCredits'),
        description: t('soraLf.insufficientCreditsDesc')
          .replace('{symbol}', currencySymbol)
          .replace('{cost}', totalCost.toFixed(2))
          .replace('{balance}', (wallet?.balance_euros || 0).toFixed(2)),
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    await onUpdateProject({ status: 'generating' });

    try {
      const { data, error } = await supabase.functions.invoke('generate-sora-chain', {
        body: { projectId: project.id, model: project.model, aspectRatio: project.aspect_ratio },
      });

      if (error) {
        const errorData = error.context ? await error.context.json?.() : null;
        if (errorData?.code === 'INSUFFICIENT_CREDITS' || errorData?.code === 'NO_WALLET') {
          toast({
            title: t('soraLf.insufficientCredits'),
            description: errorData?.error || t('soraLf.buyMoreCredits'),
            variant: 'destructive',
          });
          setGenerating(false);
          await onUpdateProject({ status: 'draft' });
          return;
        }
        throw error;
      }

      if (data?.code === 'INSUFFICIENT_CREDITS' || data?.code === 'NO_WALLET') {
        toast({ title: t('soraLf.insufficientCredits'), description: data?.error, variant: 'destructive' });
        setGenerating(false);
        await onUpdateProject({ status: 'draft' });
        return;
      }

      toast({
        title: isResume ? t('soraLf.resumeStarted') : t('soraLf.chainStarted'),
        description: data.message,
      });

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
        title: t('soraLf.errorTitle'),
        description: error?.message || t('soraLf.generationError'),
        variant: 'destructive',
      });
      setGenerating(false);
      await onUpdateProject({ status: 'draft' });
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'generating') return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    switch (status) {
      case 'completed': return <Check className="h-5 w-5 text-green-500" />;
      case 'failed': return <X className="h-5 w-5 text-destructive" />;
      default: return <div className="h-5 w-5 rounded-full border-2 border-border" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 gap-1"><Check className="h-3 w-3" />{t('soraLf.inMediaLibrary')}</Badge>;
      case 'failed':
        return <Badge variant="destructive">{t('soraLf.failedBadge')}</Badge>;
      case 'generating':
        return <Badge className="bg-primary animate-pulse">{t('soraLf.generatingBadge')}</Badge>;
      default:
        return <Badge variant="outline">{t('soraLf.waitingBadge')}</Badge>;
    }
  };

  const estimatedTime = pendingScenes.length * 5;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{t('soraLf.generateWithFrameChain')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('soraLf.frameChainSubtitle')}</p>
      </div>

      {pendingScenes.length > 0 && !generating && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">
                  {isResume ? t('soraLf.remainingCost') : t('soraLf.costLabel')}: {currencySymbol}{totalCost.toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('soraLf.scenesTimesSeconds')
                    .replace('{count}', String(pendingScenes.length))
                    .replace('{duration}', String(totalDuration))
                    .replace('{symbol}', currencySymbol)
                    .replace('{price}', costPerSecond.toFixed(2))}
                </p>
                {isResume && (
                  <p className="text-xs text-green-600 mt-1">
                    {t('soraLf.alreadyCompleted').replace('{count}', String(completedScenes.length))}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{t('soraLf.aiVideoCredits')}</p>
              <p className={cn("font-semibold", hasEnoughCredits ? "text-green-600" : "text-destructive")}>
                {currencySymbol}{(wallet?.balance_euros || 0).toFixed(2)}
              </p>
            </div>
          </div>
          {!hasEnoughCredits && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('soraLf.needMoreCredits')
                  .replace('{symbol}', currencySymbol)
                  .replace('{amount}', (totalCost - (wallet?.balance_euros || 0)).toFixed(2))}
                <Button variant="link" className="h-auto p-0 ml-1" onClick={() => navigate('/ai-video-studio')}>
                  {t('soraLf.buyCredits')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </Card>
      )}

      {isResume && !generating && (
        <Alert className="border-green-500/20 bg-green-500/5">
          <RefreshCw className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            <strong>{t('soraLf.smartResume')}</strong> {t('soraLf.smartResumeDesc')
              .replace('{completed}', String(completedScenes.length))
              .replace('{sceneOrder}', String(firstPendingScene?.scene_order))}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-blue-500/20 bg-blue-500/5">
        <Link2 className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>{t('soraLf.frameChainTechInfo')}</strong> {t('soraLf.frameChainTechDesc')}
          {pendingScenes.length > 0 && ` ${t('soraLf.estimatedTimeInfo').replace('{minutes}', String(estimatedTime))}`}
        </AlertDescription>
      </Alert>

      <Alert className="border-amber-500/20 bg-amber-500/5">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>{t('soraLf.betaNotice')}</strong> {t('soraLf.betaNoticeDesc')}
        </AlertDescription>
      </Alert>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('soraLf.progressLabel')}</span>
            <span className="text-sm text-muted-foreground">
              {t('soraLf.scenesProgress')
                .replace('{completed}', String(completedScenes.length))
                .replace('{total}', String(scenes.length))}
              {currentSceneIndex !== null && ` ${t('soraLf.generatingScene').replace('{index}', String(currentSceneIndex + 1))}`}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          {failedScenes.length > 0 && !generating && (
            <p className="text-sm text-amber-600">
              {t('soraLf.failedScenesInfo').replace('{count}', String(failedScenes.length))}
            </p>
          )}
          {generatingScenes.length > 0 && (
            <p className="text-sm text-blue-600 animate-pulse">
              {t('soraLf.sceneGenerating').replace('{index}', String(currentSceneIndex !== null ? currentSceneIndex + 1 : '?'))}
            </p>
          )}
        </div>
      </Card>

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
              <div className="flex-shrink-0">{getStatusIcon(scene.status)}</div>

              <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-muted relative">
                {scene.generated_video_url ? (
                  <video src={scene.generated_video_url} className="w-full h-full object-cover" muted />
                ) : scene.reference_image_url ? (
                  <>
                    <img src={scene.reference_image_url} alt={t('soraLf.sceneLabel').replace('{index}', String(index + 1))} className="w-full h-full object-cover" />
                    {index > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-blue-500/80 text-white text-[8px] text-center py-0.5">Frame-Ref</div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-medium">{index + 1}</div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium">{t('soraLf.sceneLabel').replace('{index}', String(index + 1))}</span>
                  {getStatusBadge(scene.status)}
                  <Badge variant="outline">{scene.duration}s</Badge>
                  {scene.status === 'failed' && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {t('soraLf.refunded')
                        .replace('{symbol}', currencySymbol)
                        .replace('{amount}', (scene.duration * costPerSecond).toFixed(2))}
                    </Badge>
                  )}
                  {index > 0 && (scene.status === 'pending' || scene.status === 'generating') && (
                    <Badge variant="outline" className="text-blue-600 border-blue-600 text-[10px]">
                      <Link2 className="h-3 w-3 mr-1" />
                      Frame-Chain
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{scene.prompt.slice(0, 80)}...</p>
              </div>

              {scene.status === 'completed' && scene.generated_video_url && (
                <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => navigate('/media-library?tab=ai')}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {t('soraLf.mediaLibrary')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            {!generating && !allCompleted && pendingScenes.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {isResume
                  ? t('soraLf.resumeFromScene').replace('{order}', String(firstPendingScene?.scene_order))
                  : t('soraLf.startToGenerate').replace('{count}', String(pendingScenes.length))}
              </p>
            )}
            {generating && !allCompleted && (
              <p className="text-sm text-muted-foreground">{t('soraLf.chainRunning')}</p>
            )}
            {allCompleted && (
              <p className="text-sm text-green-600 font-medium">{t('soraLf.allScenesCompleted')}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} disabled={generating}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('soraLf.back')}
            </Button>
            {!generating && !allCompleted && pendingScenes.length > 0 && (
              <Button onClick={startChainGeneration} disabled={!hasEnoughCredits || walletLoading}>
                {isResume ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('soraLf.resumeFromSceneBtn')
                      .replace('{order}', String(firstPendingScene?.scene_order))
                      .replace('{symbol}', currencySymbol)
                      .replace('{cost}', totalCost.toFixed(2))}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {t('soraLf.startChainBtn')
                      .replace('{symbol}', currencySymbol)
                      .replace('{cost}', totalCost.toFixed(2))}
                  </>
                )}
              </Button>
            )}
            {(allCompleted || (completedScenes.length > 0 && failedScenes.length > 0)) && (
              <Button onClick={onNext}>
                {t('soraLf.nextToTransitions')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
