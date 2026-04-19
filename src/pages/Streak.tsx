import { motion } from "framer-motion";
import { Flame, Trophy, Shield, Calendar as CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserStreak, useStreakMilestones, nextMilestone } from "@/hooks/useStreakTracker";
import { useTranslation } from "@/hooks/useTranslation";
import { SEO } from "@/components/SEO";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export default function StreakPage() {
  const { t } = useTranslation();
  const { data: streak, isLoading } = useUserStreak();
  const { data: milestones } = useStreakMilestones();

  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const totalDays = streak?.total_active_days ?? 0;
  const freezeTokens = streak?.freeze_tokens ?? 0;
  const next = nextMilestone(current);

  // 90-day heatmap
  const heatmap = useMemo(() => {
    const days: { date: string; active: boolean }[] = [];
    const today = new Date();
    const lastActivity = streak?.last_activity_date ? new Date(streak.last_activity_date) : null;
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
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
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <SEO title={t("streak.pageTitle")} description={t("streak.pageDescription")} />

      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <motion.span
            animate={current > 0 ? { rotate: [0, -8, 8, 0] } : undefined}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Flame className={cn("h-8 w-8", current > 0 ? "text-orange-500" : "text-muted-foreground")} />
          </motion.span>
          {t("streak.pageTitle")}
        </h1>
        <p className="text-muted-foreground">{t("streak.pageDescription")}</p>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/30">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-orange-500 tabular-nums">{current}</div>
            <div className="text-sm text-muted-foreground mt-1">{t("streak.current")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold tabular-nums flex items-center justify-center gap-2">
              <Trophy className="h-7 w-7 text-amber-500" />
              {longest}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{t("streak.longest")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold tabular-nums flex items-center justify-center gap-2">
              <CalendarIcon className="h-6 w-6 text-blue-400" />
              {totalDays}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{t("streak.totalDays")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold tabular-nums flex items-center justify-center gap-2">
              <Shield className="h-7 w-7 text-blue-400" />
              {freezeTokens}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{t("streak.freezeTokensLabel")}</div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("streak.last90Days")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[repeat(30,1fr)] gap-1">
            {heatmap.map((d) => (
              <div
                key={d.date}
                title={d.date}
                className={cn(
                  "aspect-square rounded transition",
                  d.active
                    ? "bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]"
                    : "bg-muted/40"
                )}
              />
            ))}
          </div>
          {next && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              🔥 {t("streak.nextMilestoneLong", { remaining: next - current, next })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("streak.milestonesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!milestones || milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("streak.noMilestonesYet")}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {milestones.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/30"
                >
                  <div className="text-2xl">🏆</div>
                  <div className="font-bold text-lg mt-1">
                    {m.milestone_days} {t("streak.days")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(m.reached_at).toLocaleDateString()}
                  </div>
                  {Number(m.reward_dollars ?? 0) > 0 ? (
                    <div className="text-xs text-amber-500 mt-1">
                      {t("streak.milestoneDollarsShort", { amount: Number(m.reward_dollars).toFixed(2) })}
                    </div>
                  ) : m.reward_credits > 0 ? (
                    <div className="text-xs text-muted-foreground mt-1">+{m.reward_credits} credits</div>
                  ) : null}
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
