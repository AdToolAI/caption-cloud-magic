import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Bot, Pause, ShieldCheck, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAutopilotBrief, useAutopilotQueue } from '@/hooks/useAutopilot';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

export const AutopilotHeroBanner = () => {
  const { data: brief } = useAutopilotBrief();
  const { data: queue = [] } = useAutopilotQueue(7);

  const status: 'inactive' | 'active' | 'paused' | 'locked' = useMemo(() => {
    if (!brief) return 'inactive';
    if (brief.locked_until && new Date(brief.locked_until) > new Date()) return 'locked';
    if (brief.paused_until && new Date(brief.paused_until) > new Date()) return 'paused';
    return brief.is_active ? 'active' : 'inactive';
  }, [brief]);

  const nextSlot = useMemo(() => {
    return queue.find(
      (s) => ['scheduled', 'qa_review'].includes(s.status) && new Date(s.scheduled_at) > new Date(),
    );
  }, [queue]);

  const pendingReview = queue.filter((s) => s.status === 'qa_review').length;
  const scheduledCount = queue.filter((s) => s.status === 'scheduled').length;

  const dotColor =
    status === 'active'
      ? 'bg-primary shadow-[0_0_12px_hsl(var(--primary))]'
      : status === 'paused'
      ? 'bg-amber-500 shadow-[0_0_8px_rgb(245,158,11)]'
      : status === 'locked'
      ? 'bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]'
      : 'bg-muted-foreground/40';

  const headline =
    status === 'active'
      ? 'Autopilot läuft'
      : status === 'paused'
      ? 'Autopilot pausiert'
      : status === 'locked'
      ? 'Autopilot gesperrt'
      : 'Autopilot — KI führt deinen Account';

  const sub =
    status === 'active' && nextSlot
      ? `Nächster Post: ${formatRelative(nextSlot.scheduled_at)} · ${pendingReview} in Review · ${scheduledCount} geplant`
      : status === 'active'
      ? 'KI plant deine nächsten 14 Tage. Erste Slots erscheinen in Kürze.'
      : status === 'paused'
      ? `Pausiert bis ${brief?.paused_until ? new Date(brief.paused_until).toLocaleString() : ''}`
      : status === 'locked'
      ? 'Aktivierung blockiert. Cockpit für Details öffnen.'
      : 'Aktivieren und die KI generiert, prüft und plant Content – mit hartem Compliance-Shield.';

  return (
    <Link
      to="/autopilot"
      className={cn(
        'group block mt-6 mb-4 rounded-2xl border bg-card/40 backdrop-blur-md',
        'transition-all duration-300 hover:border-primary/50 hover:bg-card/60',
        status === 'active' ? 'border-primary/40' : 'border-border/60',
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 p-5">
        {/* Status icon */}
        <div className="relative shrink-0">
          <div
            className={cn(
              'h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5',
              'flex items-center justify-center border border-primary/30',
            )}
          >
            {status === 'locked' ? (
              <Lock className="h-5 w-5 text-destructive" />
            ) : status === 'paused' ? (
              <Pause className="h-5 w-5 text-amber-500" />
            ) : (
              <Bot className="h-5 w-5 text-primary" />
            )}
          </div>
          <span className={cn('absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full', dotColor)} />
        </div>

        {/* Texts */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-serif text-lg leading-tight text-foreground">{headline}</h3>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-primary/30 text-primary/90"
            >
              <Sparkles className="h-2.5 w-2.5" /> AI Powered
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-emerald-500/30 text-emerald-400"
            >
              <ShieldCheck className="h-2.5 w-2.5" /> Legal Shield
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{sub}</p>
        </div>

        {/* CTA */}
        <div className="shrink-0">
          <div
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              'bg-primary/10 text-primary border border-primary/30',
              'group-hover:bg-primary group-hover:text-primary-foreground transition',
            )}
          >
            Cockpit öffnen
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Active mini stats bar */}
      {status === 'active' && (queue.length > 0) && (
        <div className="border-t border-border/40 px-5 py-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Compliance-Score: <strong className={cn(
            'font-semibold',
            (brief?.compliance_score ?? 100) >= 90 ? 'text-emerald-400' :
            (brief?.compliance_score ?? 100) >= 70 ? 'text-amber-400' : 'text-destructive'
          )}>{brief?.compliance_score ?? 100}/100</strong></span>
          <span>Wochen-Budget: <strong className="text-foreground">{brief?.weekly_credits_spent ?? 0}/{brief?.weekly_credit_budget ?? 0} cr</strong></span>
          <span className="hidden md:inline">Auto-Publish: <strong className={brief?.auto_publish_enabled ? 'text-amber-400' : 'text-emerald-400'}>{brief?.auto_publish_enabled ? 'ON' : 'OFF (Co-Pilot)'}</strong></span>
        </div>
      )}
    </Link>
  );
};

function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
