import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import type { EnhanceRunRow } from '@/hooks/useEnhanceVideo';
import type { EnhanceLang } from '@/lib/videoEnhance/engineErrors';
import {
  elapsedSecondsSince,
  formatClock,
  runEngines,
  runPhaseLabel,
} from '@/lib/videoEnhance/runPresentation';

interface Props {
  run: EnhanceRunRow;
  lang: EnhanceLang;
  className?: string;
}

const COPY = {
  runningOn: { en: 'Running on', de: 'Läuft auf', es: 'Ejecutándose en' },
  routedFrom: { en: 'routed from', de: 'umgeleitet von', es: 'redirigido desde' },
  elapsed: { en: 'elapsed', de: 'verstrichen', es: 'transcurrido' },
} as const;

/**
 * Live line for a run in flight: the engine that is REALLY executing (from the
 * run's own `model_id`, never a client guess), the routed-from engine when it
 * differs, the current phase and a ticking clock — so a long provider queue
 * never looks like a hang.
 */
export function EnhanceRunProgress({ run, lang, className }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const engines = runEngines(run);
  const elapsed = elapsedSecondsSince(run.created_at, now);

  return (
    <p
      className={`text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 ${className ?? ''}`}
      aria-live="polite"
      data-testid="enhance-run-progress"
    >
      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
      <span>
        {COPY.runningOn[lang]}{' '}
        <span className="text-foreground font-medium">{engines.executing}</span>
        {engines.requested ? ` (${COPY.routedFrom[lang]} ${engines.requested})` : ''}
      </span>
      <span aria-hidden="true">·</span>
      <span>{runPhaseLabel(run.status, lang)}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums" data-testid="enhance-run-elapsed">
        {formatClock(elapsed)} {COPY.elapsed[lang]}
      </span>
    </p>
  );
}
