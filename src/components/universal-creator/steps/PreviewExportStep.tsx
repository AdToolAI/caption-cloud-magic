import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Download, Video, Sparkles, Coins, FolderOpen, Volume2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FormatConfig, ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useCreditReservation } from '@/hooks/useCreditReservation';
import { useCredits } from '@/hooks/useCredits';
import { FEATURE_COSTS, ESTIMATED_COSTS } from '@/lib/featureCosts';
import { mapBackgroundAssetToUniversalVideo } from '@/lib/background-asset-mapper';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';
import { extractFunctionsError } from '@/lib/functionsError';
import { clampAudioVolume } from '@/lib/audioVolume';
import { DEFAULT_SUBTITLE_STYLE, DEFAULT_VOICEOVER_VOLUME, computeTotalDurationSeconds, computeDurationInFrames } from '@/lib/universalCreatorDefaults';
import { buildUniversalCreatorCustomizations, validateScenes } from '@/lib/universalCreatorRenderPayload';
import { RemotionPreviewPlayer } from '@/components/universal-creator/RemotionPreviewPlayer';

interface PreviewExportStepProps {
  formatConfig: FormatConfig;
  contentConfig: ContentConfig;
  subtitleConfig?: SubtitleConfig;
  backgroundAsset?: any;
  projectId: string;
  scenes?: any[];
  selectedMusicUrl?: string | null;
  musicVolume?: number;
  onMusicVolumeChange?: (volume: number) => void;
  onMusicClear?: () => void;
  videoQuality: 'hd' | '4k';
  onVideoQualityChange: (quality: 'hd' | '4k') => void;
}

interface RenderJob {
  id: string;
  format: FormatConfig;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number;
  downloadUrl?: string;
  error?: string;
  renderId?: string; // For realtime tracking
  startedAt?: number;
}

