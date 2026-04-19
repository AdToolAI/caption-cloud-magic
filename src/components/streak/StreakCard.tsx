import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Flame, Trophy, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStreak, useStreakMilestones, nextMilestone } from "@/hooks/useStreakTracker";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function StreakCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: streak } = useUserStreak();
  const { data: milestones } = useStreakMilestones();

  // Realtime: celebrate new milestones
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`streak-milestones-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "streak_milestones",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const m = payload.new as { milestone_days: number; reward_dollars: number };
          const dollars = Number(m.reward_dollars ?? 0);
          toast.success(
            t("streak.milestoneReached", { days: m.milestone_days }),
            {
              description: dollars > 0
                ? t("streak.milestoneDollars", { amount: dollars.toFixed(2) })
                : undefined,
              duration: 6000,
              icon: "🔥",
            }
          );
          queryClient.invalidateQueries({ queryKey: ["user-streak", user.id] });
          queryClient.invalidateQueries({ queryKey: ["streak-milestones", user.id] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, t]);

  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const totalDays = streak?.total_active_days ?? 0;
  const freezeTokens = streak?.freeze_tokens ?? 0;
  const next = nextMilestone(current);
  const remaining = next ? next - current : 0;

  // Mini heatmap: last 30 days based on milestones+last_activity
  const heatmap = useMemo(() => {
    const days: { date: string; active: boolean }[] = [];
    const today = new Date();
    const lastActivity = streak?.last_activity_date ? new Date(streak.last_activity_date) : null;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      // Active if within current streak window ending at last_activity_date
      let active = false;
      if (lastActivity && current > 0) {
        const diff = Math.floor((lastActivity.getTime() - d.getTime()) / 86400000);
        active = diff >= 0 && diff < current;
      }
      days.push({ date: dateStr, active });
    }
    return days;
  }, [streak, current]);

  return (
    <Card className="bg-gradient-to-br from-orange-500/5 via-background to-amber-500/5 border-orange-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <motion.span
              animate={current > 0 ? { rotate: [0, -5, 5, 0] } : undefined}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Flame className={cn("h-5 w-5", current > 0 ? "text-orange-500" : "text-muted-foreground")} />
            </motion.span>
            {t("streak.cardTitle")}
          </span>
          <Link
            to="/streak"
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            {t("streak.viewDetails")} →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hero stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl font-bold tabular-nums text-orange-500">{current}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
              {t("streak.current")}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums flex items-center justify-center gap-1">
              <Trophy className="h-4 w-4 text-amber-500" />
              {longest}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
              {t("streak.longest")}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">{totalDays}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
              {t("streak.totalDays")}
            </div>
          </div>
        </div>

        {/* 30-day heatmap */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            {t("streak.last30Days")}
          </div>
          <div className="grid grid-cols-[repeat(30,1fr)] gap-0.5">
            {heatmap.map((d) => (
              <div
                key={d.date}
                title={d.date}
                className={cn(
                  "aspect-square rounded-sm transition",
                  d.active
                    ? "bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_0_4px_rgba(249,115,22,0.5)]"
                    : "bg-muted/40"
                )}
              />
            ))}
          </div>
        </div>

        {/* Footer: freeze + next */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-blue-400" />
            {t("streak.freezeTokens", { count: freezeTokens })}
          </span>
          {next && (
            <span className="flex items-center gap-1 text-orange-500/90">
              <Sparkles className="h-3 w-3" />
              {t("streak.nextMilestone", { remaining, next })}
            </span>
          )}
        </div>

        {milestones && milestones.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {milestones.slice(0, 5).map((m) => {
              const dollars = Number(m.reward_dollars ?? 0);
              return (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20"
                  title={new Date(m.reached_at).toLocaleDateString()}
                >
                  🏆 {m.milestone_days}d{dollars > 0 ? ` · +$${dollars.toFixed(2)}` : ""}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
