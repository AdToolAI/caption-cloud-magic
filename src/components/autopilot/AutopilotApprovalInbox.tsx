import { useMemo } from 'react';
import { Bell, CheckCheck, AlertTriangle, XCircle, Sparkles, ShieldAlert, Info, Calendar as CalIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAutopilotNotifications, type AutopilotNotification } from '@/hooks/useAutopilotNotifications';
import { useAutopilotQueue, useApproveSlot, useSkipSlot, type AutopilotSlot } from '@/hooks/useAutopilot';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
  onOpenSlot?: (slot: AutopilotSlot) => void;
}

const META: Record<string, { label: string; icon: typeof Bell; className: string }> = {
  autopilot_qa_review: { label: 'QA-Review', icon: AlertTriangle, className: 'text-amber-500 bg-amber-500/10' },
  autopilot_blocked: { label: 'Blockiert', icon: XCircle, className: 'text-destructive bg-destructive/10' },
  autopilot_failed: { label: 'Fehler', icon: XCircle, className: 'text-destructive bg-destructive/10' },
  autopilot_posted: { label: 'Live', icon: Sparkles, className: 'text-emerald-500 bg-emerald-500/10' },
  autopilot_daily_digest: { label: 'Tagesübersicht', icon: CalIcon, className: 'text-primary bg-primary/10' },
  autopilot_strike: { label: 'Strike', icon: ShieldAlert, className: 'text-destructive bg-destructive/10' },
  autopilot_locked: { label: 'Sperre', icon: ShieldAlert, className: 'text-destructive bg-destructive/10' },
};

export function AutopilotApprovalInbox({ onOpenSlot }: Props) {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useAutopilotNotifications(30);
  const { data: queue = [] } = useAutopilotQueue(14);
  const approve = useApproveSlot();
  const skip = useSkipSlot();

  const reviewSlots = useMemo(
    () => queue.filter((s) => s.status === 'qa_review').sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
    [queue],
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Approval queue */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg">Wartet auf Freigabe</h3>
              {reviewSlots.length > 0 && (
                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">{reviewSlots.length}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Slots, die du im Co-Pilot-Modus prüfen musst.</p>
          </div>
        </div>

        {reviewSlots.length === 0 ? (
          <EmptyState icon={CheckCheck} text="Alles freigegeben — keine Reviews offen." />
        ) : (
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-2">
              {reviewSlots.map((slot) => (
                <ReviewRow
                  key={slot.id}
                  slot={slot}
                  onOpen={() => onOpenSlot?.(slot)}
                  onApprove={() => approve.mutate(slot.id)}
                  onSkip={() => skip.mutate(slot.id)}
                  busy={approve.isPending || skip.isPending}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Notifications */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg">Inbox</h3>
              {unreadCount > 0 && (
                <Badge className="bg-primary/20 text-primary border-primary/30">{unreadCount} neu</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Push & In-App-Updates des Autopiloten.</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllRead()} className="text-xs">
              Alle gelesen
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Lade…</div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} text="Noch keine Notifications. Sobald die KI plant, postet oder prüft, erscheint es hier." />
        ) : (
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-1.5">
              {notifications.map((n) => (
                <NotificationRow key={n.id} n={n} onClick={() => !n.read && markRead(n.id)} />
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}

function ReviewRow({
  slot,
  onOpen,
  onApprove,
  onSkip,
  busy,
}: {
  slot: AutopilotSlot;
  onOpen: () => void;
  onApprove: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  return (
    <div className="border border-border/40 rounded-md p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase">{slot.platform}</Badge>
            <span className="text-[10px] text-muted-foreground">
              {new Date(slot.scheduled_at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </span>
            {typeof slot.qa_score === 'number' && (
              <Badge className={cn('text-[10px]',
                slot.qa_score >= 80 ? 'bg-emerald-500/15 text-emerald-600' :
                slot.qa_score >= 60 ? 'bg-amber-500/15 text-amber-600' :
                'bg-destructive/15 text-destructive',
              )}>QA {slot.qa_score}</Badge>
            )}
          </div>
          <p className="text-sm line-clamp-2">
            {slot.caption || slot.topic_hint || 'Slot ohne Caption'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40">
        <Button size="sm" variant="ghost" onClick={onOpen} className="text-xs h-7">Details</Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={onSkip} disabled={busy} className="text-xs h-7">Skip</Button>
        <Button size="sm" onClick={onApprove} disabled={busy} className="text-xs h-7">
          <CheckCheck className="h-3 w-3 mr-1" /> Freigeben
        </Button>
      </div>
    </div>
  );
}

function NotificationRow({ n, onClick }: { n: AutopilotNotification; onClick: () => void }) {
  const meta = META[n.type] ?? { label: n.type, icon: Info, className: 'text-muted-foreground bg-muted/40' };
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md p-2.5 flex items-start gap-2.5 transition-colors',
        n.read ? 'opacity-70 hover:bg-muted/30' : 'bg-primary/[0.04] hover:bg-primary/[0.08]',
      )}
    >
      <span className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', meta.className)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{n.title}</span>
          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>
        {n.message && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>}
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: de })}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Bell; text: string }) {
  return (
    <div className="text-center py-12 border border-dashed border-border/40 rounded-md">
      <Icon className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">{text}</p>
    </div>
  );
}
