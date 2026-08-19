import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Bot, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Dashboard-Banner für den KI-Autopilot. Aktuell im "Coming Soon"-Modus —
 * Klick führt auf die Coming-Soon-Page (`/autopilot`), die Admins per
 * Bypass die echte Cockpit-UI sehen lässt.
 *
 * Reaktivierung: Diese Datei mit der vorherigen Version (live-Status mit
 * useAutopilotBrief/Queue) ersetzen — siehe git history.
 */
export const AutopilotHeroBanner = () => {
  return (
    <Link
      to="/autopilot"
      className={cn(
        'group block mt-6 mb-4 rounded-2xl border bg-card/40 backdrop-blur-md',
        'transition-all duration-300 hover:border-primary/50 hover:bg-card/60',
        'border-amber-400/30',
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 p-5">
        {/* Icon */}
        <div className="relative shrink-0">
          <div
            className={cn(
              'h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5',
              'flex items-center justify-center border border-primary/30',
            )}
          >
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <span
            className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgb(251,191,36)]"
            aria-hidden
          />
        </div>

        {/* Texts */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-serif text-lg leading-tight text-foreground">
              KI Autopilot
            </h3>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-amber-400/40 text-amber-400 bg-amber-400/5 uppercase tracking-widest"
            >
              Coming Soon
            </Badge>
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
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
            Vollautonome Content-Pipeline mit Wochenplan, Compliance-Score und Legal-Shield. Launch in Kürze — sichere dir deinen Early-Access-Slot.
          </p>
        </div>

        {/* CTA */}
        <div className="shrink-0">
          <div
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              'bg-amber-400/10 text-amber-400 border border-amber-400/30',
              'group-hover:bg-amber-400 group-hover:text-background transition',
            )}
          >
            Early Access sichern
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
};
