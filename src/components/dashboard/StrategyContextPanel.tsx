import { Badge } from "@/components/ui/badge";
import { MapPin, Sparkles, Lightbulb, TrendingUp, Brain, Target } from "lucide-react";
import type { StrategyPost, CreatorLevel } from "@/hooks/useStrategyMode";

interface Props {
  post: StrategyPost;
  weekPosts: StrategyPost[];
  experienceLevel: CreatorLevel;
  avgEngagementRate?: number;
  postsPublished?: number;
  weekStart: string;
}

const LEVEL_LABEL: Record<CreatorLevel, string> = {
  beginner: "Anfänger",
  intermediate: "Fortgeschritten",
  advanced: "Profi",
};

const PHASE_LABEL_DE: Record<string, string> = {
  Awareness: "Reichweite aufbauen",
  "Trust Building": "Vertrauen aufbauen",
  Conversion: "Aktion auslösen",
  Retention: "Bindung stärken",
  Community: "Community aktivieren",
};

const DEFAULT_TIPS_BY_PLATFORM: Record<string, string[]> = {
  instagram: [
    "Erste 3 Sekunden = starker Hook",
    "Vertikales Format (9:16) für Reels",
    "1 klare Botschaft pro Post",
    "Cross-post in deine Story",
  ],
  tiktok: [
    "Trend-Sound nutzen erhöht Reichweite",
    "Hook in den ersten 1-2 Sek",
    "Native Captions on-screen",
    "Hochkant 9:16 immer",
  ],
  linkedin: [
    "Persönliche Story > Werbung",
    "Erste 2 Zeilen entscheiden über „Mehr anzeigen“",
    "Frage am Ende fördert Kommentare",
    "Native Video > YouTube-Link",
  ],
  facebook: [
    "Bilder > Links für Reichweite",
    "Frage in der Caption für Engagement",
    "Posts mit 80–120 Zeichen performen am besten",
  ],
  youtube: [
    "Thumbnail entscheidet über CTR",
    "Erste 15 Sek = Retention",
    "End-Screen für nächstes Video nutzen",
  ],
  x: [
    "Knapp und scharf, max. 200 Zeichen",
    "Thread für komplexe Themen",
    "1 Bild erhöht Engagement um 35%",
  ],
  twitter: [
    "Knapp und scharf, max. 200 Zeichen",
    "Thread für komplexe Themen",
  ],
};

export function StrategyContextPanel({
  post,
  weekPosts,
  experienceLevel,
  avgEngagementRate,
  postsPublished,
  weekStart,
}: Props) {
  const sortedWeek = [...weekPosts].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  const postIndex = sortedWeek.findIndex((p) => p.id === post.id);
  const totalInWeek = sortedWeek.length;

  const phaseDe = post.phase ? PHASE_LABEL_DE[post.phase] || post.phase : null;
  const platformKey = post.platform.toLowerCase();
  const tips = post.tips && post.tips.length > 0
    ? post.tips
    : (DEFAULT_TIPS_BY_PLATFORM[platformKey] || DEFAULT_TIPS_BY_PLATFORM.instagram);

  const weekDate = new Date(weekStart);
  const weekLabel = weekDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" });

  return (
    <div className="space-y-3">
      {/* Wo du gerade stehst */}
      <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-primary uppercase tracking-wide">
          <MapPin className="h-3.5 w-3.5" /> Wo du gerade stehst
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Post in der Woche</div>
            <div className="font-semibold">
              {postIndex >= 0 ? `${postIndex + 1} von ${totalInWeek}` : `— / ${totalInWeek}`}
            </div>
            <div className="text-[11px] text-muted-foreground">Woche ab {weekLabel}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Dein Level</div>
            <div className="font-semibold">{LEVEL_LABEL[experienceLevel]}</div>
            {typeof avgEngagementRate === "number" && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Ø ER {avgEngagementRate.toFixed(1)}%
              </div>
            )}
          </div>
        </div>
        {phaseDe && (
          <div className="mt-2 flex items-center gap-1.5">
            <Target className="h-3 w-3 text-primary" />
            <span className="text-[11px] text-muted-foreground">Phase:</span>
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
              {phaseDe}
            </Badge>
          </div>
        )}
      </div>

      {/* Die Idee */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-warning" /> Die Idee
        </div>
        <p className="text-sm font-semibold">{post.content_idea}</p>
        {post.reasoning && (
          <div className="mt-2 pt-2 border-t border-border/40">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">Warum genau dieser Post?</div>
            <p className="text-xs text-muted-foreground italic leading-relaxed">{post.reasoning}</p>
          </div>
        )}
      </div>

      {/* Tipps für maximale Wirkung */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Tipps für maximale Wirkung
        </div>
        <ul className="space-y-1.5">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-foreground/90">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Was die KI über dich weiß */}
      {(typeof postsPublished === "number" || typeof avgEngagementRate === "number") && (
        <div className="rounded-lg border border-border/50 bg-card/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Brain className="h-3.5 w-3.5 text-primary" /> Was die KI über dich weiß
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {typeof postsPublished === "number" && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Veröffentlicht (28 T)</div>
                <div className="font-semibold">{postsPublished}</div>
              </div>
            )}
            {typeof avgEngagementRate === "number" && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Ø Engagement</div>
                <div className="font-semibold">{avgEngagementRate.toFixed(2)}%</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
