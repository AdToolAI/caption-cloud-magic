import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUserStreak } from "@/hooks/useStreakTracker";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { StreakPanel } from "./StreakPanel";

export function StreakBadge() {
  const { t } = useTranslation();
  const { data: streak } = useUserStreak();

  if (!streak) return null;
  const current = streak.current_streak;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-all",
            current > 0
              ? "bg-orange-500/15 text-orange-500 hover:bg-orange-500/25 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
          aria-label={`${current} ${t("streak.daysStreak")}`}
        >
          <motion.span
            animate={current > 0 ? { scale: [1, 1.15, 1] } : undefined}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex"
          >
            <Flame className="h-4 w-4" />
          </motion.span>
          <span className="tabular-nums">{current}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-4">
        <StreakPanel />
      </PopoverContent>
    </Popover>
  );
}
