import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Info, ShieldCheck, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PlanNormalization, RepairEntry } from '@/lib/video-composer/briefing/finalizePlanCanonical';

interface SafePlanNoticeProps {
  normalization: PlanNormalization | null | undefined;
}

const SOURCE_LABEL: Record<PlanNormalization['durationSource'], string> = {
  'briefing-slider': 'Videodauer-Slider',
  'canonical-briefing': 'Briefing/Skript',
  'plan-project': 'Projekt-Board',
  'scene-sum': 'Szenensumme',
  'default': 'Fallback',
};

/**
 * SafePlanNotice — kunden­freundliche Zusammenfassung aller Auto-Repairs, die
 * `finalizePlanCanonical` durchgeführt hat. Klar, deutsch, aufklappbar.
 *
 * - Ist der Plan schon konsistent & ohne Repairs → dezent grün ("Alles passt").
 * - Gab es Auto-Fixes → gelb mit Anzahl + aufklappbarer Liste.
 * - Ist der Plan strukturell inkonsistent → rot (aber der eigentliche
 *   Hard-Blocker sitzt weiterhin im Sheet direkt darüber).
 */
export function SafePlanNotice({ normalization }: SafePlanNoticeProps) {
  const [open, setOpen] = useState(false);
  if (!normalization) return null;

  const repairs: RepairEntry[] = normalization.repairLog ?? [];
  const hasRepairs = repairs.length > 0;
  const inconsistent = normalization.consistent === false;

  const tone = inconsistent
    ? 'border-destructive/50 bg-destructive/[0.08]'
    : hasRepairs
      ? 'border-amber-400/40 bg-amber-400/[0.06]'
      : 'border-emerald-400/30 bg-emerald-400/[0.05]';

  const Icon = inconsistent ? Info : hasRepairs ? Wand2 : CheckCircle2;
  const iconTone = inconsistent
    ? 'text-destructive'
    : hasRepairs
      ? 'text-amber-300'
      : 'text-emerald-300';

  const headline = inconsistent
    ? 'Plan noch nicht konsistent'
    : hasRepairs
      ? `${repairs.length} automatische Korrektur${repairs.length === 1 ? '' : 'en'}`
      : 'Plan passt zu deinem Briefing';

  const subline = inconsistent
    ? 'Bitte Szenendauern anpassen oder Briefing neu analysieren.'
    : hasRepairs
      ? 'Wir haben Widersprüche zwischen Briefing, Board und Skript sauber aufgelöst.'
      : 'Keine Widersprüche gefunden — dein Plan ist bereit.';

  return (
    <div className={`rounded-lg border ${tone} p-3 text-xs space-y-2`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconTone}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{headline}</span>
            <Badge variant="outline" className="text-[10px] border-cyan-400/40 text-cyan-300">
              {normalization.totalDurationSec}s · {normalization.sceneCount} Szenen
            </Badge>
            <Badge variant="outline" className="text-[10px] border-muted-foreground/40">
              Quelle: {SOURCE_LABEL[normalization.durationSource] ?? 'Auto'}
            </Badge>
            {!inconsistent && (
              <Badge variant="outline" className="text-[10px] border-emerald-400/40 text-emerald-300 gap-1">
                <ShieldCheck className="h-3 w-3" /> Konsistent
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground mt-1 leading-snug">{subline}</div>
        </div>
        {hasRepairs && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] shrink-0"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            Details
          </Button>
        )}
      </div>

      {open && hasRepairs && (
        <ul className="pl-6 space-y-1 text-muted-foreground list-disc marker:text-amber-300/60">
          {repairs.map((r, i) => (
            <li key={`${r.kind}-${i}`} className="leading-snug">
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SafePlanNotice;
