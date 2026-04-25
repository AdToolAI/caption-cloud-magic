import { LucideIcon, Check, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface StepItem {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

interface MotionStudioStepSidebarProps {
  steps: StepItem[];
  activeStep: string;
  isStepDone: (id: string) => boolean;
  isStepAccessible: (id: string) => boolean;
  onSelect: (id: string) => void;
}

export default function MotionStudioStepSidebar({
  steps,
  activeStep,
  isStepDone,
  isStepAccessible,
  onSelect,
}: MotionStudioStepSidebarProps) {
  const completedCount = steps.filter((s) => isStepDone(s.id)).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  return (
    <aside
      aria-label="Workflow steps"
      className="hidden lg:flex flex-col w-[220px] shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)]"
    >
      <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl p-4 shadow-sm">
        {/* Progress header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Workflow
            </span>
            <span className="text-[10px] font-semibold text-primary">{progress}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Steps */}
        <TooltipProvider delayDuration={150}>
          <ol className="space-y-1 relative">
            {/* connecting vertical line */}
            <div
              aria-hidden
              className="absolute left-[18px] top-3 bottom-3 w-px bg-border/50"
            />
            {steps.map((step, i) => {
              const Icon = step.icon;
              const done = isStepDone(step.id);
              const accessible = isStepAccessible(step.id);
              const active = activeStep === step.id;

              return (
                <li key={step.id} className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!accessible}
                        onClick={() => accessible && onSelect(step.id)}
                        aria-current={active ? 'step' : undefined}
                        className={cn(
                          'group w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-all duration-200',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                          accessible
                            ? 'cursor-pointer hover:bg-muted/50'
                            : 'cursor-not-allowed opacity-40',
                          active && 'bg-primary/10'
                        )}
                      >
                        {/* Step indicator */}
                        <span
                          className={cn(
                            'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                            done
                              ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.4)]'
                              : active
                              ? 'border-primary bg-card text-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)]'
                              : accessible
                              ? 'border-border bg-card text-muted-foreground group-hover:border-primary/50'
                              : 'border-border bg-card text-muted-foreground'
                          )}
                        >
                          {done ? (
                            <Check className="h-4 w-4" strokeWidth={3} />
                          ) : !accessible ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                          {active && !done && (
                            <motion.span
                              layoutId="step-pulse"
                              className="absolute inset-0 rounded-full border-2 border-primary"
                              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          )}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-muted-foreground/70">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <span
                              className={cn(
                                'text-sm font-medium truncate transition-colors',
                                active ? 'text-foreground' : 'text-foreground/80'
                              )}
                            >
                              {step.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {step.hint}
                          </p>
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[220px]">
                      <p className="font-medium text-xs mb-0.5">{step.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {accessible ? step.hint : 'Vorherige Schritte zuerst abschließen.'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ol>
        </TooltipProvider>
      </div>
    </aside>
  );
}