export function PreviewExportStep({
  formatConfig,
  contentConfig,
  subtitleConfig,
  backgroundAsset,
  projectId,
  scenes = [],
  selectedMusicUrl = null,
  musicVolume = 0.3,
  onMusicVolumeChange,
  onMusicClear,
  videoQuality,
  onVideoQualityChange,
}: PreviewExportStepProps) {
  const { t } = useTranslation();
  const [isRendering, setIsRendering] = useState(false);
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<FormatConfig[]>([formatConfig]);
  const [reservationId, setReservationId] = useState<string | null>(null);
  
  const { balance } = useCredits();
  const { reserve, commit, refund } = useCreditReservation();
  
  const qualityMultiplier = videoQuality === '4k' ? 2 : 1;
  const totalCost = selectedFormats.length * ESTIMATED_COSTS.video_render * qualityMultiplier;
  const normalizedMusicVolume = clampAudioVolume(musicVolume);
  const previewMaxWidth = Math.min(920, Math.round(520 * (formatConfig.width / formatConfig.height)));

  // Extract active render IDs to prevent infinite loop
  const activeRenderJobs = useMemo(
    () => renderJobs.filter(j => j.status === 'rendering' && j.renderId),
    [renderJobs]
  );
  const activeRenderIds = useMemo(
    () => activeRenderJobs.map(j => j.renderId!),
    [activeRenderJobs]
  );

  // Realtime subscription for render updates with aggressive fallback polling
  useEffect(() => {
    if (activeRenderIds.length === 0) return;

    const channel = supabase
      .channel('render-progress')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_renders',
        },
        async (payload) => {
          const newData = payload.new as any;

          setRenderJobs(prev => {
            const updated = prev.map(j => {
              if (j.renderId !== newData.render_id) return j;

              if (newData.status === 'completed') {
                toast.success(t('uc.renderCompleted', { platform: j.format.platform }));
                return {
                  ...j,
                  status: 'completed' as const,
                  progress: 100,
                  downloadUrl: newData.video_url
                };
              } else if (newData.status === 'failed') {
                toast.error(t('uc.renderFailed', { platform: j.format.platform }));
                return {
                  ...j,
                  status: 'failed' as const,
                  error: newData.error_message || t('uc.failed')
                };
              }
              return j;
            });

            // Check if all jobs are done (completed or failed)
            const allDone = updated.every(j => j.status === 'completed' || j.status === 'failed');
            if (allDone && reservationId) {
              const successCount = updated.filter(j => j.status === 'completed').length;

              if (successCount > 0) {
                const actualCost = successCount * ESTIMATED_COSTS.video_render;
                commit(reservationId, actualCost).catch(() => undefined);
                toast.success(t('uc.videosRendered', { count: String(successCount), credits: String(actualCost) }));
              } else {
                refund(reservationId, "All renders failed").catch(() => undefined);
                toast.error(t('uc.renderAllFailed'));
              }

              setReservationId(null);
              setIsRendering(false);
            }

            return updated;
          });
        }
      )
      .subscribe();

    // Authoritative progress poll: checks DB + S3 reconciliation + server-side timeout/refund
    const HARD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — matches AWS retry-backoff chain

    const pollDbStatus = async () => {
      try {
        const progressResults = await Promise.all(
          activeRenderJobs.map(async (job) => {
            const { data, error } = await supabase.functions.invoke('check-remotion-progress', {
              body: { render_id: job.renderId, source: 'universal-creator' },
            });
            if (error) throw error;
            return { jobId: job.id, renderId: job.renderId, startedAt: job.startedAt, data };
          })
        );

        setRenderJobs(prev => {
          const updated = prev.map(j => {
            const result = progressResults.find(r => r.renderId === j.renderId);
            if (!result || j.status !== 'rendering') return j;
            const progress = result.data?.progress || {};

            if (result.data?.status === 'completed' && progress.outputFile) {
              toast.success(t('uc.renderCompleted', { platform: j.format.platform }));
              return { ...j, status: 'completed' as const, progress: 100, downloadUrl: progress.outputFile };
            }

            if (result.data?.status === 'failed' || progress.fatalErrorEncountered) {
              const errorMessage = progress.errors?.[0] || result.data?.error || t('uc.failed');
              toast.error(t('uc.renderFailed', { platform: j.format.platform }));
              return { ...j, status: 'failed' as const, progress: 0, error: errorMessage };
            }

            const nextProgress = typeof progress.overallProgress === 'number'
              ? Math.max(j.progress, Math.min(92, Math.round(progress.overallProgress * 100)))
              : j.progress;
            return { ...j, progress: nextProgress };
          });

          // Hard-timeout: mark as failed after 10 minutes
          const timedOut = updated.map(j => {
            const startedAt = j.startedAt || Date.now();
            if (j.status === 'rendering' && Date.now() - startedAt > HARD_TIMEOUT_MS) {
              return { ...j, status: 'failed' as const, progress: 0, error: t('uc.renderTimeout') };
            }
            return j;
          });

          const allDone = timedOut.every(j => j.status === 'completed' || j.status === 'failed');
          if (allDone && reservationId) {
            const successCount = timedOut.filter(j => j.status === 'completed').length;
            if (successCount > 0) {
              const actualCost = successCount * ESTIMATED_COSTS.video_render;
              commit(reservationId, actualCost).catch(() => undefined);
              toast.success(t('uc.videosRendered', { count: String(successCount), credits: String(actualCost) }));
            } else {
              refund(reservationId, 'All renders failed or timed out').catch(() => undefined);
              toast.error(t('uc.renderAllFailed'));
            }
            setReservationId(null);
            setIsRendering(false);
          }

          return timedOut;
        });
      } catch {
        // silent: polling failure is non-fatal, next tick retries
      }
    };

    // Poll immediately, then every 8 seconds
    pollDbStatus();
    const pollIntervalId = setInterval(pollDbStatus, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollIntervalId);
    };
  }, [activeRenderIds.join(','), reservationId]);



  // Additional format options for multi-format export
  const formatOptions: FormatConfig[] = [
    formatConfig, // Original selected format
    { ...formatConfig, platform: 'instagram', aspectRatio: '9:16', width: 1080, height: 1920, fps: formatConfig.fps },
    { ...formatConfig, platform: 'youtube', aspectRatio: '16:9', width: 1920, height: 1080, fps: formatConfig.fps },
    { ...formatConfig, platform: 'tiktok', aspectRatio: '9:16', width: 1080, height: 1920, fps: formatConfig.fps },
    { ...formatConfig, platform: 'facebook', aspectRatio: '1:1', width: 1080, height: 1080, fps: formatConfig.fps },
  ];

  const handleFormatToggle = (format: FormatConfig) => {
    setSelectedFormats(prev => {
      const exists = prev.some(f => 
        f.platform === format.platform && f.aspectRatio === format.aspectRatio
      );
      if (exists) {
        return prev.filter(f => 
          !(f.platform === format.platform && f.aspectRatio === format.aspectRatio)
        );
      } else {
        return [...prev, format];
      }
    });
  };

  const isFormatSelected = (format: FormatConfig) => {
    return selectedFormats.some(f => 
      f.platform === format.platform && f.aspectRatio === format.aspectRatio
    );
  };

  // Single-job start — reused by initial render and per-format retry.
  // Does NOT touch credit reservation: the caller decides.
  const startSingleJob = useCallback(async (
    job: RenderJob,
    sharedCustomizations: any,
    calculatedDuration: number,
  ): Promise<void> => {
    setRenderJobs(prev =>
      prev.map(j =>
        j.id === job.id
          ? { ...j, status: 'rendering', progress: 10, error: undefined, downloadUrl: undefined, renderId: undefined }
          : j
      )
    );

    try {
      const { data, error } = await supabase.functions.invoke('render-with-remotion', {
        body: {
          project_id: projectId,
          component_name: 'UniversalCreatorVideo',
          quality: videoQuality,
          customizations: {
            ...sharedCustomizations,
            voiceoverDuration: calculatedDuration,
          },
          format: 'mp4',
          aspect_ratio: job.format.aspectRatio,
        },
      });

      if (error) {
        const detail = await extractFunctionsError(error);
        const friendly = /idle.?timeout|aborted|timeout|IDLE_TIMEOUT/i.test(detail || '')
          ? t('uc.renderStartSlow')
          : (detail || t('uc.failed'));
        throw new Error(friendly);
      }

      if (data && data.ok === false) {
        const raw = String(data.error || '');
        const friendly = /aborted|timeout|idle/i.test(raw)
          ? t('uc.renderStartSlow')
          : (raw || t('uc.failed'));
        throw new Error(friendly);
      }

      if (!data?.render_id) {
        throw new Error(t('uc.renderIdMissing'));
      }

      setRenderJobs(prev =>
        prev.map(j =>
          j.id === job.id
            ? {
                ...j,
                status: 'rendering',
                progress: 20,
                renderId: data.render_id,
                startedAt: Date.now(),
              }
            : j
        )
      );

      toast.success(t('uc.renderStarted', { platform: job.format.platform }));
    } catch (err: any) {
      setRenderJobs(prev =>
        prev.map(j =>
          j.id === job.id
            ? { ...j, status: 'failed', error: err?.message || String(err) }
            : j
        )
      );
      toast.error(`${t('uc.renderFailed', { platform: job.format.platform })}: ${err?.message || err}`);
    }
  }, [projectId, videoQuality, t]);

  const buildSharedPayload = useCallback(() => {
    const sharedCustomizations = buildUniversalCreatorCustomizations({
      contentConfig,
      subtitleConfig,
      backgroundAsset,
      scenes,
      selectedMusicUrl,
      musicVolume: normalizedMusicVolume,
    });
    const validatedScenes = validateScenes(scenes);
    const calculatedDuration = computeTotalDurationSeconds({
      voiceoverDuration: contentConfig.voiceoverDuration,
      actualVoiceoverDuration: contentConfig.actualVoiceoverDuration,
      scenes: validatedScenes,
    });
    return { sharedCustomizations, validatedScenes, calculatedDuration };
  }, [contentConfig, subtitleConfig, backgroundAsset, scenes, selectedMusicUrl, normalizedMusicVolume]);

  const handleRetryJob = async (jobId: string) => {
    const job = renderJobs.find(j => j.id === jobId);
    if (!job || job.status !== 'failed') return;

    const { sharedCustomizations, validatedScenes, calculatedDuration } = buildSharedPayload();
    if (scenes.length > 0 && validatedScenes.length === 0) {
      toast.error(t('uc.noValidScenes'));
      return;
    }
    if (!Number.isFinite(calculatedDuration) || calculatedDuration <= 0) {
      toast.error(t('uc.invalidDuration'));
      return;
    }

    // Retry uses credits already reserved (or fresh spend if session expired).
    // If no reservation is live any more, reserve just this one format.
    let localReservationId = reservationId;
    if (!localReservationId) {
      try {
        const reservation = await reserve(
          FEATURE_COSTS.VIDEO_RENDER,
          ESTIMATED_COSTS.video_render * qualityMultiplier,
          { project_id: projectId, retry: true, format: `${job.format.platform}-${job.format.aspectRatio}` },
        );
        localReservationId = reservation.reservation_id;
        setReservationId(localReservationId);
      } catch {
        return;
      }
    }

    setIsRendering(true);
    await startSingleJob(job, sharedCustomizations, calculatedDuration);
  };

  const handleRenderVideo = async () => {
    if (selectedFormats.length === 0) {
      toast.error(t('uc.selectAtLeastOneFormat'));
      return;
    }

    // Check credits and reserve
    let freshReservationId: string;
    try {
      const reservation = await reserve(
        FEATURE_COSTS.VIDEO_RENDER,
        totalCost,
        {
          project_id: projectId,
          format_count: selectedFormats.length,
          formats: selectedFormats.map(f => `${f.platform}-${f.aspectRatio}`),
        }
      );
      freshReservationId = reservation.reservation_id;
      setReservationId(freshReservationId);
    } catch {
      // Reserve hook already shows error toast
      return;
    }

    setIsRendering(true);
    const jobs: RenderJob[] = selectedFormats.map(format => ({
      id: crypto.randomUUID(),
      format,
      status: 'pending' as const,
      progress: 0,
    }));
    setRenderJobs(jobs);

    const { sharedCustomizations, validatedScenes, calculatedDuration } = buildSharedPayload();

    if (scenes.length > 0 && validatedScenes.length === 0) {
      toast.error(t('uc.noValidScenes'));
      await refund(freshReservationId, 'No valid scenes').catch(() => undefined);
      setReservationId(null);
      setIsRendering(false);
      return;
    }
    if (!Number.isFinite(calculatedDuration) || calculatedDuration <= 0) {
      toast.error(t('uc.invalidDuration'));
      await refund(freshReservationId, 'Invalid duration').catch(() => undefined);
      setReservationId(null);
      setIsRendering(false);
      return;
    }

    try {
      await Promise.allSettled(
        jobs.map(job => startSingleJob(job, sharedCustomizations, calculatedDuration))
      );

      // If no job successfully started (all failed synchronously), refund immediately.
      setRenderJobs(current => {
        const anyStarted = current.some(j => j.status === 'rendering' && j.renderId);
        if (!anyStarted) {
          refund(freshReservationId, 'All render starts failed').catch(() => undefined);
          setReservationId(null);
          setIsRendering(false);
          toast.error(t('uc.renderAllFailed'));
        }
        return current;
      });
    } catch (error: any) {
      toast.error(`${t('uc.errorPrefix')}: ${error.message}`);
      await refund(freshReservationId, `Error: ${error.message}`).catch(() => undefined);
      setReservationId(null);
      setIsRendering(false);
    }
  };


  const handleDownload = (url: string, platform: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectId}-${platform}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatLabel = (format: FormatConfig) => {
    return `${format.platform.charAt(0).toUpperCase() + format.platform.slice(1)} (${format.aspectRatio})`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">{t('uc.previewAndExport')}</h2>
        <p className="text-muted-foreground">
          {t('uc.renderMultiFormat')}
        </p>
      </div>

      {/* Format Selection */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('uc.selectExportFormats')}</h3>
        <div className="space-y-3">
          {formatOptions.map((format, index) => (
            <div key={index} className="flex items-center space-x-3">
              <Checkbox
                id={`format-${index}`}
                checked={isFormatSelected(format)}
                onCheckedChange={() => handleFormatToggle(format)}
              />
              <Label 
                htmlFor={`format-${index}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span>{formatLabel(format)}</span>
                  <span className="text-sm text-muted-foreground">
                    {format.width}x{format.height} • {format.fps}fps
                  </span>
                </div>
              </Label>
            </div>
          ))}
        </div>
      </Card>

      {/* Video Quality Selection */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          {t('uc.videoQuality')}
        </h3>
        <RadioGroup 
          value={videoQuality} 
          onValueChange={(v) => onVideoQualityChange(v as 'hd' | '4k')}
          className="space-y-3"
        >
          <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="hd" id="quality-hd" />
            <Label htmlFor="quality-hd" className="flex-1 cursor-pointer">
              <div className="font-medium">{t('uc.hdQuality')}</div>
              <div className="text-sm text-muted-foreground">{t('uc.hdDesc')}</div>
            </Label>
            <Badge variant="outline">1x Credits</Badge>
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer">
            <RadioGroupItem value="4k" id="quality-4k" />
            <Label htmlFor="quality-4k" className="flex-1 cursor-pointer">
              <div className="font-medium">{t('uc.fourKQuality')}</div>
              <div className="text-sm text-muted-foreground">{t('uc.fourKDesc')}</div>
            </Label>
            <Badge variant="secondary">2x Credits</Badge>
          </div>
        </RadioGroup>
      </Card>

      {/* Live Preview — identical customizations to the render call */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('uc.preview')}</h3>
        {(contentConfig?.voiceoverUrl || (scenes && scenes.length > 0)) ? (
          <div
            className="mx-auto w-full"
            style={{ maxWidth: `${previewMaxWidth}px` }}
          >
            <RemotionPreviewPlayer
              componentName="UniversalCreatorVideo"
              customizations={buildUniversalCreatorCustomizations({
                contentConfig,
                subtitleConfig,
                backgroundAsset,
                scenes,
                selectedMusicUrl,
                musicVolume: normalizedMusicVolume,
              })}
              width={formatConfig.width}
              height={formatConfig.height}
              durationInFrames={computeDurationInFrames({
                voiceoverDuration: contentConfig?.voiceoverDuration,
                actualVoiceoverDuration: contentConfig?.actualVoiceoverDuration,
                scenes,
              }, formatConfig.fps || 30)}
              fps={formatConfig.fps || 30}
              className="w-full"
            />
          </div>
        ) : (
          <div
            className="bg-muted rounded-lg overflow-hidden flex items-center justify-center text-center p-8"
            style={{ aspectRatio: '16/9', maxHeight: '320px' }}
          >
            <div className="space-y-2">
              <Video className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t('uc.addScenesToSeePreview')}
              </p>
            </div>
          </div>
        )}
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {formatConfig.width}x{formatConfig.height} • {formatConfig.fps}fps
          {contentConfig?.voiceoverConfig?.voiceName && <> • Voice: {contentConfig.voiceoverConfig.voiceName}</>}
          {subtitleConfig?.segments?.length ? <> • {subtitleConfig.segments.length} {t('uc.subtitleSegmentsCount')}</> : null}
        </div>
      </Card>

      {selectedMusicUrl && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold">{t('uc.backgroundMusic')}</h3>
                <p className="text-sm text-muted-foreground">
                  {Math.round(normalizedMusicVolume * 100)}%
                </p>
              </div>
            </div>
            {onMusicClear && (
              <Button type="button" variant="outline" size="sm" onClick={onMusicClear}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('uc.remove')}
              </Button>
            )}
          </div>
          <Slider
            value={[normalizedMusicVolume]}
            onValueChange={([value]) => onMusicVolumeChange?.(value)}
            min={0}
            max={1}
            step={0.01}
          />
        </Card>
      )}

      {/* Credit Balance & Render Button */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{t('uc.yourCredits')}</p>
              <p className="text-2xl font-bold">{balance?.balance || 0}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">{t('uc.renderCost')}</p>
            <p className="text-xl font-semibold text-primary">{totalCost} Credits</p>
            <p className="text-xs text-muted-foreground">
              ({ESTIMATED_COSTS.video_render} {t('uc.perFormat')})
            </p>
          </div>
        </div>
        
        {balance && balance.balance < totalCost && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive font-medium">
              ⚠️ {t('uc.notEnoughCredits')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('uc.needMoreCredits', { count: String(totalCost - balance.balance) })}
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={handleRenderVideo}
          disabled={isRendering || selectedFormats.length === 0 || (balance && balance.balance < totalCost)}
          size="lg"
          className="flex-1"
        >
          {isRendering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('uc.renderingFormats', { count: String(renderJobs.length) })}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {t('uc.renderFormats', { count: String(selectedFormats.length) })}
            </>
          )}
        </Button>
      </div>

      {/* Render Progress */}
      {renderJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">{t('uc.renderStatus')}</h3>
          {renderJobs.map((job, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatLabel(job.format)}</span>
                  <span className={`text-sm ${
                    job.status === 'completed' ? 'text-green-500' :
                    job.status === 'failed' ? 'text-red-500' :
                    job.status === 'rendering' ? 'text-blue-500' :
                    'text-muted-foreground'
                  }`}>
                    {job.status === 'pending' && t('uc.pending')}
                    {job.status === 'rendering' && t('uc.rendering')}
                    {job.status === 'completed' && `✓ ${t('uc.completed')}`}
                    {job.status === 'failed' && `✗ ${t('uc.failed')}`}
                  </span>
                </div>

                {job.status === 'rendering' && (
                  <div className="space-y-2">
                    <Progress value={job.progress} className="w-full" />
                    <p className="text-xs text-muted-foreground">
                      {t('uc.renderingInProgress')}
                    </p>
                  </div>
                )}

                {job.status === 'completed' && job.downloadUrl && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleDownload(job.downloadUrl!, job.format.platform)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('uc.download')}
                    </Button>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => window.location.href = `/ai-post-generator?video_url=${encodeURIComponent(job.downloadUrl!)}`}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t('uc.toAIPost')}
                      </Button>
                      
                      <Button
                        onClick={() => window.location.href = `/universal-directors-cut?source=universal_creator&source_video=${encodeURIComponent(job.downloadUrl!)}&project_id=${projectId}`}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        <Video className="mr-2 h-4 w-4" />
                        {t('uc.toDirectorsCut')}
                      </Button>

                      <Button
                        onClick={() => window.location.href = `/media-library?tab=rendered`}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        {t('uc.toMediaLibrary')}
                      </Button>
                    </div>
                  </div>
                )}

                {job.status === 'failed' && (
                  <div className="space-y-2">
                    {job.error && <p className="text-sm text-red-500">{job.error}</p>}
                    <Button
                      onClick={() => handleRetryJob(job.id)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isRendering}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('uc.retryRender')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Export Summary */}
      <Card className="p-6 bg-muted/50">
        <h3 className="text-lg font-semibold mb-3">{t('uc.exportSummary')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('uc.scriptLength')}:</span>
            <span className="font-medium">
              {contentConfig.scriptText?.split(/\s+/).filter(Boolean).length ?? 0} {t('uc.words')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('uc.voiceoverDuration')}:</span>
            <span className="font-medium">
              {contentConfig.voiceoverDuration?.toFixed(1)}s
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('uc.subtitleSegmentsCount')}:</span>
            <span className="font-medium">{subtitleConfig?.segments?.length ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('uc.selectedFormats')}:</span>
            <span className="font-medium">{selectedFormats.length}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
