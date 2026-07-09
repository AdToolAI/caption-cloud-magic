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

// --- Zeilen-Klassifikation ---------------------------------------------------

const SCENE_MARKER_RE = /^(?:szene|scene|shot|sc[\s_-]?\d|\d+[a-zA-Z]?[\).:\-])\b/i;
const DURATION_LINE_RE = /(?:\d[.,]?\d*\s*[–\-]\s*)?\d[.,]?\d*\s*(?:sek(?:\.|unden)?|s\b)/i;
const META_KV_RE = /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9 /&\-]{1,40}:\s*\S/;
const MARKDOWN_BULLET_RE = /^(?:[-*•]\s|#{1,6}\s)/;
const PURE_SYMBOL_RE = /^[\s*_\-=•>]+$/;
const PARENS_ONLY_RE = /^[\(\[\{][^)\]\}]*[\)\]\}]$/;
const QUOTE_CHARS = /["„""«»]/;
const INLINE_STAGE_RE = /[\(\[\{][^)\]\}]{0,80}[\)\]\}]/g;
const SPEAKER_LABEL_RE = /^\s*(?:>\s*)?(?:[A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9 .\-]{0,30}|sprecher\s*\d+|speaker\s*\d+)\s*[:\-–—]\s*/i;
const QUOTE_WRAP_RE = /^["„""«»]+|["„""«»]+$/g;

function isSpokenLine(raw: string): boolean {
  const line = raw.trim();
  if (!line) return false;
  if (PURE_SYMBOL_RE.test(line)) return false;
  if (MARKDOWN_BULLET_RE.test(line)) return false;
  if (PARENS_ONLY_RE.test(line)) return false;
  if (SCENE_MARKER_RE.test(line)) return false;
  // Timing-Zeilen wie "**2,5–5,0 Sek.**" oder "2.5-5s"
  const stripped = line.replace(/\*+/g, '').trim();
  if (DURATION_LINE_RE.test(stripped) && stripped.split(/\s+/).length <= 6) return false;
  // Key: Value Meta-Zeilen (Setting:, Kamera:, Ziel:, …) — nur wenn KEIN Zitat drin
  if (META_KV_RE.test(line) && !QUOTE_CHARS.test(line)) return false;
  return true;
}

function cleanSpokenLine(raw: string): string {
  let s = raw.trim();
  // Führendes Sprecher-Label entfernen: "SAMUEL:", "Sprecher 2 —", "> "
  s = s.replace(SPEAKER_LABEL_RE, '');
  // Inline-Regieanweisungen (schmunzelt) / [pause] entfernen
  s = s.replace(INLINE_STAGE_RE, ' ');
  // Zitat-Wrapper trimmen
  s = s.replace(QUOTE_WRAP_RE, '');
  // Markdown-Fettung entfernen
  s = s.replace(/[*_`]+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function extractSpokenWords(raw: string): number {
  if (!raw) return 0;
  const lines = raw.split(/\r?\n/);
  let total = 0;
  for (const l of lines) {
    if (!isSpokenLine(l)) continue;
    const cleaned = cleanSpokenLine(l);
    if (!cleaned) continue;
    total += cleaned.split(/\s+/).filter(Boolean).length;
  }
  return total;
}

/**
 * Live-Anzeige, wie viel gesprochenes Skript im Briefing steckt — damit der
 * Kunde direkt sieht, ob Skript und Ziel-Dauer zusammenpassen, bevor er auf
 * "Analysieren" klickt. Rein clientseitig, keine API-Calls.
 */
export function SpeechDurationHint({ text, targetDurationSec, language = 'de' }: SpeechDurationHintProps) {
  const { words, seconds, tone, message, suppress } = useMemo(() => {
    const rawWords = (text ?? '').trim() ? (text ?? '').trim().split(/\s+/).filter(Boolean).length : 0;
    const words = extractSpokenWords(text ?? '');
    const wps = WORDS_PER_SEC[(language || 'de').toLowerCase()] ?? 2.5;
    const seconds = words > 0 ? Math.max(1, Math.round(words / wps)) : 0;
    const ratio = targetDurationSec > 0 ? seconds / targetDurationSec : 0;

    // Anti-Fehl-Alarm: viel Rohtext, aber nach Filterung nichts Gesprochenes.
    const suppress = words === 0 && rawWords > 20;

    let tone: 'idle' | 'ok' | 'warn' | 'danger' = 'idle';
    let message = '';
    if (words < 6) {
      tone = 'idle';
      message = 'Noch zu wenig gesprochener Text für eine Schätzung.';
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
    return { words, seconds, tone, message, suppress };
  }, [text, targetDurationSec, language]);

  if (!text || suppress || words < 3) return null;

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
