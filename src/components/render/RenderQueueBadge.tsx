/**
 * RenderQueueBadge — small inline status card for a queued render job.
 *
 * Shows position, ETA, and a golden "Priority" badge for Founders. Drop it
 * next to any existing render progress UI (Motion Studio, Director's Cut,
 * Universal Creator, AI Video Studio).
 */
import { useRenderQueueJob } from '@/hooks/useRenderQueueJob';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  jobId: string | null | undefined;
  className?: string;
}

function formatEta(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `~${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `~${m}m ${s}s` : `~${m}m`;
}

export function RenderQueueBadge({ jobId, className = '' }: Props) {
  const { job, loading } = useRenderQueueJob(jobId);

  if (!jobId) return null;
  if (loading && !job) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Verbinde mit Render-Queue…</span>
      </div>
    );
  }
  if (!job) return null;

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return null;
  }

  const isRunning = job.status === 'processing' || job.status === 'rendering';

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-sm ${className}`}
    >
      {job.isFounder && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F5C76A]/15 px-2 py-0.5 text-xs font-medium text-[#F5C76A]">
          <Sparkles className="h-3 w-3" />
          Priority
        </span>
      )}
      {isRunning ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Rendering… <span className="text-muted-foreground">{formatEta(job.etaSeconds)}</span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="font-medium">Position {job.position ?? '—'}</span>
          <span className="text-muted-foreground">in der Warteschlange · {formatEta(job.etaSeconds)}</span>
        </span>
      )}
    </div>
  );
}
