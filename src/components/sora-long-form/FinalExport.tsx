import { useState, useEffect, useRef } from 'react';
import { Download, Loader2, Play, ArrowLeft, CheckCircle, ExternalLink, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPriceForLanguage } from '@/lib/currency';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

interface FinalExportProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateProject: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onBack: () => void;
}

export function FinalExport({
  project,
  scenes,
  onUpdateProject,
  onBack,
}: FinalExportProps) {
  const { toast } = useToast();
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [bucketName, setBucketName] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const totalCost = scenes.reduce((sum, s) => sum + s.cost_euros, 0);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const pollRenderStatus = async (renderIdToPoll: string, bucket: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-remotion-progress', {
        body: { renderId: renderIdToPoll, bucketName: bucket, source: 'sora-long-form' },
      });

      if (error) return;

      if (data.done) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        if (data.outputFile) {
          setProgress(100);
          setRenderStatus('completed');

          await onUpdateProject({
            status: 'completed',
            final_video_url: data.outputFile,
            total_cost_euros: totalCost,
          });

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('video_creations').insert({
              user_id: user.id,
              output_url: data.outputFile,
              status: 'completed',
              metadata: {
                source: 'sora-long-form',
                project_id: project.id,
                scene_count: scenes.length,
                total_duration: totalDuration,
                aspect_ratio: project.aspect_ratio,
                model: project.model,
              },
            });
          }

          toast({
            title: t('soraLf.videoSuccess'),
            description: t('soraLf.videoReady').replace('{duration}', String(totalDuration)),
          });

          setRendering(false);
        } else if (data.fatalErrorEncountered) {
          throw new Error(data.errors?.[0]?.message || 'Render failed');
        }
      } else {
        const overallProgress = data.overallProgress || 0;
        setProgress(Math.round(overallProgress * 100));
        setRenderStatus(`Rendering... ${Math.round(overallProgress * 100)}%`);
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  };

  const startFinalRender = async () => {
    setRendering(true);
    setProgress(5);
    setRenderStatus(t('soraLf.initializingRender'));

    const estimatedMinutes = Math.ceil(5 + (scenes.length * 10) / 60);
    setEstimatedTime(estimatedMinutes);

    try {
      await onUpdateProject({ status: 'rendering' });

      const { data, error } = await supabase.functions.invoke('render-long-form-video', {
        body: { projectId: project.id },
      });

      if (error) throw error;

      if (data.status === 'rendering' && data.renderId) {
        setRenderId(data.renderId);
        setBucketName(data.bucketName);
        setProgress(10);
        setRenderStatus(t('soraLf.combiningScenes'));

        setTimeout(() => {
          pollingRef.current = setInterval(() => {
            pollRenderStatus(data.renderId, data.bucketName);
          }, 30000);

          setTimeout(() => {
            pollRenderStatus(data.renderId, data.bucketName);
          }, 30000);
        }, 10000);
      } else if (data.videoUrl) {
        setProgress(100);
        await onUpdateProject({
          status: 'completed',
          final_video_url: data.videoUrl,
          total_cost_euros: totalCost,
        });

        toast({
          title: t('soraLf.videoSuccess'),
          description: t('soraLf.videoReadyDownload'),
        });
        setRendering(false);
      }
    } catch (error) {
      console.error('Render error:', error);
      toast({
        title: t('soraLf.renderFailed'),
        description: error instanceof Error ? error.message : t('soraLf.renderRetry'),
        variant: 'destructive',
      });
      await onUpdateProject({ status: 'failed' });
      setRendering(false);
    }
  };

  const downloadVideo = () => {
    if (project.final_video_url) window.open(project.final_video_url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">{t('soraLf.finalExport')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('soraLf.combineScenes')}</p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {scenes.map((scene, index) => (
          <div key={scene.id} className="relative">
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              {scene.generated_video_url ? (
                <video src={scene.generated_video_url} className="w-full h-full object-cover" muted />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm">{index + 1}</div>
              )}
            </div>
            <Badge variant="outline" className="absolute bottom-1 left-1 text-[10px] px-1">
              {scene.duration}s
            </Badge>
          </div>
        ))}
      </div>

      <Card className="p-6">
        <h4 className="font-semibold mb-4">{t('soraLf.summary')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('soraLf.totalDurationLabel')}</p>
            <p className="text-xl font-bold">{totalDuration} {t('soraLf.sec')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('soraLf.scenesLabel')}</p>
            <p className="text-xl font-bold">{scenes.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('soraLf.formatLabel')}</p>
            <p className="text-xl font-bold">{project.aspect_ratio}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('soraLf.totalCostLabel')}</p>
            <p className="text-xl font-bold text-primary">{formatPriceForLanguage(totalCost, language)}</p>
          </div>
        </div>
      </Card>

      {project.status === 'completed' && project.final_video_url ? (
        <Card className="p-6 border-green-500/50 bg-green-500/5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-green-600">{t('soraLf.videoSuccess')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('soraLf.videoReady').replace('{duration}', String(totalDuration))}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadVideo}>
                <Download className="h-4 w-4 mr-2" />
                {t('soraLf.download')}
              </Button>
              <Button onClick={() => navigate('/media-library?tab=rendered')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('soraLf.toMediaLibrary')}
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <video src={project.final_video_url} controls className="w-full rounded-lg" />
          </div>
        </Card>
      ) : rendering ? (
        <Card className="p-6 border-cyan-500/50 bg-cyan-500/5">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-cyan-500 animate-spin" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-cyan-600">{t('soraLf.renderingInProgress')}</h4>
                <p className="text-sm text-muted-foreground">
                  {renderStatus || t('soraLf.scenesBeingCombined').replace('{count}', String(scenes.length))}
                </p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm">{t('soraLf.estimatedMinutes').replace('{min}', String(estimatedTime))}</span>
              </div>
            </div>

            <Progress value={progress} className="h-2" />

            <p className="text-xs text-muted-foreground text-center">
              {t('soraLf.renderTimeInfo')
                .replace('{min}', String(estimatedTime))
                .replace('{max}', String(estimatedTime + 5))}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">{t('soraLf.readyToRender')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('soraLf.scenesBeingCombined').replace('{count}', String(scenes.length))}
              </p>
            </div>
            <Button size="lg" onClick={startFinalRender} disabled={rendering}>
              <Play className="h-4 w-4 mr-2" />
              {t('soraLf.renderVideo')}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack} disabled={rendering}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('soraLf.backToTransitions')}
        </Button>
      </div>
    </div>
  );
}
