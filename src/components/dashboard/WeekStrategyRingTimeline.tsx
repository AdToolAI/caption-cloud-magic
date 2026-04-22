import { useMemo, useState } from "react";
import { addDays, isSameDay, format } from "date-fns";
import { de, es, enUS } from "date-fns/locale";
import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube, Sparkles, RefreshCw, TrendingUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useStrategyMode, type StrategyPost, type CreatorLevel } from "@/hooks/useStrategyMode";
import { PlatformRingDialog } from "./PlatformRingDialog";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  weekStart: string;
}

type RingState = "future" | "due" | "completed" | "missed" | "dismissed";

const platformConfig: Record<string, {
  icon: typeof Instagram;
  ring: string;
  ringDimmed: string;
  glow: string;
  label: string;
  bg: string;
}> = {
  instagram: {
    icon: Instagram,
    ring: "ring-purple-500",
    ringDimmed: "ring-purple-500/25",
    glow: "shadow-[0_0_18px_rgba(168,85,247,0.85)]",
    label: "Instagram",
    bg: "bg-purple-500/10",
  },
  facebook: {
    icon: Facebook,
    ring: "ring-blue-500",
    ringDimmed: "ring-blue-500/25",
    glow: "shadow-[0_0_18px_rgba(59,130,246,0.85)]",
    label: "Facebook",
    bg: "bg-blue-500/10",
  },
  linkedin: {
    icon: Linkedin,
    ring: "ring-green-500",
    ringDimmed: "ring-green-500/25",
    glow: "shadow-[0_0_18px_rgba(34,197,94,0.85)]",
    label: "LinkedIn",
    bg: "bg-green-500/10",
  },
  youtube: {
    icon: Youtube,
    ring: "ring-red-500",
    ringDimmed: "ring-red-500/25",
    glow: "shadow-[0_0_18px_rgba(239,68,68,0.85)]",
    label: "YouTube",
    bg: "bg-red-500/10",
  },
  x: {
    icon: Twitter,
    ring: "ring-violet-700",
    ringDimmed: "ring-violet-700/25",
    glow: "shadow-[0_0_18px_rgba(109,40,217,0.95)]",
    label: "X",
    bg: "bg-violet-700/10",
  },
  twitter: {
    icon: Twitter,
    ring: "ring-violet-700",
    ringDimmed: "ring-violet-700/25",
    glow: "shadow-[0_0_18px_rgba(109,40,217,0.95)]",
    label: "X",
    bg: "bg-violet-700/10",
  },
  tiktok: {
    icon: Music,
    ring: "ring-white",
    ringDimmed: "ring-white/25",
    glow: "shadow-[0_0_14px_rgba(255,255,255,0.7)]",
    label: "TikTok",
    bg: "bg-white/5",
  },
};

function getRingState(p: StrategyPost): RingState {
  if (p.status === "completed") return "completed";
  if (p.status === "missed") return "missed";
  if (p.status === "dismissed") return "dismissed";
  const t = new Date(p.scheduled_at).getTime();
  const now = Date.now();
  // Within 2h before scheduled, or 2h overdue (still pending) → "due"
  if (Math.abs(t - now) < 2 * 60 * 60 * 1000) return "due";
  return "future";
}

