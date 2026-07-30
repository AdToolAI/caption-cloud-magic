/**
 * Restzeit-Schätzung für einen laufenden Autopilot-Lauf.
 *
 * Bewusst grob: der Kunde soll wissen, ob er einen Kaffee holen kann — nicht
 * eine Sekundenzahl, die dann nicht stimmt. Basis sind Erfahrungswerte pro
 * Szene und Phase, kombiniert mit dem echten Szenen-Fortschritt.
 */

import type { ProductionRow, ProductionSceneRow } from '@/hooks/useAutopilotProduction';

/** Sekunden pro Szene, je Phase (Durchschnitt aus der Pipeline). */
const PER_SCENE = {
  anchor: 55,
  motion: 150,
  lipsync: 70,
};

/** Feste Blöcke am Ende, unabhängig von der Szenenzahl. */
const FIXED = {
  audio: 60,
  finalizing: 120,
};

export interface EtaResult {
  /** Verbleibende Sekunden (grob). Null, wenn fertig oder unbekannt. */
  seconds: number | null;
  /** Fertig formatierte, bewusst unscharfe Anzeige. */
  label: string;
}

function humanize(seconds: number): string {
  if (seconds <= 60) return 'gleich fertig';
  const minutes = Math.round(seconds / 60);
  if (minutes <= 2) return 'noch ca. 2 Min.';
  if (minutes >= 45) return 'noch ca. 45+ Min.';
  // Auf 5 Minuten runden — suggeriert keine Scheingenauigkeit.
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return `noch ca. ${rounded} Min.`;
}

export function estimateRemaining(
  production: ProductionRow | null,
  scenes: ProductionSceneRow[],
): EtaResult {
  if (!production) return { seconds: null, label: '' };
  if (production.status === 'completed') return { seconds: 0, label: 'fertig' };
  if (production.status === 'failed' || production.status === 'cancelled') {
    return { seconds: null, label: '' };
  }

  const total = scenes.length || 1;
  const open = scenes.filter(
    (scene) => scene.status !== 'completed' && scene.status !== 'failed',
  ).length;

  // Szenen laufen zu dritt parallel (3-Worker-Pool).
  const waves = Math.ceil(open / 3);
  const hasLipsync = scenes.some((scene) => scene.lipsync_url) || production.stage === 'lipsync';

  let seconds = waves * (PER_SCENE.anchor + PER_SCENE.motion);
  if (hasLipsync) seconds += waves * PER_SCENE.lipsync;

  const stage = production.stage;
  if (stage === 'audio' || stage === 'lipsync') seconds = Math.max(seconds, FIXED.audio);
  if (stage === 'finalizing') seconds = FIXED.finalizing;
  else seconds += FIXED.audio + FIXED.finalizing;

  // Wenn schon fast alles steht, nicht künstlich aufblähen.
  if (open === 0 && stage !== 'finalizing') seconds = Math.min(seconds, FIXED.finalizing);

  void total;

  return { seconds, label: humanize(seconds) };
}

/** Technik-Jargon aus Director-Log-Zeilen fernhalten. */
const JARGON = /(prompt|payload|lambda|bbox|seed|uuid|http|json|token|render_id|provider|fps|codec)/i;

export function customerFacingLogLine(message: string | undefined | null): string | null {
  if (!message) return null;
  const clean = message.trim();
  if (!clean || JARGON.test(clean)) return null;
  if (clean.length > 120) return `${clean.slice(0, 117)}…`;
  return clean;
}
