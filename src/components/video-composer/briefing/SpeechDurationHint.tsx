import { useMemo } from 'react';
import { Clock } from 'lucide-react';

interface SpeechDurationHintProps {
  /** Freier Text im Briefing (Beschreibung / VO-Skript). */
  text: string;
  /** Aktuell im Board eingestellte Ziel-Gesamtdauer in Sekunden. */
  targetDurationSec: number;
  /** Sprache steuert die Wörter-pro-Sekunde-Heuristik. */
  language?: string;
}

// Grobe Sprech-Geschwindigkeit — konservativ Richtung "ruhig gesprochen".
// DE ~150 wpm, EN ~160 wpm, ES ~170 wpm.
const WORDS_PER_SEC: Record<string, number> = {
  de: 2.5,
  en: 2.7,
  es: 2.9,
};

/**
 * Live-Anzeige, wie viel gesprochenes Skript im Briefing steckt — damit der
 * Kunde direkt sieht, ob Skript und Ziel-Dauer zusammenpassen, bevor er auf
 * "Analysieren" klickt. Rein clientseitig, keine API-Calls.
 */
export function SpeechDurationHint({ text, targetDurationSec, language = 'de' }: SpeechDurationHintProps) {
  const { words, seconds, ratio, tone, message } = useMemo(() => {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    const words = clean ? clean.split(' ').filter(Boolean).length : 0;
    const wps = WORDS_PER_SEC[(language || 'de').toLowerCase()] ?? 2.5;
    const seconds = words > 0 ? Math.max(1, Math.round(words / wps)) : 0;
    const ratio = targetDurationSec > 0 ? seconds / targetDurationSec : 0;

    let tone: 'idle' | 'ok' | 'warn' | 'danger' = 'idle';
    let message = '';
    if (words < 6) {
      tone = 'idle';
      message = 'Noch zu wenig Text für eine Schätzung.';
    } else if (ratio <= 1.05) {
      tone = 'ok';
      message = `Passt zu ${targetDurationSec}s Gesamtdauer.`;
    } else if (ratio <= 1.4) {
      tone = 'warn';
      message = `Etwas eng für ${targetDurationSec}s — Dauer wird evtl. auto-verlängert.`;
    } else {
      tone = 'danger';
      message = `Skript ist deutlich länger als ${targetDurationSec}s — Dauer bitte erhöhen oder Skript kürzen.`;
    }
    return { words, seconds, ratio, tone, message };
  }, [text, targetDurationSec, language]);

  if (!text || words < 3) return null;

  const toneClass =
    tone === 'ok' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/[0.05]'
    : tone === 'warn' ? 'text-amber-300 border-amber-400/40 bg-amber-400/[0.06]'
    : tone === 'danger' ? 'text-destructive border-destructive/50 bg-destructive/[0.08]'
    : 'text-muted-foreground border-border/40 bg-background/40';

  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] ${toneClass}`}>
      <Clock className="h-3 w-3 shrink-0" />
      <span className="tabular-nums">
        ~{seconds}s Sprech-Dauer <span className="opacity-60">({words} Wörter)</span> · Ziel {targetDurationSec}s
      </span>
      <span className="opacity-80 truncate">— {message}</span>
    </div>
  );
}

export default SpeechDurationHint;
