import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, Palette, Type, CheckCircle, AlertCircle, Sparkles, FolderOpen, Scissors, Film } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import ColorGradingSelector from './ColorGradingSelector';
import WatermarkEditor from './WatermarkEditor';
import ComposerSequencePreview from './ComposerSequencePreview';
import type { AssemblyConfig, ComposerScene, WatermarkConfig } from '@/types/video-composer';
import { DEFAULT_WATERMARK_CONFIG, getClipCost } from '@/types/video-composer';
import { persistAssemblyConfig } from '@/hooks/useComposerPersistence';

interface AssemblyTabProps {
  project: any;
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  scenes: ComposerScene[];
}

type RenderStatus = 'idle' | 'pending' | 'rendering' | 'completed' | 'failed';

const POLL_INTERVAL_MS = 4000;
const FIRST_POLL_DELAY_MS = 600; // start almost immediately
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 min

// Fallback dictionary so we NEVER leak raw "videoComposer.xxx" keys into the UI
// even if a translation is missing. Used in conjunction with the t() helper.
const FALLBACKS: Record<string, string> = {
  finalRender: 'Final Render',
  renderingNow: 'Rendering läuft',
  renderProgressBadge: 'Live',
  lambdaStarting: 'Lambda startet …',
  framesRendering: 'Frames werden gerendert …',
  encodingUploading: 'Video wird kodiert & hochgeladen …',
  renderingPercent: 'Video wird gerendert … {{percent}}%',
  videoReady: 'Dein Video ist fertig',
  videoReadyDesc: 'Vorschau, Download oder direkt in der Mediathek öffnen.',
  download: 'Herunterladen',
  savedToLibrary: 'In Mediathek gespeichert',
  savedToLibraryDesc: 'Du findest dieses Video jetzt in der Mediathek.',
  viewInLibrary: 'Mediathek öffnen',
  takingLonger: 'Dauert länger als üblich',
  checkLaterDesc: 'Du kannst die Seite verlassen und später wieder öffnen — der Status wird aus der Datenbank geladen.',
  renderFailed: 'Rendering fehlgeschlagen',
  error: 'Fehler',
  renderIdShort: 'Render-ID',
  clipsNotReady: 'Clips nicht bereit',
  generateClipsFirst: 'Bitte generiere zuerst alle Clips im Clips-Tab.',
  renderStarted: 'Video-Rendering gestartet! 🎬',
  renderVideo: 'Video rendern',
};

