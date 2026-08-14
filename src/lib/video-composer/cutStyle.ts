/**
 * v430 Schritt 6.2 — Schnitt-Stil-Mapper (`cutStyle` ⇄ `transition_type`).
 *
 * Im Composer-Domänenmodell heisst das Feld `cutStyle`. Die DB-Spalte bleibt
 * `transition_type`. Diese Datei ist die EINZIGE Stelle, die zwischen beiden
 * übersetzt — Hydration, Persistenz, Insert/Clone und Snapshot rufen sie mit
 * IHREM bisherigen Default auf, damit sich kein Verhalten ändert.
 *
 * PURE: kein Supabase, kein Netzwerk, keine Defaults „aus Versehen".
 * Render-Payloads, Remotion, Director's Cut und `transitionResolver.ts` sind
 * ausdrücklich NICHT betroffen.
 */

import type { TransitionStyle } from '@/types/video-composer';

/** Die drei historisch belegten Defaults im Composer. */
export const CUT_STYLE_DEFAULT_NONE: TransitionStyle = 'none';
export const CUT_STYLE_DEFAULT_CROSSFADE = 'crossfade' as TransitionStyle;
export const CUT_STYLE_DEFAULT_FADE = 'fade' as TransitionStyle;

function normalize(value: unknown): TransitionStyle | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? (trimmed as TransitionStyle) : null;
}

/**
 * DB-Zeile → Domäne. `fallback` ist der Default der jeweiligen Grenze
 * (Hydration: `crossfade`).
 */
export function cutStyleFromRow<F extends TransitionStyle | null | undefined>(
  row: { transition_type?: string | null } | null | undefined,
  fallback: F,
): TransitionStyle | F {
  return normalize(row?.transition_type) ?? fallback;
}

/**
 * Domäne → DB-Wert für die Spalte `transition_type`. `fallback` ist der
 * Default der jeweiligen Grenze (Insert: `fade` bzw. `none`, Snapshot: null).
 */
export function cutStyleToRow<F extends TransitionStyle | null | undefined>(
  cutStyle: string | null | undefined,
  fallback: F,
): TransitionStyle | F {
  return normalize(cutStyle) ?? fallback;
}
