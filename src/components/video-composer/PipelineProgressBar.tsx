/**
 * PipelineProgressBar — globaler, gewichteter Fortschrittsbalken für den
 * gesamten Composer-Workflow (Briefing → Clips → Voiceover → Lipsync →
 * Musik → Export). Sticky direkt unter dem Top-Stepper.
 *
 * Verschwindet, sobald keine Phase mehr läuft (mit 3 s Nachhalt-Delay,
 * damit der "100 %"-Moment sichtbar bleibt).
 *
 * Reine Frontend-Komponente — alle Werte kommen aus `usePipelineProgress`.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Check, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineProgress } from '@/hooks/usePipelineProgress';
import { supabase } from '@/integrations/supabase/client';
import { useResetLipSync } from '@/hooks/useResetLipSync';
import type { AssemblyConfig, ComposerScene } from '@/types/video-composer';

const SYNCSO_MAX_SLOTS = 3;

interface Props {
  scenes: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  renderPercent?: number;
  renderRunning?: boolean;
  projectId?: string;
  className?: string;
}

function formatTime(s: number) {
  if (!isFinite(s) || s <= 0) return '0s';
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')} min` : `${secs}s`;
}

export default function PipelineProgressBar({
  scenes,
  assemblyConfig,
  renderPercent,
  renderRunning,
  className,
}: Props) {
  const { phases, overallPercent, etaSeconds, elapsedSeconds, isActive, hasFailure } =
    usePipelineProgress({ scenes, assemblyConfig, renderPercent, renderRunning });

  // Keep the bar mounted for 3 s after the last phase ends, so the user sees
  // the final "100 %" tick instead of an abrupt disappearance.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (isActive || hasFailure) {
      setVisible(true);
      return;
    }
    if (!isActive && visible) {
      const id = window.setTimeout(() => setVisible(false), 3000);
      return () => window.clearTimeout(id);
    }
  }, [isActive, hasFailure, visible]);

  // Sync.so concurrency slot indicator — surfaces *why* a scene is "waiting"
  // when 3 lipsync jobs are already in flight (Sync.so Creator plan limit).
  const lipsyncPhase = phases.find((p) => p.id === 'lipsync');
  const lipsyncRunning = lipsyncPhase?.status === 'running';
  const [syncsoSlots, setSyncsoSlots] = useState<number | null>(null);
  useEffect(() => {
    if (!lipsyncRunning) {
      setSyncsoSlots(null);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
      const { count } = await supabase
        .from('syncso_inflight_jobs')
        .select('job_id', { count: 'exact', head: true })
        .gte('started_at', cutoff);
      if (!cancelled) setSyncsoSlots(typeof count === 'number' ? count : 0);
    };
    refresh();
    const id = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lipsyncRunning]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="pipeline-progress"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'sticky top-[64px] z-20 -mx-4 px-4 py-2.5 border-b border-gold/15 bg-background/90 backdrop-blur-xl',
          className,
        )}
        role={hasFailure ? 'alert' : 'status'}
        aria-live={hasFailure ? 'assertive' : 'polite'}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          {/* Phase pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {phases.map((p, i) => (
              <div key={p.id} className="flex items-center gap-1.5 shrink-0">
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
                    p.status === 'done' && 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_16px_hsl(var(--success)/0.18)]',
                    p.status === 'failed' && 'bg-destructive/15 text-destructive border border-destructive/40',
                    p.status === 'running' && 'bg-primary/15 text-primary border border-primary/40 animate-pulse',
                    p.status === 'idle' && 'bg-muted/20 text-muted-foreground/60 border border-border/40',
                  )}
                >
                  {p.status === 'done' ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : p.status === 'failed' ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : p.status === 'running' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                  )}
                  <span>{p.label}</span>
                </div>
                {i < phases.length - 1 && (
                  <div
                    className={cn(
                      'h-px w-3 transition-colors',
                      p.status === 'done' ? 'bg-emerald-500/40' : 'bg-border/40',
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Overall bar */}
          <div className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  hasFailure ? 'bg-destructive' : 'bg-gradient-to-r from-primary via-primary to-accent',
                )}
                initial={false}
                animate={{ width: `${overallPercent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ boxShadow: '0 0 12px hsl(var(--primary) / 0.45)' }}
              />
            </div>
          </div>

          {/* Time + percent */}
          <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
            {syncsoSlots !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border tabular-nums',
                  syncsoSlots >= SYNCSO_MAX_SLOTS
                    ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                    : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
                )}
                title={
                  syncsoSlots >= SYNCSO_MAX_SLOTS
                    ? 'Alle 3 Sync.so-Slots belegt — weitere Szenen werden eingereiht und automatisch nachgezogen.'
                    : `${syncsoSlots} von ${SYNCSO_MAX_SLOTS} Sync.so-Slots aktiv (parallele Lipsync-Jobs).`
                }
              >
                <Zap className="h-3 w-3" />
                Slots {syncsoSlots}/{SYNCSO_MAX_SLOTS}
              </span>
            )}
            <span className={cn('tabular-nums', hasFailure ? 'text-destructive' : 'text-foreground')}>
              {hasFailure ? 'Fehler' : `${overallPercent}%`}
            </span>
            <span className="text-muted-foreground/70 tabular-nums hidden sm:inline">
              {hasFailure ? 'Lip-Sync abgebrochen' : `${formatTime(elapsedSeconds)} / ~${formatTime(elapsedSeconds + etaSeconds)}`}
            </span>
            {hasFailure && (
              <ResetFailedButton scenes={scenes} />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ResetFailedButton({ scenes }: { scenes: ComposerScene[] }) {
  const { reset, resettingId } = useResetLipSync();
  const failed = scenes.find(
    (s) =>
      (s as any).lipSyncStatus === 'failed' ||
      (s as any).twoshotStage === 'failed' ||
      (s as any).twoshotStage === 'audio_mux_failed',
  );
  if (!failed) return null;
  const busy = resettingId === failed.id;
  return (
    <button
      type="button"
      onClick={() => reset(failed.id)}
      disabled={busy}
      className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-[11px] font-medium hover:bg-destructive/20 disabled:opacity-60"
      title="Storniert offene Jobs, refundiert Credits und startet einen sauberen neuen Versuch."
    >
      {busy ? 'Setze zurück…' : 'Sauber neu starten'}
    </button>
  );
}
