/**
 * finalizePlanCanonical — the single source of truth for a Production Plan
 * right before it is shown to the user or applied to the storyboard.
 *
 * Guarantees, in order:
 *   1. `project.totalDurationSec === sum(scene.durationSec)` (no widersprüchliche
 *      "50s Gesamt / 10s Szenen"-Zustände mehr möglich).
 *   2. Wenn eine kanonische Briefing-Dauer erkannt wurde (Script/Board),
 *      wird sie priorisiert und die Szenen werden proportional darauf verteilt.
 *   3. Cast-Slots mit ungültigen (nicht-UUID) `characterId`s werden auf `null`
 *      gesetzt, damit Voice-Namen ("George", "Roger") nicht als Charaktere
 *      durchrutschen.
 *   4. Voice-IDs, die UUID-Format haben (also aus dem Charakter-Slot
 *      falsch übernommen wurden), werden entfernt.
 *
 * Jede Korrektur wird nach `_meta.debug.normalization` protokolliert, damit
 * die UI die Herkunft transparent anzeigen kann.
 *
 * WICHTIG: idempotent — mehrfache Aufrufe ändern nichts, wenn schon konsistent.
 */

import type { TProductionPlan, TPlanScene } from './productionPlan';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlanNormalization {
  /** Endgültige Gesamtdauer, die im Plan durchgesetzt wurde. */
  totalDurationSec: number;
  /** Endgültige Szenenzahl. */
  sceneCount: number;
  /** Woher die Gesamtdauer kommt. */
  durationSource:
    | 'canonical-briefing'
    | 'plan-project'
    | 'scene-sum'
    | 'default';
  /** Vorheriger Projekt-Gesamtwert (falls abweichend). */
  previousTotal?: number;
  /** Vorherige Szenensumme (falls abweichend). */
  previousSum?: number;
  /** Aktionen, die beim Finalisieren durchgeführt wurden. */
  actions: string[];
  /** True, wenn der Plan strukturell konsistent ist. */
  consistent: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readCanonicalTiming(plan: TProductionPlan): Record<string, any> | null {
  const meta = (plan as any)?._meta;
  if (!isPlainObject(meta)) return null;
  const debug = (meta as any).debug;
  const canonical = isPlainObject(debug) ? (debug as any).canonical_timing : null;
  return isPlainObject(canonical) ? canonical : null;
}

function readCanonicalDuration(plan: TProductionPlan): number | null {
  const canonical = readCanonicalTiming(plan);
  const raw = canonical ? Number(canonical.durationSec) : NaN;
  return Number.isFinite(raw) && raw >= 1 ? raw : null;
}

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(180, Math.round(n * 10) / 10));
}

function sumSceneDurations(scenes: TPlanScene[] | undefined): number {
  if (!Array.isArray(scenes)) return 0;
  let acc = 0;
  for (const s of scenes) {
    const v = Number((s as any)?.durationSec);
    if (Number.isFinite(v) && v > 0) acc += v;
  }
  return Math.round(acc * 10) / 10;
}