export function WeekStrategyRingTimeline({ weekStart }: Props) {
  const { t, language } = useTranslation();
  const dateLocale = language === "de" ? de : language === "es" ? es : enUS;
  const LEVEL_LABEL: Record<CreatorLevel, string> = {
    beginner: t("strategy.levelBeginner"),
    intermediate: t("strategy.levelIntermediate"),
    advanced: t("strategy.levelAdvanced"),
  };

  const {
    posts,
    isLoadingPosts,
    regenerate,
    isRegenerating,
    experienceLevel,
    postsPerWeek,
    levelProgress,
    setLevel,
    isSettingLevel,
  } = useStrategyMode();

  const [selectedPost, setSelectedPost] = useState<StrategyPost | null>(null);

  const days = useMemo(() => {
    const start = new Date(weekStart + "T00:00:00");
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(start, i);
      const dayPosts = posts
        .filter((p) => isSameDay(new Date(p.scheduled_at), d))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      return { date: d, isToday: isSameDay(d, new Date()), posts: dayPosts };
    });
  }, [posts, weekStart]);

  return (
    <>
      <div className="space-y-3">
        {/* Header bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/5 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/10 transition-colors"
                  aria-label={t("strategy.levelDetails")}
                >
                  <TrendingUp className="h-3 w-3" />
                  {t("strategy.levelLine", { level: LEVEL_LABEL[experienceLevel], count: postsPerWeek })}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold">{t("strategy.creatorLevelTitle")}</div>
                    <div className="text-xs text-muted-foreground">
                      {LEVEL_LABEL[experienceLevel]} · {t("strategy.postsPerWeek", { count: postsPerWeek })}
                    </div>
                  </div>

                  {levelProgress ? (
                    <div className="space-y-2 rounded-lg border border-border/40 p-2.5">
                      <div className="text-xs font-medium">
                        {t("strategy.progressTo", { level: LEVEL_LABEL[levelProgress.nextLevel] })}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{t("strategy.publishedPosts28d")}</span>
                          <span>{levelProgress.postsPublished} / {levelProgress.thresholds.posts}</span>
                        </div>
                        <Progress value={Math.min(100, (levelProgress.postsPublished / levelProgress.thresholds.posts) * 100)} className="h-1.5" />

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                          <span>{t("strategy.avgEngagementRate")}</span>
                          <span>{levelProgress.avgEr.toFixed(1)}% / {levelProgress.thresholds.er}%</span>
                        </div>
                        <Progress value={Math.min(100, (levelProgress.avgEr / levelProgress.thresholds.er) * 100)} className="h-1.5" />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/40 p-2.5 text-xs text-muted-foreground">
                      {t("strategy.maxLevelReached")}
                    </div>
                  )}

                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1">{t("strategy.adjustLevelManually")}</div>
                    <Select
                      value={experienceLevel}
                      onValueChange={(v) => setLevel(v as CreatorLevel)}
                      disabled={isSettingLevel}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">{t("strategy.selectBeginner")}</SelectItem>
                        <SelectItem value="intermediate">{t("strategy.selectIntermediate")}</SelectItem>
                        <SelectItem value="advanced">{t("strategy.selectAdvanced")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-warning" />
              <span>{t("strategy.aiSuggestionsCount", { count: posts.length })}</span>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => regenerate()} disabled={isRegenerating}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isRegenerating && "animate-spin")} />
            {t("strategy.regenerate")}
          </Button>
        </div>

        {/* Timeline */}
        <div className="relative pt-2">
          {/* Thin gold rail behind the day-numbers row */}
          <div
            className="pointer-events-none absolute left-[6%] right-[6%] top-[60px] h-px"
            style={{
              background:
                "linear-gradient(to right, hsl(var(--warning) / 0.05), hsl(var(--warning) / 0.55), hsl(var(--warning) / 0.05))",
              boxShadow: "0 0 8px hsl(var(--warning) / 0.35)",
            }}
          />

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map((day) => (
              <div key={day.date.toISOString()} className="flex flex-col items-center gap-2 min-w-0">
                {/* Weekday */}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {format(day.date, "EEE", { locale: dateLocale })}
                </span>

                {/* Day number — sits on the rail */}
                <span
                  className={cn(
                    "relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                    day.isToday
                      ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.55)]"
                      : "bg-card border border-border text-foreground"
                  )}
                >
                  {format(day.date, "d")}
                </span>

                {/* Platform rings stack */}
                <div className="flex flex-col items-center gap-1.5 mt-1 min-h-[44px]">
                  {day.posts.length === 0 ? (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/20" aria-hidden />
                  ) : (
                    day.posts.map((p) => {
                      const cfg = platformConfig[p.platform.toLowerCase()] || platformConfig.instagram;
                      const Icon = cfg.icon;
                      const state = getRingState(p);

                      const ringClass =
                        state === "completed"
                          ? cn(cfg.ring, cfg.glow, cfg.bg)
                          : state === "missed"
                            ? "ring-red-500 shadow-[0_0_18px_rgba(239,68,68,0.7)] bg-red-500/10 animate-[pulse_2s_ease-in-out_infinite]"
                            : state === "due"
                              ? cn(cfg.ring, cfg.bg, "animate-[pulse_2.4s_ease-in-out_infinite]")
                              : state === "dismissed"
                                ? "ring-muted-foreground/20 opacity-40"
                                : cn(cfg.ringDimmed, "bg-background");

                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPost(p)}
                          title={`${cfg.label} – ${format(new Date(p.scheduled_at), "HH:mm")} – ${p.content_idea}`}
                          aria-label={`${cfg.label} ${state}`}
                          className={cn(
                            "w-9 h-9 rounded-full ring-2 flex items-center justify-center transition-all",
                            "hover:scale-110 active:scale-95 cursor-pointer",
                            ringClass,
                            state === "dismissed" && "line-through"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              state === "completed" || state === "missed"
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {!isLoadingPosts && posts.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">
              {t("strategy.noSuggestions")}
            </p>
            <Button onClick={() => regenerate()} disabled={isRegenerating}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t("strategy.generateWeeklyStrategy")}
            </Button>
          </div>
        )}
      </div>

      <PlatformRingDialog
        open={!!selectedPost}
        onOpenChange={(v) => !v && setSelectedPost(null)}
        post={selectedPost}
      />
    </>
  );
}
