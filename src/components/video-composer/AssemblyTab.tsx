import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, Palette, Film, Type, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import ColorGradingSelector from './ColorGradingSelector';
import type { AssemblyConfig, ComposerScene, TransitionStyle } from '@/types/video-composer';
import { getClipCost } from '@/types/video-composer';

interface AssemblyTabProps {
  project: any;
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  scenes: ComposerScene[];
}

type RenderStatus = 'idle' | 'pending' | 'rendering' | 'completed' | 'failed';

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 min

export default function AssemblyTab({ project, assemblyConfig, onUpdateAssembly, scenes }: AssemblyTabProps) {
  const { t } = useTranslation();
  const [isRendering, setIsRendering] = useState(false);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(project?.outputUrl || null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [longRunning, setLongRunning] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const pollTimerRef = useRef<number | null>(null);
  const pollStartRef = useRef<number>(0);

  // Hydrate from project on mount/changes
  useEffect(() => {
    if (project?.outputUrl && !videoUrl) {
      setVideoUrl(project.outputUrl);
      setRenderStatus('completed');
    }
  }, [project?.outputUrl]);

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
        const pct = Math.max(0, Math.min(100, Math.round((prog.overallProgress ?? 0) * 100)));
        setProgress(pct);

        // Fatal error from Lambda
        if (prog.fatalErrorEncountered) {
          const errMsg = (Array.isArray(prog.errors) && prog.errors[0]?.message) || (Array.isArray(prog.errors) && prog.errors[0]) || t('videoComposer.renderFailed');
          const msgStr = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
          setRenderStatus('failed');
          setRenderError(msgStr);
          setIsRendering(false);
          stopPolling();
          toast({ title: t('videoComposer.renderFailed'), description: msgStr, variant: 'destructive' });
          return;
        }

        // Done — fetch final URL from DB (storage URL is the canonical source)
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
            toast({
              title: t('videoComposer.videoReady') || 'Video fertig',
              description: t('videoComposer.videoReadyDesc') || 'Dein Video kann angesehen und heruntergeladen werden.',
            });
            setTimeout(() => {
              toast({
                title: t('videoComposer.savedToLibrary') || 'In Mediathek gespeichert',
                description: t('videoComposer.savedToLibraryDesc') || 'Du findest dein Video jetzt auch in der Mediathek.',
              });
            }, 800);
            return;
          }
          if (row?.status === 'failed') {
            const msg = row.error_message || t('videoComposer.renderFailed');
            setRenderStatus('failed');
            setRenderError(msg);
            setIsRendering(false);
            stopPolling();
            toast({ title: t('videoComposer.renderFailed'), description: msg, variant: 'destructive' });
            return;
          }
        }

        setRenderStatus('rendering');
      }
    } catch (err) {
      console.warn('[AssemblyTab] poll exception:', err);
    }

    // Continue polling
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
      toast({ title: t('videoComposer.clipsNotReady'), description: t('videoComposer.generateClipsFirst'), variant: 'destructive' });
      return;
    }

    setIsRendering(true);
    setRenderError(null);
    setVideoUrl(null);
    setLongRunning(false);
    setRenderStatus('pending');
    setRenderId(null);
    setProgress(0);

    try {
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
      if (!data?.success) throw new Error(data?.error || t('videoComposer.renderFailed'));

      const rid: string = data.renderId;
      setRenderId(rid);
      setRenderStatus('rendering');
      toast({
        title: t('videoComposer.renderStarted'),
        description: `${data.scenesCount} ${t('videoComposer.scenes')} · ${Math.round(data.totalDuration)}s`,
      });

      // Start polling
      pollStartRef.current = Date.now();
      pollTimerRef.current = window.setTimeout(() => pollRenderStatus(rid), POLL_INTERVAL_MS);
    } catch (err: any) {
      setRenderError(err.message);
      setRenderStatus('failed');
      setIsRendering(false);
      toast({ title: t('videoComposer.renderFailed'), description: err.message, variant: 'destructive' });
    }
  };

  const isPolling = isRendering && (renderStatus === 'pending' || renderStatus === 'rendering');

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

      {/* Transition Style */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" /> {t('videoComposer.transitionStyle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(['fade', 'crossfade', 'wipe', 'slide', 'zoom', 'none'] as TransitionStyle[]).map((tr) => (
              <button
                key={tr}
                onClick={() => onUpdateAssembly({ transitionStyle: tr })}
                className={`p-2 rounded-lg border text-center transition-all ${
                  assemblyConfig.transitionStyle === tr
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 hover:border-border text-muted-foreground'
                }`}
              >
                <p className="text-xs font-medium capitalize">{tr}</p>
              </button>
            ))}
          </div>
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

      {/* Polling: live status */}
      {isPolling && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('videoComposer.lambdaRendering') || 'Lambda rendert …'}</p>
              <p className="text-[10px] text-muted-foreground">
                {renderId ? `${t('videoComposer.renderIdShort')}: ${renderId.slice(0, 8)}…` : ''}
                {longRunning && ' — ' + (t('videoComposer.takingLonger') || 'Dauert länger als erwartet')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Long-running notice (after timeout) */}
      {longRunning && !videoUrl && renderStatus !== 'failed' && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('videoComposer.takingLonger') || 'Render dauert länger als erwartet'}</p>
              <p className="text-[10px] text-muted-foreground">
                {t('videoComposer.checkLaterDesc') || 'Du kannst die Seite verlassen und später wieder öffnen — der Status wird aus der Datenbank geladen.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success: video preview + download */}
      {renderStatus === 'completed' && videoUrl && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t('videoComposer.videoReady') || 'Video fertig'}</p>
                <p className="text-[10px] text-muted-foreground">{t('videoComposer.videoReadyDesc') || 'Vorschau und Download verfügbar.'}</p>
              </div>
            </div>
            <div className="rounded-lg overflow-hidden bg-black">
              <video src={videoUrl} controls className="w-full h-auto" />
            </div>
            <div className="flex justify-end">
              <Button asChild size="sm" className="gap-2">
                <a href={videoUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" /> {t('videoComposer.download') || 'Herunterladen'}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failure */}
      {renderStatus === 'failed' && renderError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t('videoComposer.error')}</p>
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">{renderError}</p>
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
              <Loader2 className="h-4 w-4 animate-spin" /> {t('videoComposer.renderingVideo')}
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> {t('videoComposer.renderVideo')} (€{totalCost.toFixed(2)})
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