export default function AssemblyTab({ project, assemblyConfig, onUpdateAssembly, scenes }: AssemblyTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Safe translation: returns fallback whenever the resolved value still equals the key.
  const tt = (shortKey: string, params?: Record<string, string | number>): string => {
    const fullKey = `videoComposer.${shortKey}`;
    const raw = t(fullKey, params);
    if (typeof raw === 'string' && raw !== fullKey) return raw;
    let fb = FALLBACKS[shortKey] ?? shortKey;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        fb = fb.replace(`{${k}}`, String(v)).replace(`{{${k}}}`, String(v));
      }
    }
    return fb;
  };

  const [isRendering, setIsRendering] = useState(false);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(project?.outputUrl || null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [longRunning, setLongRunning] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const pollTimerRef = useRef<number | null>(null);
  const pollStartRef = useRef<number>(0);
  const hydratedRef = useRef(false);

  const clipCost = scenes.reduce((sum, s) => sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds), 0);
  const voCost = assemblyConfig.voiceover?.enabled ? 0.05 : 0;
  const renderCost = 0.10;
  const totalCost = clipCost + voCost + renderCost;

  const readyClips = scenes.filter(s => s.clipStatus === 'ready' && s.clipUrl);
  const allReady = readyClips.length === scenes.length && scenes.length > 0;

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  // Hydrate completed video from project
  useEffect(() => {
    if (project?.outputUrl && !videoUrl) {
      setVideoUrl(project.outputUrl);
      setRenderStatus('completed');
      setProgress(100);
    }
  }, [project?.outputUrl]);

  // ─── Resume in-flight render on mount / project switch ────────────────
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!project?.id) return;
    if (videoUrl) return; // already done
    hydratedRef.current = true;

    (async () => {
      try {
        const { data: row } = await supabase
          .from('video_renders')
          .select('render_id, status, video_url, error_message, started_at')
          .eq('project_id', project.id)
          .eq('source', 'composer')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!row) return;

        if (row.status === 'completed' && row.video_url) {
          setVideoUrl(row.video_url);
          setRenderStatus('completed');
          setProgress(100);
          return;
        }

        if (row.status === 'failed') {
          setRenderStatus('failed');
          setRenderError(row.error_message || tt('renderFailed'));
          return;
        }

        if ((row.status === 'rendering' || row.status === 'pending') && row.render_id) {
          // Resume polling
          const startedMs = row.started_at ? new Date(row.started_at).getTime() : Date.now();
          pollStartRef.current = startedMs;
          setRenderId(row.render_id);
          setRenderStatus('rendering');
          setIsRendering(true);
          setProgress(prev => Math.max(prev, 4)); // visible baseline
          pollRenderStatus(row.render_id);
        }
      } catch (err) {
        console.warn('[AssemblyTab] resume hydration failed:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const pollRenderStatus = async (rid: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-remotion-progress', {
        body: { render_id: rid, source: 'composer' },
      });

      if (error) {
        console.warn('[AssemblyTab] check-remotion-progress error:', error);
      }

      if (data) {
        const prog = data.progress || {};
        const reportedPct = Math.max(0, Math.min(100, Math.round((prog.overallProgress ?? 0) * 100)));
        // Keep the bar moving forward; never go backwards mid-render
        setProgress(prev => Math.max(prev, reportedPct, 4));

        // Fatal error from Lambda
        if (prog.fatalErrorEncountered) {
          const errMsg = (Array.isArray(prog.errors) && prog.errors[0]?.message) || (Array.isArray(prog.errors) && prog.errors[0]) || tt('renderFailed');
          const msgStr = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          setRenderStatus('failed');
          setRenderError(msgStr);
          setIsRendering(false);
          stopPolling();
          toast({ title: tt('renderFailed'), description: msgStr, variant: 'destructive' });
          return;
        }

        // Done — fetch final URL from DB
        if (prog.done || data.status === 'completed') {
          const { data: row } = await supabase
            .from('video_renders')
            .select('status, video_url, error_message')
            .eq('render_id', rid)
            .maybeSingle();

          const finalUrl = row?.video_url || prog.outputFile || null;
          if (finalUrl) {
            setProgress(100);
            setRenderStatus('completed');
            setVideoUrl(finalUrl);
            setIsRendering(false);
            stopPolling();
            toast({ title: tt('videoReady'), description: tt('videoReadyDesc') });
            setTimeout(() => {
              toast({ title: tt('savedToLibrary'), description: tt('savedToLibraryDesc') });
            }, 800);
            return;
          }
          if (row?.status === 'failed') {
            const msg = row.error_message || tt('renderFailed');
            setRenderStatus('failed');
            setRenderError(msg);
            setIsRendering(false);
            stopPolling();
            toast({ title: tt('renderFailed'), description: msg, variant: 'destructive' });
            return;
          }
        }

        setRenderStatus('rendering');
      }
    } catch (err) {
      console.warn('[AssemblyTab] poll exception:', err);
    }

    const elapsed = Date.now() - pollStartRef.current;
    if (elapsed >= MAX_POLL_DURATION_MS) {
      setLongRunning(true);
      stopPolling();
      return;
    }
    pollTimerRef.current = window.setTimeout(() => pollRenderStatus(rid), POLL_INTERVAL_MS);
  };

  const handleRender = async () => {
    if (!allReady) {
      toast({ title: tt('clipsNotReady'), description: tt('generateClipsFirst'), variant: 'destructive' });
      return;
    }

    setIsRendering(true);
    setRenderError(null);
    setVideoUrl(null);
    setLongRunning(false);
    setRenderStatus('pending');
    setRenderId(null);
    setProgress(4); // immediate visible baseline so the bar is never empty

    try {
      // CRITICAL: synchronously flush latest assemblyConfig to the DB before
      // invoking the edge function. The compose-video-assemble function reads
      // assembly_config from the DB, so any in-memory voiceover/music/subtitle
      // changes that haven't been debounce-persisted yet would otherwise be
      // missing → silent video export.
      if (project?.id && assemblyConfig) {
        try {
          await persistAssemblyConfig(project.id, assemblyConfig);
        } catch (flushErr) {
          console.warn('[AssemblyTab] pre-render assembly flush failed:', flushErr);
        }
      }

      const { data, error } = await supabase.functions.invoke('compose-video-assemble', {
        body: { projectId: project?.id },
      });

      if (error) {
        let detailedMessage = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) detailedMessage = body.error;
          } else if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            if (txt) detailedMessage = txt;
          }
        } catch { /* ignore */ }
        throw new Error(detailedMessage);
      }
      if (!data?.success) throw new Error(data?.error || tt('renderFailed'));

      const rid: string = data.renderId;
      setRenderId(rid);
      setRenderStatus('rendering');
      toast({
        title: tt('renderStarted'),
        description: `${data.scenesCount} ${t('videoComposer.scenes')} · ${Math.round(data.totalDuration)}s`,
      });

      // Start polling almost immediately so the bar starts moving fast
      pollStartRef.current = Date.now();
      pollTimerRef.current = window.setTimeout(() => pollRenderStatus(rid), FIRST_POLL_DELAY_MS);
    } catch (err: any) {
      setRenderError(err.message);
      setRenderStatus('failed');
      setIsRendering(false);
      toast({ title: tt('renderFailed'), description: err.message, variant: 'destructive' });
    }
  };

  const isPolling = isRendering && (renderStatus === 'pending' || renderStatus === 'rendering');

  const stageLabel = useMemo(() => {
    if (progress < 5) return tt('lambdaStarting');
    if (progress < 95) return tt('framesRendering');
    return tt('encodingUploading');
  }, [progress, t]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Color Grading */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> {t('videoComposer.colorGrading')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColorGradingSelector
            value={assemblyConfig.colorGrading}
            onChange={(v) => onUpdateAssembly({ colorGrading: v })}
          />
        </CardContent>
      </Card>

      {/* Transitions hint — handled in Director's Cut */}
      <Card className="border-border/40 bg-card/40">
        <CardContent className="py-3 flex items-start gap-2">
          <Scissors className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('videoComposer.transitionsRemovedHint')}
          </p>
        </CardContent>
      </Card>

      {/* Kinetic Text */}
      <Card className="border-border/40 bg-card/80">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">{t('videoComposer.kineticTypography')}</p>
                <p className="text-[10px] text-muted-foreground">{t('videoComposer.kineticDesc')}</p>
              </div>
            </div>
            <Switch
              checked={assemblyConfig.kineticText}
              onCheckedChange={(v) => onUpdateAssembly({ kineticText: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Watermark */}
      <WatermarkEditor
        value={assemblyConfig.watermark ?? DEFAULT_WATERMARK_CONFIG}
        onChange={(wm: WatermarkConfig) => onUpdateAssembly({ watermark: wm })}
      />

      {/* Full Video Preview — uses the same sequence player as the Voiceover tab.
          Image scenes get Ken-Burns; videos play with crossfades; voiceover audio plays in sync. */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            {t('videoComposer.previewFullVideo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ComposerSequencePreview
            scenes={scenes}
            subtitles={assemblyConfig.subtitles}
            voiceoverUrl={assemblyConfig.voiceover?.audioUrl ?? null}
            globalTextOverlays={
              assemblyConfig.textOverlaysEnabled === false
                ? []
                : (assemblyConfig.globalTextOverlays ?? [])
            }
          />
        </CardContent>
      </Card>

      {/* Cost Summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold mb-3">{t('videoComposer.costSummary')}</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{scenes.length} {t('videoComposer.clips')} ({readyClips.length} {t('videoComposer.clipsReady')})</span>
              <span>€{clipCost.toFixed(2)}</span>
            </div>
            {assemblyConfig.voiceover?.enabled && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('videoComposer.voiceover')}</span>
                <span>€{voCost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('videoComposer.rendering')}</span>
              <span>€{renderCost.toFixed(2)}</span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex justify-between font-semibold text-sm">
              <span>{t('videoComposer.total')}</span>
              <span className="text-primary">€{totalCost.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── FINAL RENDER PANEL ─────────────────────────────────────── */}
      {(isPolling || renderStatus === 'completed' || renderStatus === 'failed') && (
        <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {tt('finalRender')}
              </CardTitle>
              {isPolling && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-primary/15 text-primary border border-primary/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  {tt('renderProgressBadge')}
                </span>
              )}
              {renderStatus === 'completed' && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  <CheckCircle className="h-3 w-3" />
                  {tt('savedToLibrary')}
                </span>
              )}
              {renderStatus === 'failed' && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-destructive/15 text-destructive border border-destructive/30">
                  <AlertCircle className="h-3 w-3" />
                  {tt('error')}
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="py-5 space-y-4">
            {/* IN-FLIGHT */}
            {isPolling && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
                    <p className="text-sm font-medium truncate">{stageLabel}</p>
                  </div>
                  <span className="text-2xl font-bold text-primary tabular-nums leading-none">
                    {progress}<span className="text-sm font-medium text-muted-foreground">%</span>
                  </span>
                </div>
                <Progress value={progress} className="h-3" />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {renderId ? `${tt('renderIdShort')}: ${renderId.slice(0, 8)}…` : ''}
                  </span>
                  {longRunning && <span className="text-amber-500">— {tt('takingLonger')}</span>}
                </div>
              </>
            )}

            {/* SUCCESS */}
            {renderStatus === 'completed' && videoUrl && (
              <>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{tt('videoReady')}</p>
                    <p className="text-xs text-muted-foreground">{tt('videoReadyDesc')}</p>
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden bg-black border border-border/40 shadow-lg">
                  <video
                    src={videoUrl}
                    controls
                    className="w-full h-auto max-h-[480px] object-contain bg-black"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/mediathek')}
                    className="gap-2"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {tt('viewInLibrary')}
                  </Button>
                  <Button asChild size="sm" className="gap-2">
                    <a href={videoUrl} download target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" /> {tt('download')}
                    </a>
                  </Button>
                </div>
              </>
            )}

            {/* FAILED */}
            {renderStatus === 'failed' && renderError && (
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{tt('renderFailed')}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words mt-1">{renderError}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Long-running notice */}
      {longRunning && !videoUrl && renderStatus !== 'failed' && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">{tt('takingLonger')}</p>
              <p className="text-[10px] text-muted-foreground">{tt('checkLaterDesc')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Render Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleRender}
          disabled={isRendering || !allReady}
          className="gap-2"
        >
          {isRendering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {tt('renderingPercent', { percent: progress })}
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> {tt('renderVideo')} (€{totalCost.toFixed(2)})
            </>
          )}
        </Button>
      </div>
      {!allReady && scenes.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-right">
          {readyClips.length}/{scenes.length} {t('videoComposer.clipsReady')} — {t('videoComposer.allClipsMustBeReady')}
        </p>
      )}
    </div>
  );
}
