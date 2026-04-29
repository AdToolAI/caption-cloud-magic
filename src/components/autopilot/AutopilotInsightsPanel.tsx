import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Sparkles, RefreshCw, BarChart3, Clock, Layers } from 'lucide-react';
import { useAutopilotInsights, useTriggerPerformanceAnalysis } from '@/hooks/useAutopilot';

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📷', facebook: '👍', tiktok: '🎵', linkedin: '💼',
  twitter: '🐦', x: '🐦', youtube: '▶️',
};

export function AutopilotInsightsPanel() {
  const { data: insights, isLoading } = useAutopilotInsights();
  const trigger = useTriggerPerformanceAnalysis();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!insights || insights.total_posts_analyzed < 10) {
    return (
      <Card className="p-8 text-center border-dashed bg-muted/20">
        <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="font-serif text-lg mb-1">Noch in der Lernphase</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Der Autopilot wertet erst aus, sobald mindestens <strong>10 Posts</strong> live waren.
          Aktuell analysiert: {insights?.total_posts_analyzed ?? 0} Posts.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Die Analyse läuft automatisch nightly um 03:00 UTC.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${trigger.isPending ? 'animate-spin' : ''}`} />
          Trotzdem jetzt analysieren
        </Button>
      </Card>
    );
  }

  const lastAnalyzed = new Date(insights.updated_at);
  const hoursAgo = Math.floor((Date.now() - lastAnalyzed.getTime()) / 3_600_000);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 via-card to-card border-primary/30">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs uppercase tracking-widest text-primary/80">Self-Tuning aktiv</span>
            </div>
            <h2 className="font-serif text-2xl">Performance-Erkenntnisse</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Analyse von <strong>{insights.total_posts_analyzed}</strong> echten Posts ·
              ⌀ Engagement <strong>{((insights.avg_engagement_rate ?? 0) * 100).toFixed(1)}%</strong>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Letzte Analyse: vor {hoursAgo}h · Nächste automatisch um 03:00 UTC
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${trigger.isPending ? 'animate-spin' : ''}`} />
            Neu analysieren
          </Button>
        </div>

        {insights.recommendation_text && (
          <div className="mt-4 p-3 rounded-md bg-primary/10 border border-primary/20 text-sm leading-relaxed">
            💡 {insights.recommendation_text}
          </div>
        )}
      </Card>

      {/* Pillars */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold text-sm">Top-Themen</h3>
          </div>
          {insights.top_pillars.length > 0 ? (
            <ol className="space-y-2">
              {insights.top_pillars.map((p, i) => (
                <li key={p} className="flex items-center gap-3">
                  <span className="text-2xl font-serif text-emerald-600/60 w-6">{i + 1}</span>
                  <span className="text-sm font-medium">{p}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">Keine klare Pillar-Korrelation erkannt.</p>
          )}
        </Card>

        <Card className="p-5 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold text-sm">Schwächste Themen</h3>
          </div>
          {insights.weakest_pillars.length > 0 ? (
            <ol className="space-y-2">
              {insights.weakest_pillars.map((p, i) => (
                <li key={p} className="flex items-center gap-3">
                  <span className="text-2xl font-serif text-amber-600/60 w-6">{i + 1}</span>
                  <span className="text-sm font-medium">{p}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">Alle Themen performen ähnlich gut.</p>
          )}
        </Card>
      </div>

      {/* Platforms */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Plattform-Ranking</h3>
        </div>
        <div className="space-y-2">
          {insights.top_platforms.map((p) => {
            const pct = (p.avg_engagement * 100);
            const max = Math.max(...insights.top_platforms.map((x) => x.avg_engagement * 100), 0.001);
            const widthPct = (pct / max) * 100;
            return (
              <div key={p.platform} className="flex items-center gap-3">
                <span className="text-lg w-7">{PLATFORM_EMOJI[p.platform] ?? '·'}</span>
                <span className="capitalize text-sm font-medium w-20">{p.platform}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="text-sm font-mono w-16 text-right">{pct.toFixed(1)}%</span>
                <Badge variant="outline" className="text-[10px]">{p.posts_count}p</Badge>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Posting hours */}
      {Object.keys(insights.top_post_hours).length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Beste Posting-Zeiten (UTC)</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(insights.top_post_hours).map(([platform, hours]) => (
              <div key={platform}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{PLATFORM_EMOJI[platform] ?? '·'}</span>
                  <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                    {platform}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hours.slice(0, 5).map((h, i) => (
                    <Badge
                      key={h.hour}
                      variant={i === 0 ? 'default' : 'outline'}
                      className="font-mono text-xs"
                    >
                      {String(h.hour).padStart(2, '0')}:00
                      <span className="ml-1 opacity-60">{(h.score * 100).toFixed(1)}%</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Formats */}
      {insights.top_formats.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Format-Ranking</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {insights.top_formats.map((f) => (
              <div key={f.format} className="p-3 rounded-md bg-muted/40 border">
                <div className="text-sm font-medium capitalize mb-0.5">{f.format.replace(/_/g, ' ')}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{f.posts_count} Posts</span>
                  <span className="font-mono text-primary">{(f.avg_engagement * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3 bg-muted/30 text-[11px] text-muted-foreground leading-relaxed">
        ℹ️ Median-basiert (robust gegen Ausreißer). Zeitraum: letzte 30 Tage. Die Daten fließen
        automatisch in die nächste Wochenplanung — die KI verstärkt Top-Themen und reduziert
        Schwächere ohne dein Zutun.
      </Card>
    </div>
  );
}
