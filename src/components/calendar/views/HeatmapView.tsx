import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Sparkles, AlertTriangle, PieChart, ArrowRight, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePostingTimes } from "@/hooks/usePostingTimes";
import {
  aggregatePosts,
  aggregateScores,
  bucketKey,
  channelBalance,
  detectConflicts,
  findGoldenGap,
  nextDateFor,
  DAY_LABELS_DE,
  DAY_LABELS_LONG_DE,
  type HeatmapPost,
  type DayIndex,
  type HourIndex,
} from "@/lib/calendar/heatmap-aggregation";

interface HeatmapViewProps {
  posts: HeatmapPost[];
  onPostClick?: (post: any) => void;
  onDateClick?: (date: Date) => void;
  readOnly?: boolean;
  selectedEventIds?: string[];
}

const CHANNELS = [
  { id: "all", label: "Alle" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube", label: "YouTube" },
];

const HOURS: HourIndex[] = Array.from({ length: 24 }, (_, i) => i as HourIndex);

export function HeatmapView({ posts, onPostClick, onDateClick }: HeatmapViewProps) {
  const [channel, setChannel] = useState<string>("all");

  // Posting-Times API: needs a concrete platform; "all" → instagram as proxy
  const ptPlatform = channel === "all" ? "instagram" : channel;
  const { data: postingTimes } = usePostingTimes({
    platform: ptPlatform,
    days: 14,
  });

  const bucketMap = useMemo(() => aggregatePosts(posts, channel), [posts, channel]);
  const scoreMap = useMemo(
    () => aggregateScores(postingTimes, ptPlatform),
    [postingTimes, ptPlatform],
  );
  const conflicts = useMemo(() => detectConflicts(bucketMap, 3), [bucketMap]);
  const conflictSet = useMemo(() => new Set(conflicts.map((c) => c.key)), [conflicts]);
  const goldenGap = useMemo(() => findGoldenGap(scoreMap, bucketMap), [scoreMap, bucketMap]);
  const channelDist = useMemo(
    () => channelBalance(channel === "all" ? posts : posts.filter((p) => p.channels?.includes(channel))),
    [posts, channel],
  );

  const totalPosts = useMemo(
    () =>
      Array.from(bucketMap.values()).reduce((sum, b) => sum + b.count, 0),
    [bucketMap],
  );
  const goldenSlotCount = useMemo(
    () => Array.from(scoreMap.values()).filter((s) => s.score >= 70).length,
    [scoreMap],
  );

  const handleEmptyCellClick = (day: DayIndex, hour: HourIndex) => {
    if (!onDateClick) return;
    onDateClick(nextDateFor(day, hour));
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative">
        {/* Vertical gold-glow accent line (Enterprise pattern) */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/60 to-transparent shadow-[0_0_16px_hsla(43,90%,68%,0.5)]" />

        <div className="pl-6 space-y-4">
          {/* Header strip */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/30 shadow-[0_0_20px_hsla(43,90%,68%,0.15)]">
                <Flame className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2
                  className="text-xl text-foreground tracking-wide"
                  style={{ fontFamily: "'Playfair Display', serif", fontVariant: "small-caps" }}
                >
                  Heatmap-Radar
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Geplante Posts · Optimale Zeiten · Konflikte — auf einen Blick
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Tabs value={channel} onValueChange={setChannel}>
                <TabsList className="h-8 backdrop-blur-xl bg-card/60 border border-white/10 p-0.5">
                  {CHANNELS.map((c) => (
                    <TabsTrigger
                      key={c.id}
                      value={c.id}
                      className="h-7 px-2.5 text-[11px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                    >
                      {c.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Stats counter */}
          <div className="flex items-center gap-4 text-[11px] font-mono tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_hsla(43,90%,68%,0.8)]" />
              {totalPosts} POSTS GEPLANT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
              {goldenSlotCount} OPTIMALE SLOTS
            </span>
            {conflicts.length > 0 && (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                {conflicts.length} KONFLIKT{conflicts.length === 1 ? "" : "E"}
              </span>
            )}
          </div>

          {/* Heatmap Grid Panel */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-card/80 via-card/40 to-card/80 backdrop-blur-xl p-5 shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
          >
            {/* Hour axis */}
            <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              <div className="min-w-fit">
                <div
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: `40px repeat(24, minmax(28px, 1fr))`,
                    gap: "4px",
                  }}
                >
                  <div />
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="text-center text-[10px] font-mono text-muted-foreground/70 tabular-nums"
                    >
                      {String(h).padStart(2, "0")}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {(Array.from({ length: 7 }, (_, i) => i) as DayIndex[]).map((day) => (
                  <div
                    key={day}
                    className="grid items-center mt-1"
                    style={{
                      gridTemplateColumns: `40px repeat(24, minmax(28px, 1fr))`,
                      gap: "4px",
                    }}
                  >
                    <div
                      className="text-[10px] font-semibold tracking-widest text-primary/80"
                      style={{ fontFamily: "'Playfair Display', serif" }}
                    >
                      {DAY_LABELS_DE[day]}
                    </div>
                    {HOURS.map((hour) => {
                      const k = bucketKey(day, hour);
                      const bucket = bucketMap.get(k);
                      const score = scoreMap.get(k);
                      const isConflict = conflictSet.has(k);
                      const hasPosts = !!bucket;
                      const cyanAlpha = score ? Math.min(0.45, 0.05 + (score.score / 100) * 0.4) : 0;
                      const goldSize = bucket
                        ? Math.min(16, 6 + bucket.count * 3)
                        : 0;

                      return (
                        <Tooltip key={k}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                if (hasPosts && bucket.posts.length === 1 && onPostClick) {
                                  onPostClick(bucket.posts[0]);
                                } else if (!hasPosts) {
                                  handleEmptyCellClick(day, hour);
                                }
                              }}
                              className="relative aspect-square rounded-md border border-white/5 transition-all duration-150 hover:scale-110 hover:border-primary/60 hover:shadow-[0_0_12px_hsla(43,90%,68%,0.5)] hover:z-10 group cursor-pointer"
                              style={{
                                background: score
                                  ? `radial-gradient(circle at center, rgba(34,211,238,${cyanAlpha}) 0%, transparent 70%)`
                                  : "rgba(255,255,255,0.015)",
                              }}
                            >
                              {hasPosts && (
                                <span
                                  className={`absolute inset-0 m-auto rounded-full bg-primary shadow-[0_0_10px_hsla(43,90%,68%,0.8)] ${
                                    isConflict ? "animate-pulse ring-2 ring-red-400/60" : ""
                                  }`}
                                  style={{
                                    width: `${goldSize}px`,
                                    height: `${goldSize}px`,
                                  }}
                                />
                              )}
                              {hasPosts && bucket.count > 1 && (
                                <span className="absolute top-0 right-0 text-[8px] font-mono text-background bg-primary rounded-full w-3 h-3 flex items-center justify-center leading-none">
                                  {bucket.count}
                                </span>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs backdrop-blur-xl bg-popover/95 border-primary/20"
                          >
                            <div className="space-y-1.5">
                              <div className="font-semibold text-foreground text-xs">
                                {DAY_LABELS_LONG_DE[day]} · {String(hour).padStart(2, "0")}:00
                              </div>
                              {score && (
                                <div className="text-[11px] text-cyan-300">
                                  Posting-Score: <span className="font-mono font-bold">{Math.round(score.score)}/100</span>
                                  {score.reasons.length > 0 && (
                                    <ul className="mt-1 text-muted-foreground list-disc list-inside text-[10px]">
                                      {score.reasons.slice(0, 2).map((r, i) => (
                                        <li key={i}>{r}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                              {hasPosts && (
                                <div className="text-[11px] text-primary border-t border-white/10 pt-1.5">
                                  {bucket.count} Post{bucket.count > 1 ? "s" : ""} geplant
                                  <ul className="mt-1 text-muted-foreground text-[10px] truncate">
                                    {bucket.posts.slice(0, 3).map((p) => (
                                      <li key={p.id} className="truncate">
                                        · {p.title || p.caption || "(ohne Titel)"}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {!hasPosts && !score && (
                                <div className="text-[10px] text-muted-foreground">
                                  Klick: Post für diesen Slot erstellen
                                </div>
                              )}
                              {!hasPosts && score && (
                                <div className="text-[10px] text-primary/80 italic">
                                  Goldene Lücke — Klick zum Befüllen
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-white/5 text-[10px] font-mono tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_6px_hsla(43,90%,68%,0.8)]" />
                GEPLANT
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(34,211,238,0.6), transparent)" }}
                />
                OPTIMALE ZEIT
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full ring-2 ring-red-400 bg-primary animate-pulse" />
                KONFLIKT (≥3)
              </span>
            </div>
          </motion.div>

          {/* Insight Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <InsightCard
              icon={<Sparkles className="w-4 h-4" />}
              tone="gold"
              title="Goldene Lücke"
              body={
                goldenGap
                  ? `${DAY_LABELS_LONG_DE[goldenGap.day]} ${String(goldenGap.hour).padStart(2, "0")}:00 — Score ${goldenGap.score}, kein Post geplant.`
                  : "Keine ungenutzten Top-Slots in den nächsten 14 Tagen."
              }
              cta={
                goldenGap
                  ? {
                      label: "Slot nutzen",
                      onClick: () => onDateClick?.(nextDateFor(goldenGap.day, goldenGap.hour)),
                    }
                  : undefined
              }
            />
            <InsightCard
              icon={<AlertTriangle className="w-4 h-4" />}
              tone={conflicts.length > 0 ? "red" : "muted"}
              title="Konflikt-Warnung"
              body={
                conflicts.length > 0
                  ? `${conflicts.length} Slot${conflicts.length === 1 ? "" : "s"} mit ≥3 Posts gleichzeitig — Reach kannibalisiert sich.`
                  : "Keine Stau-Slots. Saubere Verteilung."
              }
            />
            <InsightCard
              icon={<PieChart className="w-4 h-4" />}
              tone="cyan"
              title="Channel-Balance"
              body={
                channelDist.length > 0
                  ? channelDist
                      .slice(0, 3)
                      .map((c) => `${c.channel} ${Math.round(c.pct)}%`)
                      .join(" · ")
                  : "Noch keine Posts geplant."
              }
            />
          </div>

          {/* Empty state hint */}
          {totalPosts === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center py-6 px-4 rounded-xl border border-dashed border-primary/20 bg-primary/[0.02]"
            >
              <CalendarPlus className="w-8 h-8 text-primary/60 mx-auto mb-2" />
              <p className="text-sm text-foreground/90 mb-1">
                Noch keine Posts geplant — die cyan-Schimmer zeigen dir bereits, wann deine Audience aktiv ist.
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Klick auf eine Zelle, um direkt einen Post für diesen Slot zu erstellen.
              </p>
              <Button
                size="sm"
                onClick={() => onDateClick?.(new Date())}
                className="h-8 text-xs bg-gradient-to-r from-primary to-amber-500"
              >
                <CalendarPlus className="w-3.5 h-3.5 mr-1.5" /> Ersten Post erstellen
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

interface InsightCardProps {
  icon: React.ReactNode;
  tone: "gold" | "cyan" | "red" | "muted";
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
}

function InsightCard({ icon, tone, title, body, cta }: InsightCardProps) {
  const toneStyles = {
    gold: "border-primary/30 shadow-[0_0_24px_hsla(43,90%,68%,0.12)] [&_.ico]:text-primary [&_.ico]:bg-primary/10",
    cyan: "border-cyan-400/30 shadow-[0_0_24px_rgba(34,211,238,0.12)] [&_.ico]:text-cyan-300 [&_.ico]:bg-cyan-400/10",
    red: "border-red-400/40 shadow-[0_0_24px_rgba(248,113,113,0.15)] [&_.ico]:text-red-300 [&_.ico]:bg-red-400/10",
    muted: "border-white/5 [&_.ico]:text-muted-foreground [&_.ico]:bg-white/5",
  }[tone];

  return (
    <div
      className={`rounded-xl border bg-card/40 backdrop-blur-xl p-4 transition-all hover:bg-card/60 ${toneStyles}`}
    >
      <div className="flex items-start gap-3">
        <div className="ico p-1.5 rounded-md border border-white/10">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-xs tracking-wider uppercase text-foreground/90 mb-1"
            style={{ fontFamily: "'Playfair Display', serif", letterSpacing: "0.08em" }}
          >
            {title}
          </h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{body}</p>
          {cta && (
            <Button
              size="sm"
              variant="ghost"
              onClick={cta.onClick}
              className="h-7 px-2 mt-2 text-[11px] text-primary hover:bg-primary/10"
            >
              {cta.label} <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
