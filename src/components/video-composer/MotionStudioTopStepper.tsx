/**
 * MotionStudioTopStepper — horizontal top-bar workflow stepper that replaces
 * the legacy left-side `MotionStudioStepSidebar`. Sits sticky beneath the
 * Composer header and exposes the user-visible workflow stages
 * (Briefing → Storyboard → Voice → Music → Export). The technical "Clips"
 * step is intentionally NOT rendered here — clip generation happens inline
 * inside the Storyboard scene player tiles, so the user never has to context-
 * switch between picking scenes and generating them.
 */
import { Check, Lock, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface TopStepperStep {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
}

interface Props {
  steps: TopStepperStep[];
  activeStep: string;
  isStepDone: (id: string) => boolean;
  isStepAccessible: (id: string) => boolean;
  onSelect: (id: string) => void;
  className?: string;
}

export default function MotionStudioTopStepper({
  steps,
  activeStep,
  isStepDone,
  isStepAccessible,
  onSelect,
  className,
}: Props) {
  const completedCount = steps.filter((s) => isStepDone(s.id)).length;
  const progress = Math.round((completedCount / Math.max(1, steps.length)) * 100);

  return (
    <div
      className={cn(
        'sticky top-0 z-30 -mx-4 px-4 py-3 border-b border-gold/15 bg-background/85 backdrop-blur-xl',
        className,
      )}
      aria-label="Workflow steps"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const done = isStepDone(step.id);
          const accessible = isStepAccessible(step.id);
          const active = activeStep === step.id;

          return (
            <div key={step.id} className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                disabled={!accessible}
                onClick={() => accessible && onSelect(step.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  accessible
                    ? 'cursor-pointer hover:bg-primary/5'
                    : 'cursor-not-allowed opacity-40',
                  active && 'bg-primary/10 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.4)]',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                    done
                      ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.45)]'
                      : active
                      ? 'border-primary bg-card text-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]'
                      : accessible
                      ? 'border-border bg-card text-muted-foreground group-hover:border-primary/60'
                      : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : !accessible ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {active && !done && (
                    <motion.span
                      layoutId="topstep-pulse"
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      animate={{ scale: [1, 1.25, 1], opacity: [0.55, 0, 0.55] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                </span>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 leading-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'text-[12px] font-semibold leading-tight whitespace-nowrap mt-0.5',
                      active ? 'text-foreground' : 'text-foreground/75',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              </button>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'h-px w-4 sm:w-8 shrink-0 transition-colors duration-300',
                    isStepDone(step.id) ? 'bg-primary/60' : 'bg-border/50',
                  )}
                />
              )}
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-2 shrink-0 pl-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {progress}%
          </span>
          <div className="hidden sm:block h-1 w-24 rounded-full bg-muted/40 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
