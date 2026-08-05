import { Check } from "lucide-react";
import { STUDIO_STEPS, type StudioStep } from "@/contexts/ContentStudioContext";
import { cn } from "@/lib/utils";

const LABELS: Record<StudioStep, string> = {
  brief: "Briefing",
  copy: "Copy",
  motif: "Motiv",
  layout: "Layout",
  deliver: "Ausspielen",
};

/** Fortschrittsband durch den Studio-Ablauf. Erreichte Schritte bleiben anklickbar. */
export function StepRail({
  step,
  reached,
  onSelect,
}: {
  step: StudioStep;
  reached: StudioStep[];
  onSelect: (next: StudioStep) => void;
}) {
  const index = STUDIO_STEPS.indexOf(step);

  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border/60" aria-hidden />
      <div
        className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-primary/70 transition-all duration-500"
        style={{ width: `${(index / (STUDIO_STEPS.length - 1)) * 100}%` }}
        aria-hidden
      />
      <ol className="relative flex items-center justify-between gap-2">
        {STUDIO_STEPS.map((id, i) => {
          const active = id === step;
          const done = i < index && reached.includes(id);
          const available = reached.includes(id);
          return (
            <li key={id}>
              <button
                type="button"
                disabled={!available}
                onClick={() => onSelect(id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                  active
                    ? "border-primary/70 bg-primary/15 text-foreground shadow-[0_0_28px_-12px_hsl(var(--primary)/0.9)]"
                    : done
                      ? "border-primary/30 bg-background text-muted-foreground hover:text-foreground"
                      : "border-border/60 bg-background text-muted-foreground",
                  !available && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    active || done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{LABELS[id]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default StepRail;
