import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ComposerScene } from '@/types/video-composer';

export type PipelineStatus =
  | 'idle'
  | 'queueing'
  | 'generating'
  | 'stitching'
  | 'ready'
  | 'partial'
  | 'failed';

export interface PipelineRun {
  id: string;
  status: PipelineStatus;
  total_scenes: number;
  completed_scenes: number;
  failed_scenes: number;
  stitched_video_url: string | null;
  destination: 'directors_cut' | 'library' | 'download';
  error_message: string | null;
}

interface Options {
  projectId?: string;
  scenes: ComposerScene[];
  /** Triggers existing "Generate All" handler. Resolves when generation kick-off completes. */
  onGenerateAll: () => Promise<void> | void;
  /** Returns true if all scenes are ready / uploaded. */
  isAllReady: () => boolean;
  /** Latest pending count. */
  pendingCount: number;
  failedCount: number;
}

/**
 * useMultiSceneRender — orchestrates the full Composer pipeline:
 *  generate-all → wait until all scenes ready → stitch → expose video URL
 * Persists run state in `composer_pipeline_runs` for resumability + analytics.
 */
export function useMultiSceneRender(opts: Options) {
  const { projectId, scenes, onGenerateAll, isAllReady, pendingCount, failedCount } = opts;

  const [run, setRun] = useState<PipelineRun | null>(null);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [renderId, setRenderId] = useState<string | null>(null);
  const [stitchProgress, setStitchProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const stitchStartedRef = useRef(false);
  const destinationRef = useRef<'directors_cut' | 'library' | 'download'>('directors_cut');

  const overallProgress = (() => {
    const total = scenes.length || 1;
    const done = scenes.filter(
      (s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl)
    ).length;
    const generationPart = (done / total) * 70; // generation phase = 70 % of bar
    let stitchPart = 0;
    if (status === 'stitching') stitchPart = (stitchProgress / 100) * 30;
    if (status === 'ready' || status === 'partial') stitchPart = 30;
    return Math.min(100, Math.round(generationPart + stitchPart));
  })();

  /** Create / fetch pipeline run row. */
  const ensureRun = useCallback(
    async (destination: 'directors_cut' | 'library' | 'download', allowPartial: boolean) => {
      if (!projectId) return null;
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return null;
      const { data, error: insErr } = await supabase
        .from('composer_pipeline_runs')
        .insert({
          project_id: projectId,
          user_id: uid,
          status: 'queued',
          total_scenes: scenes.length,
          destination,
          allow_partial: allowPartial,
        })
        .select('*')
        .single();
      if (insErr) {
        console.error('[useMultiSceneRender] insert run failed', insErr);
        toast.error('Pipeline konnte nicht gestartet werden.');
        return null;
      }
      setRun(data as any);
      return data as any;
    },
    [projectId, scenes.length]
  );

  const updateRun = useCallback(
    async (patch: Partial<PipelineRun>) => {
      if (!run?.id) return;
      await supabase.from('composer_pipeline_runs').update(patch).eq('id', run.id);
      setRun((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [run?.id]
  );

  /** Trigger stitch via edge function once all scenes are ready. */
  const triggerStitch = useCallback(
    async (allowPartial: boolean) => {
      if (!projectId || stitchStartedRef.current) return;
      stitchStartedRef.current = true;
      setStatus('stitching');
      setStitchProgress(2);
      try {
        const { data, error: invErr } = await supabase.functions.invoke(
          'compose-stitch-and-handoff',
          {
            body: {
              projectId,
              destination: destinationRef.current,
              allowPartial,
              runId: run?.id,
            },
          }
        );
        if (invErr) throw invErr;
        if (!data?.success) throw new Error(data?.error || 'Stitching fehlgeschlagen');
        setRenderId(data.renderId);
        toast.success(`Stitching gestartet — ${data.scenesCount} Szenen`);
      } catch (e: any) {
        console.error('[useMultiSceneRender] stitch failed', e);
        const msg = e?.message || 'Stitching fehlgeschlagen';
        setError(msg);
        setStatus('failed');
        await updateRun({ status: 'failed', error_message: msg });
        stitchStartedRef.current = false;
        toast.error(msg);
      }
    },
    [projectId, run?.id, updateRun]
  );

  /** Poll Remotion render progress while stitching. */
  useEffect(() => {
    if (status !== 'stitching' || !renderId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const { data, error: pErr } = await supabase.functions.invoke('check-remotion-progress', {
          body: { renderId },
        });
        if (cancelled) return;
        if (pErr) throw pErr;
        const pct = Math.round((data?.overallProgress ?? data?.progress ?? 0) * 100);
        setStitchProgress(Math.max(stitchProgress, pct));
        if (data?.done && data?.outputFile) {
          setVideoUrl(data.outputFile);
          const finalStatus: PipelineStatus = failedCount > 0 ? 'partial' : 'ready';
          setStatus(finalStatus);
          await updateRun({
            status: finalStatus,
            stitched_video_url: data.outputFile,
            completed_at: new Date().toISOString() as any,
          });
          toast.success('🎬 Video bereit!');
          return;
        }
        if (data?.errors?.length) {
          throw new Error(data.errors[0]?.message || 'Render error');
        }
        pollRef.current = window.setTimeout(poll, 4000);
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useMultiSceneRender] poll failed', e);
        const msg = e?.message || 'Render fehlgeschlagen';
        setError(msg);
        setStatus('failed');
        await updateRun({ status: 'failed', error_message: msg });
      }
    };
    pollRef.current = window.setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, renderId]);

  /** When generation finishes, auto-trigger stitch. */
  useEffect(() => {
    if (status !== 'generating') return;
    if (pendingCount > 0) return; // still generating
    // pendingCount === 0 → either all ready or only failed remain
    if (isAllReady()) {
      triggerStitch(false);
    } else if (failedCount > 0) {
      // pause for user decision
      setStatus('partial');
    }
  }, [status, pendingCount, failedCount, isAllReady, triggerStitch]);

  /** Public: start full pipeline. */
  const startPipeline = useCallback(
    async (destination: 'directors_cut' | 'library' | 'download' = 'directors_cut') => {
      if (!projectId) {
        toast.error('Projekt wird gespeichert — bitte erneut versuchen.');
        return;
      }
      destinationRef.current = destination;
      stitchStartedRef.current = false;
      setError(null);
      setVideoUrl(null);
      setStitchProgress(0);
      setRenderId(null);
      await ensureRun(destination, false);

      if (isAllReady()) {
        // Skip to stitching
        setStatus('stitching');
        triggerStitch(false);
        return;
      }

      setStatus('queueing');
      try {
        await onGenerateAll();
        setStatus('generating');
        await updateRun({ status: 'generating' });
      } catch (e: any) {
        const msg = e?.message || 'Generierung fehlgeschlagen';
        setError(msg);
        setStatus('failed');
        await updateRun({ status: 'failed', error_message: msg });
      }
    },
    [projectId, isAllReady, onGenerateAll, ensureRun, triggerStitch, updateRun]
  );

  const continueWithPartial = useCallback(() => {
    triggerStitch(true);
  }, [triggerStitch]);

  const reset = useCallback(() => {
    setStatus('idle');
    setRun(null);
    setRenderId(null);
    setStitchProgress(0);
    setVideoUrl(null);
    setError(null);
    stitchStartedRef.current = false;
  }, []);

  return {
    status,
    run,
    overallProgress,
    stitchProgress,
    videoUrl,
    error,
    startPipeline,
    continueWithPartial,
    reset,
    destination: destinationRef.current,
  };
}
