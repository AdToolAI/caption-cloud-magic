/**
 * StageProgressBar — the one loading indicator the Autopilot uses.
 *
 * Every wait in the pipeline gets a visible bar: indeterminate while we cannot
 * know the remaining time, determinate as soon as the backend reports progress.
 */

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Props {
  /** 0–100. Omit for an indeterminate sweep. */
  value?: number | null;
  label?: string;
  hint?: string;
  className?: string;
  /** Slimmer variant for scene cards. */
  compact?: boolean;
}

export function StageProgressBar({ value, label, hint, className, compact }: Props) {
  const indeterminate = value === undefined || value === null;

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {(label || hint) && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {hint ? (
            <span className="font-mono text-[10px] text-muted-foreground">{hint}</span>
          ) : !indeterminate ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {Math.round(value as number)}%
            </span>
          ) : null}
        </div>
      )}

      {indeterminate ? (
        <div
          role="progressbar"
          aria-label={label ?? 'Wird geladen'}
          className={cn(
            'relative overflow-hidden rounded-full bg-muted/40',
            compact ? 'h-1' : 'h-2',
          )}
        >
          <div className="absolute inset-y-0 w-1/3 animate-autopilot-sweep rounded-full bg-primary/70" />
        </div>
      ) : (
        <Progress value={value as number} className={compact ? 'h-1' : 'h-2'} />
      )}
    </div>
  );
}
