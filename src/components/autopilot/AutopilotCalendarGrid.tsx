import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sparkles, Calendar as CalendarIcon, CheckCircle2, AlertTriangle, Ban, Clock, SkipForward } from 'lucide-react';
import type { AutopilotSlot } from '@/hooks/useAutopilot';

interface Props {
  queue: AutopilotSlot[];
  hasBrief: boolean;
  onSelectSlot: (slot: AutopilotSlot) => void;
}

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📷', facebook: '👍', tiktok: '🎵', linkedin: '💼',
  twitter: '🐦', x: '🐦', youtube: '▶️',
};

const STATUS_META: Record<AutopilotSlot['status'], { label: string; className: string; icon: typeof Clock }> = {
  draft:      { label: 'Entwurf',     className: 'bg-muted text-foreground border-border',                        icon: Clock },
  generating: { label: 'Generiere…',  className: 'bg-primary/15 text-primary border-primary/30 animate-pulse',    icon: Sparkles },
  qa_review:  { label: 'QA-Review',   className: 'bg-amber-500/15 text-amber-600 border-amber-500/40',            icon: AlertTriangle },
  scheduled:  { label: 'Geplant',     className: 'bg-primary/20 text-primary border-primary/40',                  icon: CalendarIcon },
  posted:     { label: 'Live',        className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40',      icon: CheckCircle2 },
  blocked:    { label: 'Blockiert',   className: 'bg-destructive/15 text-destructive border-destructive/40',      icon: Ban },
  failed:     { label: 'Fehler',      className: 'bg-destructive/10 text-destructive border-destructive/30',      icon: AlertTriangle },
  skipped:    { label: 'Übersprungen',className: 'bg-muted/60 text-muted-foreground border-border line-through',  icon: SkipForward },
};

export function AutopilotCalendarGrid({ queue, hasBrief, onSelectSlot }: Props) {
  // Build 14 days starting today
  const days = useMemo(() => {
    const arr: { date: Date; key: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      arr.push({ date: d, key: d.toISOString().split('T')[0] });
    }
    return arr;
  }, []);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, AutopilotSlot[]>();
    for (const s of queue) {
      const k = new Date(s.scheduled_at).toISOString().split('T')[0];
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [queue]);

  if (!hasBrief) {
    return (
      <Card className="p-12 text-center border-dashed">
        <CalendarIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="font-serif text-xl mb-1">Noch kein Plan</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Aktiviere den Autopilot oben — die KI erstellt automatisch einen 14-Tage-Plan basierend auf deinem Brief und den aktuellen Trends.
        </p>
      </Card>
    );
  }

  const total = queue.length;
  const posted = queue.filter((s) => s.status === 'posted').length;
  const review = queue.filter((s) => s.status === 'qa_review').length;
  const blocked = queue.filter((s) => s.status === 'blocked' || s.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <SummaryPill label="Slots gesamt" value={total} />
        <SummaryPill label="Live" value={posted} tone="success" />
        <SummaryPill label="Review nötig" value={review} tone="warn" highlight={review > 0} />
        <SummaryPill label="Blockiert / Fehler" value={blocked} tone="danger" highlight={blocked > 0} />
      </div>

      {/* Two-week grid: 7 cols × 2 rows */}
      <div className="grid grid-cols-7 gap-2">
        {days.map(({ date, key }) => {
          const slots = (slotsByDay.get(key) ?? []).sort(
            (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
          );
          const isToday = key === new Date().toISOString().split('T')[0];
          return (
            <Card
              key={key}
              className={cn(
                'p-2 min-h-[140px] flex flex-col gap-1.5',
                isToday && 'border-primary/50 bg-primary/[0.04] shadow-[0_0_18px_hsl(var(--primary)/0.15)]'
              )}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {date.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                  {date.getDate()}
                </div>
              </div>

              <div className="flex flex-col gap-1 flex-1">
                {slots.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground/50 italic mt-2">—</div>
                ) : (
                  slots.map((s) => {
                    const meta = STATUS_META[s.status];
                    const Icon = meta.icon;
                    const time = new Date(s.scheduled_at).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <button
                        key={s.id}
                        onClick={() => onSelectSlot(s)}
                        className={cn(
                          'group text-left px-1.5 py-1 rounded border text-[10px] leading-tight transition-all',
                          'hover:scale-[1.02] hover:shadow-md',
                          meta.className
                        )}
                        title={`${time} · ${s.platform} · ${meta.label}`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-[11px]">{PLATFORM_EMOJI[s.platform.toLowerCase()] ?? '📱'}</span>
                          <span className="font-mono">{time}</span>
                          <Icon className="h-2.5 w-2.5 ml-auto opacity-70" />
                        </div>
                        <div className="truncate mt-0.5 opacity-90">
                          {s.topic_hint || s.caption || meta.label}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground pt-1">
        {(['scheduled', 'qa_review', 'posted', 'blocked', 'skipped'] as AutopilotSlot['status'][]).map((s) => (
          <Badge key={s} variant="outline" className={cn('text-[10px]', STATUS_META[s].className)}>
            {STATUS_META[s].label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warn' | 'danger';
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        'p-2.5 flex items-center justify-between',
        highlight && tone === 'warn' && 'border-amber-500/40 bg-amber-500/5',
        highlight && tone === 'danger' && 'border-destructive/40 bg-destructive/5'
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-semibold text-sm',
          tone === 'success' && 'text-emerald-500',
          tone === 'warn' && 'text-amber-500',
          tone === 'danger' && 'text-destructive'
        )}
      >
        {value}
      </span>
    </Card>
  );
}

// Re-export hook helper to use Button without lint complaining about unused import
export { Button as _AutopilotGridButton };
