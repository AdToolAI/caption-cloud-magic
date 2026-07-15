import { useEffect, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import type { WaitingState } from '@/hooks/useEnqueuedRender';

/**
 * RenderSlotWaitingBadge
 * Small inline indicator that appears while `useEnqueuedRender` is waiting for
 * a Lambda slot to open. Shows a live countdown to the next retry and a
 * subtle gold hint for the Founder-reserve reason.
 */
export function RenderSlotWaitingBadge({ waiting }: { waiting: WaitingState | null }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!waiting) return;
    const tick = () => setRemaining(Math.max(0, Math.round((waiting.nextRetryAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  if (!waiting) return null;

  const isFounderReserve = waiting.admission.reason === 'founder_reserve';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${
        isFounderReserve
          ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
          : 'border-border/60 bg-muted/30 text-muted-foreground'
      }`}
      role="status"
      aria-live="polite"
    >
      {isFounderReserve ? (
        <Sparkles className="h-3.5 w-3.5 text-amber-300" />
      ) : (
        <Clock className="h-3.5 w-3.5 animate-pulse" />
      )}
      <span>
        Warte auf Render-Slot — nächster Versuch in {remaining}s
        <span className="ml-1 opacity-60">(#{waiting.attempt}/{waiting.maxRetries})</span>
      </span>
    </div>
  );
}
