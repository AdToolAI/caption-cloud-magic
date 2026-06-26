import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

export function HookScoreBadge({ score, className }: { score?: number; className?: string }) {
  if (score == null) return null;
  const tier =
    score >= 7
      ? "gold"
      : score >= 5
      ? "amber"
      : "red";
  const styles =
    tier === "gold"
      ? "border-[#F5C76A]/50 text-[#F5C76A] shadow-[0_0_18px_hsla(40,80%,60%,0.25)]"
      : tier === "amber"
      ? "border-amber-400/50 text-amber-300"
      : "border-red-400/50 text-red-300";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-white/5 px-2.5 py-0.5 text-xs font-medium backdrop-blur",
        styles,
        className,
      )}
    >
      <Flame className="h-3 w-3" />
      Hook {score.toFixed(1)}/10
    </span>
  );
}
