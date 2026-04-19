import { useMemo, useState } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Check, X, ArrowRight, Clock, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStrategyMode, type StrategyPost } from "@/hooks/useStrategyMode";
import { MissedPostDialog } from "./MissedPostDialog";
import { StrategyPostDialog } from "./StrategyPostDialog";
import { useNavigate } from "react-router-dom";

interface Props {
  weekStart: string; // YYYY-MM-DD (Mo)
}

const STATUS_STYLES: Record<string, string> = {
  pending: "border-border/60 bg-card hover:border-primary/60",
  pending_due: "border-warning/60 bg-warning/5 animate-pulse",
  missed: "border-destructive/60 bg-destructive/5 hover:bg-destructive/10 shadow-[0_0_12px_-2px_hsl(var(--destructive)/0.4)]",
  completed: "border-success/60 bg-success/5",
  dismissed: "border-border/30 bg-muted/30 opacity-50",
  rescheduled: "border-primary/60 bg-primary/5",
};

function getStatusKey(p: StrategyPost): string {
  if (p.status === "pending") {
    const t = new Date(p.scheduled_at).getTime();
    const now = Date.now();
    if (t < now && now - t < 2 * 60 * 60 * 1000) return "pending_due";
    return "pending";
  }
  return p.status;
}

export function WeekStrategyTimeline({ weekStart }: Props) {
  const { posts, isLoadingPosts, regenerate, isRegenerating, dismiss, reschedule } = useStrategyMode();
  const navigate = useNavigate();

  const [missedPost, setMissedPost] = useState<StrategyPost | null>(null);
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

  const handlePostClick = (p: StrategyPost) => {
    if (p.status === "missed") setMissedPost(p);
    else if (p.status !== "dismissed") setSelectedPost(p);
  };

  const handleAddToCalendar = (p: StrategyPost) => {
    // Navigate to calendar with prefilled state
    navigate("/calendar", {
      state: {
        prefill: {
          caption: p.caption_draft,
          hashtags: p.hashtags,
          platform: p.platform,
          scheduled_at: p.scheduled_at,
          source_strategy_post_id: p.id,
        },
      },
    });
  };

  const handlePostNow = (p: StrategyPost) => {
    handleAddToCalendar(p);
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-warning" />
            <span>{posts.length} KI-Vorschläge für diese Woche</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerate()}
            disabled={isRegenerating}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isRegenerating && "animate-spin")} />
            Neu generieren
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => (
            <div
              key={day.date.toISOString()}
              className={cn(
                "rounded-xl border p-2 min-h-[140px] flex flex-col gap-1.5",
                day.isToday ? "border-primary/50 bg-primary/5" : "border-border/40 bg-card/40"
              )}
            >
              <div className="text-center mb-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  {format(day.date, "EEE", { locale: de })}
                </div>
                <div className={cn("text-base font-semibold", day.isToday && "text-primary")}>
                  {format(day.date, "d")}
                </div>
              </div>

              {day.posts.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground/50 italic">
                  —
                </div>
              ) : (
                day.posts.map((p) => {
                  const key = getStatusKey(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePostClick(p)}
                      className={cn(
                        "w-full text-left rounded-lg border p-1.5 transition-all",
                        STATUS_STYLES[key]
                      )}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {key === "missed" && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                        {p.status === "completed" && <Check className="h-3 w-3 text-success shrink-0" />}
                        {p.status === "dismissed" && <X className="h-3 w-3 text-muted-foreground shrink-0" />}
                        {p.status === "rescheduled" && <ArrowRight className="h-3 w-3 text-primary shrink-0" />}
                        <span className="text-[9px] uppercase tracking-wide font-medium text-muted-foreground truncate">
                          {p.platform}
                        </span>
                      </div>
                      <div className={cn(
                        "text-[10px] font-medium line-clamp-2 leading-tight",
                        p.status === "dismissed" && "line-through"
                      )}>
                        {p.content_idea}
                      </div>
                      <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {format(new Date(p.scheduled_at), "HH:mm")}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>

        {!isLoadingPosts && posts.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">
              Noch keine Vorschläge. Generiere deine erste Wochen-Strategie.
            </p>
            <Button onClick={() => regenerate()} disabled={isRegenerating}>
              <Sparkles className="h-4 w-4 mr-2" />
              Wochen-Strategie generieren
            </Button>
          </div>
        )}
      </div>

      <MissedPostDialog
        open={!!missedPost}
        onOpenChange={(v) => !v && setMissedPost(null)}
        post={missedPost}
        onDismiss={dismiss}
        onReschedule={reschedule}
        onPostNow={handlePostNow}
      />

      <StrategyPostDialog
        open={!!selectedPost}
        onOpenChange={(v) => !v && setSelectedPost(null)}
        post={selectedPost}
        onDismiss={dismiss}
        onAddToCalendar={handleAddToCalendar}
      />
    </>
  );
}
