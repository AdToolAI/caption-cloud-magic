import { tx } from "@/lib/i18nText";
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
        <h3 className="font-serif text-lg mb-1">{tx({ de: 'Noch in der Lernphase', en: 'Still in the learning phase', es: 'Todavía en fase de aprendizaje' })}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {tx({ de: <>Der Autopilot wertet erst aus, sobald mindestens <strong>10 Posts</strong> live waren. Aktuell analysiert: {insights?.total_posts_analyzed ?? 0} Posts.</>, en: <>The autopilot only analyzes once at least <strong>10 posts</strong> have gone live. Currently analyzed: {insights?.total_posts_analyzed ?? 0} posts.</>, es: <>El piloto automático solo analiza una vez que al menos <strong>10 publicaciones</strong> están activas. Analizado actualmente: {insights?.total_posts_analyzed ?? 0} publicaciones.</> })}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {tx({ de: 'Die Analyse läuft automatisch nightly um 03:00 UTC.', en: 'The analysis runs automatically nightly at 03:00 UTC.', es: 'El análisis se ejecuta automáticamente todas las noches a las 03:00 UTC.' })}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5"
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${trigger.isPending ? 'animate-spin' : ''}`} />
          {tx({ de: 'Trotzdem jetzt analysieren', en: 'Analyze now anyway', es: 'Analizar ahora de todos modos' })}
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
              <span className="text-xs uppercase tracking-widest text-primary/80">{tx({ de: 'Self-Tuning aktiv', en: 'Self-tuning active', es: 'Autoajuste activo' })}</span>
            </div>
            <h2 className="font-serif text-2xl">{tx({ de: 'Performance-Erkenntnisse', en: 'Performance insights', es: 'Perspectivas de rendimiento' })}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tx({ de: <>Analyse von <strong>{insights.total_posts_analyzed}</strong> echten Posts · ⌀ Engagement <strong>{((insights.avg_engagement_rate ?? 0) * 100).toFixed(1)}%</strong></>, en: <>Analysis of <strong>{insights.total_posts_analyzed}</strong> real posts · avg engagement <strong>{((insights.avg_engagement_rate ?? 0) * 100).toFixed(1)}%</strong></>, es: <>Análisis de <strong>{insights.total_posts_analyzed}</strong> publicaciones reales · engagement promedio <strong>{((insights.avg_engagement_rate ?? 0) * 100).toFixed(1)}%</strong></> })}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {tx({ de: `Letzte Analyse: vor ${hoursAgo}h · Nächste automatisch um 03:00 UTC`, en: `Last analysis: ${hoursAgo}h ago · Next automatically at 03:00 UTC`, es: `Último análisis: hace ${hoursAgo}h · Próximo automático a las 03:00 UTC` })}
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
            {tx({ de: 'Neu analysieren', en: 'Re-analyze', es: 'Reanalizar' })}
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
            <h3 className="font-semibold text-sm">{tx({ de: 'Top-Themen', en: 'Top topics', es: 'Temas principales' })}</h3>
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
            <p className="text-xs text-muted-foreground">{tx({ de: "Keine klare Pillar-Korrelation erkannt.", en: "No clear pillar correlation detected.", es: "No se detectó una correlación clara de pilares." })}</p>
          )}
        </Card>

        <Card className="p-5 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold text-sm">{tx({ de: "Schwächste Themen", en: "Weakest topics", es: "Temas más débiles" })}</h3>
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
            <p className="text-xs text-muted-foreground">{tx({ de: "Alle Themen performen ähnlich gut.", en: "All topics perform similarly well.", es: "Todos los temas rinden de forma similar." })}</p>
          )}
        </Card>
      </div>

      {/* Platforms */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{tx({ de: 'Plattform-Ranking', en: 'Platform ranking', es: 'Ranking de plataformas' })}</h3>
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
            <h3 className="font-semibold text-sm">{tx({ de: 'Beste Posting-Zeiten (UTC)', en: 'Best posting times (UTC)', es: 'Mejores horarios de publicación (UTC)' })}</h3>
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
            <h3 className="font-semibold text-sm">{tx({ de: 'Format-Ranking', en: 'Format ranking', es: 'Ranking de formatos' })}</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {insights.top_formats.map((f) => (
              <div key={f.format} className="p-3 rounded-md bg-muted/40 border">
                <div className="text-sm font-medium capitalize mb-0.5">{f.format.replace(/_/g, ' ')}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{tx({ de: `${f.posts_count} Posts`, en: `${f.posts_count} posts`, es: `${f.posts_count} publicaciones` })}</span>
                  <span className="font-mono text-primary">{(f.avg_engagement * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3 bg-muted/30 text-[11px] text-muted-foreground leading-relaxed">
        {tx({ de: 'ℹ️ Median-basiert (robust gegen Ausreißer). Zeitraum: letzte 30 Tage. Die Daten fließen automatisch in die nächste Wochenplanung — die KI verstärkt Top-Themen und reduziert Schwächere ohne dein Zutun.', en: 'ℹ️ Median-based (robust against outliers). Period: last 30 days. The data automatically flows into the next weekly planning — the AI boosts top topics and reduces weaker ones without your intervention.', es: 'ℹ️ Basado en la mediana (robusto frente a valores atípicos). Período: últimos 30 días. Los datos fluyen automáticamente hacia la próxima planificación semanal — la IA refuerza los temas principales y reduce los más débiles sin tu intervención.' })}
      </Card>
    </div>
  );
}