function canonicalWindowTotal(canonical: Record<string, any> | null): number | null {
  const windows = Array.isArray(canonical?.windows) ? canonical.windows : [];
  if (windows.length < 2) return null;
  let maxEnd = 0;
  for (const win of windows) {
    const start = Number(win?.start);
    const end = Number(win?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    maxEnd = Math.max(maxEnd, end);
  }
  return maxEnd >= 1 ? Math.round(maxEnd * 10) / 10 : null;
}

function canonicalDurationIsValidated(
  canonical: Record<string, any> | null,
  canonicalDur: number | null,
  scenes: TPlanScene[],
  currentSum: number,
): boolean {
  if (!canonical || !canonicalDur || canonicalDur < 1) return false;

  const source = String(canonical.source ?? '').toLowerCase();
  const sceneCount = Number(canonical.sceneCount ?? canonical.shots);
  const windowTotal = canonicalWindowTotal(canonical);

  // Concrete time windows are the strongest signal — but only when the
  // extracted max-end actually equals the advertised canonical duration.
  if (source === 'time-windows' && windowTotal && Math.abs(windowTotal - canonicalDur) < 0.5) {
    return true;
  }

  // Scene math (e.g. 3 Szenen à 5s) is valid when it matches the current
  // scene structure. This may redistribute a generic fallback plan.
  if (source === 'scene-math' && Number.isFinite(sceneCount) && sceneCount === scenes.length) {
    return true;
  }

  // Explicit totals are too easy to over-match in long briefings. Treat them
  // as display/provenance unless the scenes already agree or the plan has no
  // useful durations yet. This prevents stale "50s" metadata from stretching
  // a real 10/15s script.
  if (source === 'explicit-total' || source === 'script' || source === 'board') {
    return currentSum < 1 || Math.abs(currentSum - canonicalDur) < 0.5;
  }

  return false;
}

function redistributeSceneDurations(
  scenes: TPlanScene[],
  target: number,
): { scenes: TPlanScene[]; changed: boolean } {
  const n = scenes.length;
  if (n === 0) return { scenes, changed: false };
  const currentSum = sumSceneDurations(scenes);
  if (Math.abs(currentSum - target) < 0.25) {
    return { scenes, changed: false };
  }
  // If a scene has non-positive duration, distribute equally.
  const anyInvalid = scenes.some((s) => !Number.isFinite(Number((s as any)?.durationSec)) || Number((s as any)?.durationSec) <= 0);
  if (currentSum <= 0 || anyInvalid) {
    const per = Math.max(1, Math.round((target / n) * 10) / 10);
    const next = scenes.map((s) => ({ ...(s as any), durationSec: per } as TPlanScene));
    // Adjust last scene so exact sum = target.
    const currSum = per * n;
    const drift = Math.round((target - currSum) * 10) / 10;
    if (Math.abs(drift) >= 0.1 && next.length > 0) {
      const last = next[next.length - 1] as any;
      last.durationSec = Math.max(1, Math.round((Number(last.durationSec) + drift) * 10) / 10);
    }
    return { scenes: next, changed: true };
  }
  // Proportional scaling of existing durations.
  const factor = target / currentSum;
  const scaled = scenes.map((s) => {
    const d = Number((s as any).durationSec) || 0;
    return { ...(s as any), durationSec: Math.max(1, Math.round(d * factor * 10) / 10) } as TPlanScene;
  });
  const scaledSum = sumSceneDurations(scaled);
  const drift = Math.round((target - scaledSum) * 10) / 10;
  if (Math.abs(drift) >= 0.1 && scaled.length > 0) {
    const last = scaled[scaled.length - 1] as any;
    last.durationSec = Math.max(1, Math.round((Number(last.durationSec) + drift) * 10) / 10);
  }
  return { scenes: scaled, changed: true };
}

function sanitizeCastIds(scenes: TPlanScene[]): { scenes: TPlanScene[]; changed: boolean; droppedCharIds: number; droppedVoiceIds: number } {
  let changed = false;
  let droppedCharIds = 0;
  let droppedVoiceIds = 0;
  const next = scenes.map((s) => {
    const cast = Array.isArray((s as any).cast) ? [...(s as any).cast] : [];
    let sceneChanged = false;
    for (let i = 0; i < cast.length; i += 1) {
      const c = { ...(cast[i] ?? {}) } as any;
      // characterId: wenn nicht UUID, auf null setzen (kein "George"-String).
      if (c.characterId && typeof c.characterId === 'string' && !UUID_RE.test(c.characterId)) {
        c.characterId = null;
        droppedCharIds += 1;
        sceneChanged = true;
      }
      // voiceId: wenn UUID-Format, ist es fast sicher versehentlich ein
      // Charakter-UUID → entfernen, damit der Voice-Resolver sauber
      // aus dem Default nachlädt.
      if (c.voiceId && typeof c.voiceId === 'string' && UUID_RE.test(c.voiceId)) {
        c.voiceId = null;
        droppedVoiceIds += 1;
        sceneChanged = true;
      }
      cast[i] = c;
    }
    if (sceneChanged) {
      changed = true;
      return { ...(s as any), cast } as TPlanScene;
    }
    return s;
  });
  return { scenes: changed ? next : scenes, changed, droppedCharIds, droppedVoiceIds };
}

export function finalizePlanCanonical(plan: TProductionPlan | null | undefined): {
  plan: TProductionPlan;
  normalization: PlanNormalization;
} | null {
  if (!plan) return null;
  const actions: string[] = [];

  const canonicalTiming = readCanonicalTiming(plan);
  const canonicalDur = readCanonicalDuration(plan);
  const projectTotal = Number((plan as any)?.project?.totalDurationSec);
  const scenes: TPlanScene[] = Array.isArray((plan as any).scenes) ? [...(plan as any).scenes] : [];
  const currentSum = sumSceneDurations(scenes);
  const canonicalValidated = canonicalDurationIsValidated(canonicalTiming, canonicalDur, scenes, currentSum);

  // Ziel-Dauer bestimmen. Wichtig: ein bereits konkret getakteter Szenenplan
  // gewinnt vor widersprüchlichem Projekt-/Canonical-Meta. Nur validierte
  // Briefing-Timings dürfen Szenendauern proportional umverteilen.
  let target = 0;
  let source: PlanNormalization['durationSource'] = 'default';
  if (canonicalValidated && canonicalDur && canonicalDur >= 1) {
    target = clampDuration(canonicalDur);
    source = 'canonical-briefing';
  } else if (currentSum >= 1) {
    target = clampDuration(currentSum);
    source = 'scene-sum';
    if (canonicalDur && Math.abs(canonicalDur - currentSum) >= 0.5) {
      actions.push(`ignored-canonical:${canonicalDur}s→${target}s`);
    }
    if (Number.isFinite(projectTotal) && projectTotal >= 1 && Math.abs(projectTotal - currentSum) >= 0.5) {
      actions.push(`ignored-project:${projectTotal}s→${target}s`);
    }
  } else if (Number.isFinite(projectTotal) && projectTotal >= 1) {
    target = clampDuration(projectTotal);
    source = 'plan-project';
  } else {
    target = Math.max(scenes.length, 1) * 5;
    source = 'default';
    actions.push(`fallback-default:${target}s`);
  }

  // Szenen anpassen, damit Summe = Ziel.
  const redistributed = redistributeSceneDurations(scenes, target);
  const finalScenes = redistributed.scenes;
  if (redistributed.changed) {
    actions.push(`redistributed-scenes:${currentSum}s→${target}s`);
  }

  // Cast/Voice-Sanitize.
  const sanitized = sanitizeCastIds(finalScenes);
  if (sanitized.changed) {
    actions.push(`sanitized-cast:${sanitized.droppedCharIds}chars/${sanitized.droppedVoiceIds}voices`);
  }

  const finalSum = sumSceneDurations(sanitized.scenes);
  const consistent = Math.abs(finalSum - target) < 0.5;

  const previousTotal = Number.isFinite(projectTotal) ? projectTotal : undefined;
  const previousSum = currentSum;

  if (Number.isFinite(projectTotal) && Math.abs(projectTotal - target) >= 0.5) {
    actions.push(`project-total:${projectTotal}s→${target}s`);
  }

  const nextPlan: TProductionPlan = {
    ...(plan as any),
    project: {
      ...((plan as any).project ?? {}),
      totalDurationSec: target,
    },
    scenes: sanitized.scenes,
    _meta: {
      ...((plan as any)._meta ?? {}),
      debug: {
        ...(((plan as any)._meta as any)?.debug ?? {}),
        normalization: {
          totalDurationSec: target,
          sceneCount: sanitized.scenes.length,
          durationSource: source,
          previousTotal,
          previousSum,
          actions,
          consistent,
          at: new Date().toISOString(),
        },
      },
    },
  } as TProductionPlan;

  return {
    plan: nextPlan,
    normalization: {
      totalDurationSec: target,
      sceneCount: sanitized.scenes.length,
      durationSource: source,
      previousTotal,
      previousSum,
      actions,
      consistent,
    },
  };
}

/**
 * Prüft, ob der Plan „Skript-/Literal-Modus" hat. In diesem Fall darf die
 * Ensemble-Garantie NICHT eingreifen — die Sprecherverteilung wurde vom
 * User oder vom Skript vorgegeben.
 */
export function planIsScriptLocked(plan: TProductionPlan | null | undefined): boolean {
  if (!plan) return false;
  const meta = (plan as any)._meta;
  if (!isPlainObject(meta)) return false;
  const fidelity = (meta as any).fidelity;
  if (isPlainObject(fidelity) && (fidelity as any).mode === 'literal') return true;
  const scriptTiming = (meta as any).script_timing;
  if (isPlainObject(scriptTiming)) {
    const mode = String((scriptTiming as any).mode ?? '').toUpperCase();
    if (mode && mode !== 'FREETEXT' && mode !== 'AUTO') return true;
  }
  return false;
}
