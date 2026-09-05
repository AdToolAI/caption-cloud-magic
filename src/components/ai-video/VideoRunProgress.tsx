import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { tx } from '@/lib/i18nText';
import {
  formatElapsed,
  formatRuntimeEstimate,
  type ModelRuntimeStat,
} from '@/hooks/useVideoModelRuntimeStats';

interface Props {
  createdAt: string;
  stat?: ModelRuntimeStat;
}

/**
 * Live waiting-time feedback for a running generation: elapsed time plus the
 * typical duration for this exact model, derived from our real telemetry.
 * A long provider run is explained, never presented as a failure.
 */
export function VideoRunProgress({ createdAt, stat }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, (now - new Date(createdAt).getTime()) / 1000);
  const overdue = stat ? elapsed > stat.p90_seconds : false;

  return (
    <div className="mb-3 space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        {tx({ de: 'Wird erstellt', en: 'Generating', es: 'Generando' })} · {formatElapsed(elapsed)}
        {stat && (
          <span>
            {' · '}
            {tx({
              de: `Übliche Dauer: ${formatRuntimeEstimate(stat.p50_seconds)}`,
              en: `Typical time: ${formatRuntimeEstimate(stat.p50_seconds)}`,
              es: `Duración habitual: ${formatRuntimeEstimate(stat.p50_seconds)}`,
            })}
          </span>
        )}
      </p>
      {overdue && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {tx({
            de: 'Dieser Lauf dauert länger als gewöhnlich, läuft aber weiter. Du kannst die Seite schließen – das Video erscheint danach hier und in der Mediathek.',
            en: 'This run is taking longer than usual, but it is still processing. You can close the page — the video will appear here and in your library.',
            es: 'Esta generación tarda más de lo habitual, pero sigue en curso. Puedes cerrar la página: el vídeo aparecerá aquí y en tu biblioteca.',
          })}
        </p>
      )}
    </div>
  );
}
