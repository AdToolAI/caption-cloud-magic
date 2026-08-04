/**
 * FounderPriorityChip — inline hint next to render/generate buttons.
 *
 * - Founder + queue not idle → gold "Priority-Slot aktiv" chip.
 * - Non-founder + Founder-reserve/saturated → amber "System stark ausgelastet" hint.
 * - Otherwise renders nothing.
 */
import { useRenderSystemLoad } from '@/hooks/useRenderSystemLoad';
import { useFounderStatus } from '@/hooks/useFounderStatus';
import { Crown, TriangleAlert } from 'lucide-react';

interface Props {
  className?: string;
}

export function FounderPriorityChip({ className = '' }: Props) {
  const load = useRenderSystemLoad();
  const founder = useFounderStatus();

  if (load.loading || founder.loading) return null;

  const isFounder = founder.isActive;
  const inPressure = load.state === 'founder_reserve' || load.state === 'saturated';

  if (isFounder && load.state !== 'idle') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-primary/45 bg-gradient-to-r from-primary/15 via-primary/5 to-primary/15 px-2.5 py-1 text-xs font-medium text-primary shadow-[0_0_18px_-6px_hsl(var(--primary)/0.7)] ${className}`}
      >
        <Crown className="h-3 w-3" />
        Priority-Slot aktiv
      </span>
    );
  }

  if (!isFounder && inPressure) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 text-xs text-amber-500/90 ${className}`}
      >
        <TriangleAlert className="h-3 w-3" />
        System stark ausgelastet · Retry aktiv
      </span>
    );
  }

  return null;
}

export default FounderPriorityChip;
