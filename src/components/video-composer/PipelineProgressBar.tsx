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
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineProgress } from '@/hooks/usePipelineProgress';
import type { AssemblyConfig, ComposerScene } from '@/types/video-composer';

interface Props {
  scenes: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  renderPercent?: number;
  renderRunning?: boolean;
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
            <span className={cn('tabular-nums', hasFailure ? 'text-destructive' : 'text-foreground')}>
              {hasFailure ? 'Fehler' : `${overallPercent}%`}
            </span>
            <span className="text-muted-foreground/70 tabular-nums hidden sm:inline">
              {hasFailure ? 'Bitte „Lip-Sync neu rendern“ klicken' : `${formatTime(elapsedSeconds)} / ~${formatTime(elapsedSeconds + etaSeconds)}`}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
