import { tx } from '@/lib/i18nText';
/**
 * SystemLoadPill — compact live indicator of global render-queue load.
 *
 * Shows a colored dot + short label. Tooltip surfaces slot usage, queued
 * jobs, and (if Founder) a "priority active" hint. Meant for studio headers
 * where the user should sense platform congestion at a glance.
 */
import { useRenderSystemLoad } from '@/hooks/useRenderSystemLoad';
import { useFounderStatus } from '@/hooks/useFounderStatus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, Crown } from 'lucide-react';

interface Props {
  className?: string;
  compact?: boolean;
}

export function SystemLoadPill({ className = '', compact = false }: Props) {
  const load = useRenderSystemLoad();
  const founder = useFounderStatus();

  if (load.loading) return null;

  const dotColor =
    load.state === 'saturated' ? 'bg-red-500' :
    load.state === 'founder_reserve' ? 'bg-amber-500' :
    load.state === 'busy' ? 'bg-emerald-500' :
    'bg-emerald-400';

  const label =
    load.state === 'saturated' ? tx({ de: "Voll ausgelastet", en: "At full capacity", es: "Capacidad completa" }) :
    load.state === 'founder_reserve' ? tx({ de: "Founder-Reserve aktiv", en: "Founder reserve active", es: "Reserva de fundadores activa" }) :
    load.state === 'busy' ? `${tx({ de: 'Queue belegt', en: 'Queue busy', es: 'Cola ocupada' })} (${load.slotsUsed}/${load.slotBudget})` :
    tx({ de: 'Queue frei', en: 'Queue free', es: 'Cola libre' });

  const isFounder = founder.isActive;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 backdrop-blur px-2.5 py-1 text-xs ${className}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor} ${load.state !== 'idle' ? 'animate-pulse' : ''}`} />
            {!compact && <Activity className="h-3 w-3 text-muted-foreground" />}
            <span className="font-medium text-foreground/80 whitespace-nowrap">{label}</span>
            {isFounder && (load.state === 'founder_reserve' || load.state === 'saturated') && (
              <Crown className="h-3 w-3 text-amber-500" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <div>
              <strong>{tx({ de: 'Render-Slots:', en: 'Render slots:', es: 'Slots de render:' })}</strong> {load.slotsUsed} / {load.slotBudget}
            </div>
            <div>
              <strong>{tx({ de: 'In Warteschlange:', en: 'In queue:', es: 'En cola:' })}</strong> {load.queuedCount}
              {load.founderQueued > 0 && ` (${load.founderQueued} ${tx({ de: 'Founder', en: 'founder', es: 'fundadores' })})`}
            </div>
            {isFounder && load.state !== 'idle' && (
              <div className="pt-1 text-amber-500 flex items-center gap-1">
                <Crown className="h-3 w-3" /> {tx({ de: 'Deine Founder-Priorität zieht dich vor.', en: 'Your founder priority moves you ahead.', es: 'Tu prioridad de fundador te adelanta.' })}
              </div>
            )}
            {!isFounder && load.state === 'founder_reserve' && (
              <div className="pt-1 text-muted-foreground">
                {tx({ de: "Founders werden bevorzugt gerendert. Retry-Automatik ist aktiv.", en: "Founders are rendered preferentially. Automatic retry is active.", es: "Los fundadores se renderizan preferentemente. La reintentos automáticos están activos." })}
              </div>
            )}
            {load.state === 'saturated' && (
              <div className="pt-1 text-destructive">
                {tx({ de: "System voll — neue Renders warten kurz auf freie Slots.", en: "System full — new renders briefly wait for free slots.", es: "Sistema lleno — los nuevos renders esperan brevemente por slots libres." })}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default SystemLoadPill;
