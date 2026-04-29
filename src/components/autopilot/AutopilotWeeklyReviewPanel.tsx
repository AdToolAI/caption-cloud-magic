import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, TrendingDown, Clock, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLatestWeeklyReview, useAcceptWeeklyReview, useTriggerWeeklyReview, useAutopilotBrief } from '@/hooks/useAutopilot';
import { formatDistanceToNow, isAfter } from 'date-fns';
import { de } from 'date-fns/locale';

export function AutopilotWeeklyReviewPanel() {
  const { data: review, isLoading } = useLatestWeeklyReview();
  const { data: brief } = useAutopilotBrief();
  const accept = useAcceptWeeklyReview();
  const trigger = useTriggerWeeklyReview();

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Lade Wochen-Review …</Card>;
  }

  if (!review) {
    return (
      <Card className="p-6 text-center">
        <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
        <h3 className="font-serif text-xl mb-2">Noch kein Wochen-Review</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Jeden Samstag um 10:00 UTC erstellt der Autopilot automatisch ein Review der vergangenen Woche.
        </p>
        <Button variant="outline" onClick={() => trigger.mutate()} disabled={trigger.isPending}>
          {trigger.isPending ? 'Wird erstellt …' : 'Jetzt manuell erstellen'}
        </Button>
      </Card>
    );
  }

  const rec = review.ai_recommendation;
  const isPending = review.user_decision === 'pending';
  const deadline = brief?.briefing_required_until ? new Date(brief.briefing_required_until) : null;
  const deadlinePassed = deadline && !isAfter(deadline, new Date());

  return (
    <div className="space-y-4">
      {/* Deadline Banner */}
      {isPending && deadline && (
        <Card className={`p-4 border-l-4 ${deadlinePassed ? 'border-l-destructive bg-destructive/5' : 'border-l-amber-500 bg-amber-500/5'}`}>
          <div className="flex items-center gap-3">
            {deadlinePassed ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Clock className="h-5 w-5 text-amber-500" />}
            <div className="flex-1">
              <div className="font-medium text-sm">
                {deadlinePassed
                  ? 'Briefing-Deadline überschritten — Autopilot wird pausiert'
                  : `Bitte bis ${deadline.toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} UTC bestätigen`}
              </div>
              <div className="text-xs text-muted-foreground">
                {deadline && !deadlinePassed && `Noch ${formatDistanceToNow(deadline, { locale: de })}`}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Posts veröffentlicht</div>
          <div className="text-2xl font-serif text-primary">{review.posts_published}</div>
          <div className="text-xs text-muted-foreground">{review.posts_rejected} blockiert</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Engagement</div>
          <div className="text-2xl font-serif text-primary">{review.total_engagement.toLocaleString('de-DE')}</div>
          <div className="text-xs text-muted-foreground">Summe (Like+Cmt+Share+Save)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Credits</div>
          <div className="text-2xl font-serif text-primary">{review.credits_spent}</div>
          <div className="text-xs text-muted-foreground">von {review.credits_budgeted} Budget</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Top-Pillar</div>
          <div className="text-sm font-medium truncate">{review.top_pillar ?? '—'}</div>
          <div className="text-xs text-muted-foreground truncate">↓ {review.weakest_pillar ?? '—'}</div>
        </Card>
      </div>

      {/* AI Strategy Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-serif text-xl">KI-Strategie für nächste Woche</h3>
          {isPending ? (
            <Badge variant="outline" className="ml-auto">Wartet auf Bestätigung</Badge>
          ) : (
            <Badge variant="default" className="ml-auto gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {review.user_decision === 'accepted' ? 'Übernommen' : 'Bestätigt'}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed mb-4">{rec.strategy_text || 'Keine Strategie verfügbar.'}</p>

        {rec.key_actions && rec.key_actions.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Konkrete Aktionen</div>
            <ul className="space-y-1">
              {rec.key_actions.map((a, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-primary">→</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-4">
          {rec.suggested_budget_eur && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>Budget-Vorschlag: <strong>{Math.round(rec.suggested_budget_eur)} €</strong></span>
              {brief?.weekly_budget_eur && (
                <span className="text-xs text-muted-foreground">(aktuell: {brief.weekly_budget_eur} €)</span>
              )}
            </div>
          )}
          {rec.suggested_mix && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-primary" />
              <span>Mix: {rec.suggested_mix.ai_video}% Video / {rec.suggested_mix.stock_reel}% Stock / {rec.suggested_mix.static}% Static</span>
            </div>
          )}
        </div>

        {isPending && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              onClick={() => accept.mutate({ reviewId: review.id, applySuggestion: true })}
              disabled={accept.isPending}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Vorschlag übernehmen & weiter
            </Button>
            <Button
              variant="outline"
              onClick={() => accept.mutate({ reviewId: review.id, applySuggestion: false })}
              disabled={accept.isPending}
            >
              Aktuelles Briefing beibehalten
            </Button>
          </div>
        )}
      </Card>

      {/* Platform breakdown */}
      {Object.keys(review.platform_breakdown).length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Plattform-Verteilung</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(review.platform_breakdown).map(([p, c]) => (
              <Badge key={p} variant="secondary">{p}: {c}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
