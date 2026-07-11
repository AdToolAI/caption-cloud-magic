/**
 * useStoryboardTransition
 *
 * Owns the Briefing → Storyboard handoff. When the user navigates to the
 * Storyboard step for the first time on a fresh project, this hook:
 *
 *  1. Decides whether the briefing should be deep-parsed at all (guard).
 *  2. Triggers `briefing-deep-parse` and drives the War Room overlay
 *     with realistic phase + progress signals.
 *  3. Hands the resulting plan to the ProductionPlanSheet for review.
 *
 * Lip-Sync safety: the guard short-circuits as soon as ANY scene exists
 * with rendered/locked/lipsync state. We never re-analyze on top of a
 * touched storyboard, so the pipeline (compose-video-clips,
 * dialog_shots, syncso_*) is never disturbed.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProductionPlan, PlanScene, type TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
import { ensureProductionPlanEnsemble } from '@/lib/video-composer/briefing/ensurePlanEnsemble';
import { toast } from '@/hooks/use-toast';
import { extractFunctionsErrorDetails } from '@/lib/functionsError';
import type { ComposerScene, ComposerBriefing } from '@/types/video-composer';
import { readBriefingContract } from '@/lib/video-composer/briefing/briefingContract';

/**
 * Build a deterministic Hook/Reveal/CTA arc so the user is never blocked
 * when the AI gateway is unreachable. Mirrors the server-side safety arc
 * in briefing-deep-parse but additionally **scans the raw briefing text**
 * for explicit `SZENE N` / `DIALOG …: "…"` / `SHOT:` / `KAMERA:` blocks
 * and lifts the user's actual values into the plan so the storyboard
 * isn't reduced to generic placeholders.
 */
type SceneHint = {
  beat?: string;
  dialog?: string;
  shot?: string;
  camera?: string;
  emotion?: string;
  framing?: string;
  movement?: string;
  lighting?: string;
  // Stage-3: plan→storyboard mapping completion
  transition?: 'none' | 'fade' | 'crossfade' | 'wipe' | 'slide' | 'zoom';
  transitionDurationSec?: number;
  overlayText?: string;
  overlayPosition?: 'top' | 'center' | 'bottom';
  tone?: string;
  seed?: number;
};

type BriefingTiming = {
  durationSec: number;
  sceneCount?: number;
  /** True when the briefing explicitly says one uninterrupted/continuous scene. */
  continuousScene?: boolean;
  /** True when sceneCount came from an explicit scene-count field, not inferred windows. */
  explicitSceneCount?: boolean;
  /** True when the UI duration slider intentionally overrides text/server timing. */
  sliderAuthoritative?: boolean;
  source: 'explicit-total' | 'time-windows' | 'scene-math';
};

type BriefingTimingWithWindows = BriefingTiming & {
  windows?: Array<{ start: number; end: number }>;
};

const MIN_USER_SLIDER_DURATION_SEC = 15;

function normalizeUserSliderDuration(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value >= MIN_USER_SLIDER_DURATION_SEC && value <= 600
    ? value
    : null;
}

export function readRequestedDurationFromPlan(plan: TProductionPlan | null | undefined): number | null {
  const debug = (plan as any)?._meta?.debug;
  const candidates = [
    debug?.requestedDurationSec,
    debug?.sliderDurationSec,
    debug?.briefingDurationSec,
    debug?.canonical_timing?.requestedDurationSec,
  ];
  for (const candidate of candidates) {
    const value = normalizeUserSliderDuration(candidate);
    if (value !== null) return value;
  }
  return null;
}

function attachRequestedDurationToPlan(plan: TProductionPlan, requestedDurationSec: number | null): TProductionPlan {
  if (requestedDurationSec === null) return plan;
  return {
    ...(plan as any),
    _meta: {
      ...((plan as any)._meta ?? {}),
      debug: {
        ...((plan as any)._meta?.debug ?? {}),
        requestedDurationSec,
      },
    },
  } as TProductionPlan;
}

function resolveAuthoritativeSliderDuration(briefing: ComposerBriefing, plan: TProductionPlan): number | null {
  // The UI slider cannot produce 5.1s (min 15s, step 15). Values below 15s
  // are therefore stale plan feedback and must not be treated as user input.
  return normalizeUserSliderDuration(briefing?.duration) ?? readRequestedDurationFromPlan(plan);
}

function normalizeDurationNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clampDurationForPlan(seconds: number): number {
  return Math.max(1, Math.min(600, Math.round(seconds)));
}

function parseSmallCount(raw: string | undefined): number | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  const n = Number(value.replace(',', '.'));
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.round(n);
  const words: Record<string, number> = {
    ein: 1, eine: 1, einen: 1, einer: 1, eines: 1, one: 1, single: 1,
    zwei: 2, two: 2,
    drei: 3, three: 3,
    vier: 4, four: 4,
    fünf: 5, fuenf: 5, five: 5,
    sechs: 6, six: 6,
    sieben: 7, seven: 7,
    acht: 8, eight: 8,
    neun: 9, nine: 9,
    zehn: 10, ten: 10,
    elf: 11, eleven: 11,
    zwölf: 12, zwoelf: 12, twelve: 12,
  };
  return words[value] ?? null;
}

function detectSceneContract(rawInput: string): { sceneCount?: number; continuousScene?: boolean; explicitSceneCount?: boolean } {
  const raw = String(rawInput ?? '');
  const continuousRe = /\b(?:(?:eine?|1|one|single)\s+(?:durchgehende|zusammenh[aä]ngende|kontinuierliche|ununterbrochene|continuous|uninterrupted|single|one[-\s]?take)\s+(?:szene|scene)|(?:szene|scene)\s*(?:[:=\-–—]\s*)?(?:eine?|1|one|single)\s+(?:durchgehende|zusammenh[aä]ngende|kontinuierliche|ununterbrochene|continuous|uninterrupted|single|one[-\s]?take)?\s*(?:szene|scene)?)\b/i;
  const fieldRe = /(?:^|\n)\s*(?:szenen?|scenes?|scene\s*count|anzahl\s+szenen?)\s*[:=\-–—]\s*(?:ca\.?\s*)?([1-9]\d?|ein(?:e[rsn]?)?|one|single|zwei|two|drei|three|vier|four|f[üu]nf|fuenf|five|sechs|six|sieben|seven|acht|eight|neun|nine|zehn|ten|elf|eleven|zw[öo]lf|zwoelf|twelve)\b([^\n]*)/i;
  const field = raw.match(fieldRe);
  if (field) {
    const count = parseSmallCount(field[1]);
    if (count) {
      const suffix = String(field[2] ?? '');
      return {
        sceneCount: count,
        continuousScene: count === 1 && (continuousRe.test(field[0]) || /\b(?:durchgehend|durchgehende|zusammenh[aä]ngend|kontinuierlich|ununterbrochen|continuous|uninterrupted|one[-\s]?take|single)\b/i.test(suffix)),
        explicitSceneCount: true,
      };
    }
  }

  const countBeforeUnit = raw.match(/(?:^|[^\d])([1-9]\d?)\s*(?:x|×)?\s*(?:szenen|scenes|shots?)\b/i);
  const unitCount = countBeforeUnit ? Number(countBeforeUnit[1]) : undefined;
  if (unitCount && unitCount >= 1 && unitCount <= 12) {
    return { sceneCount: unitCount, continuousScene: unitCount === 1 && continuousRe.test(raw), explicitSceneCount: true };
  }

  if (continuousRe.test(raw)) {
    return { sceneCount: 1, continuousScene: true, explicitSceneCount: true };
  }

  return {};
}

function getOriginalBriefingSource(briefing: ComposerBriefing, briefingText: string): string {
  // Prefer the user's original briefing/script over the generated wrapper text,
  // because the wrapper also appends the current board value (e.g. 30s).
  const productDescription = String(briefing.productDescription ?? '').trim();
  if (productDescription) return productDescription;

  // If only the generated parser payload is available, keep everything before
  // the synthetic "## Project" block and strip explicit board-duration lines.
  return String(briefingText ?? '')
    .split(/\n\s*##\s+Project\b/i)[0]
    .replace(/^\s*-\s*Total duration\s*:\s*\d+(?:[,.]\d+)?\s*s\s*$/gim, '')
    .trim();
}

export function detectCanonicalBriefingTiming(briefing: ComposerBriefing, briefingText: string): BriefingTimingWithWindows | null {
  const raw = getOriginalBriefingSource(briefing, briefingText);
  if (!raw.trim()) return null;

  const sceneContract = detectSceneContract(raw);
  const sceneCount = sceneContract.sceneCount;

  // Strongest signal: explicit total duration words in the actual briefing.
  const explicitTotalPatterns = [
    /(?:gesamt\s*dauer|gesamtdauer|gesamt\s*länge|gesamtlaenge|gesamtlänge|total\s*duration|filmdauer|film\s*dauer|video\s*dauer|spot\s*dauer|laufzeit)(?:\s+(?:des|der|vom|für|fuer|of)\s+(?:videos?|films?|spots?|ads?))?\s*[:=\-–—]?\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i,
    /(?:dauer|duration|länge|laenge)\s+(?:des|der|vom|für|fuer|of)\s+(?:videos?|films?|spots?|ads?)\s*[:=\-–—]?\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i,
    // "Länge: ca. 15 Sekunden" as a standalone field.
    /(?:^|\n)\s*(?:länge|laenge|film[- ]?länge|film[- ]?laenge|video[- ]?länge|video[- ]?laenge|spot[- ]?länge|spot[- ]?laenge)\s*[:=\-–—]\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i,
    // "Ziel: In 15 Sekunden zeigen ..." / "In 15 seconds show ...".
    /(?:^|\n|[.!?]\s+)[^\n]{0,60}?\b(?:in|within|binnen)\s+(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b[^\n]{0,120}?\b(?:zeigen|show|demonstrieren|demonstrate|erzählen|erzaehlen|video|film|spot|commercial)\b/i,
    /(\d+(?:[,.]\d+)?)\s*(?:sekunden|seconds|secs?|s)\b\s*(?:gesamt|total|insgesamt|overall|film|video|spot)\b/i,
    /\b(?:film|video|spot|werbevideo|werbespot|werbefilm|imagefilm|ad)\b[^\n]{0,80}?\b(\d+(?:[,.]\d+)?)\s*(?:sekunden|seconds|secs?|s)\b/i,
    /(?:ziel|vorgabe|briefing)\s*[:=\-–—]?\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i,
  ];
  for (const re of explicitTotalPatterns) {
    const m = raw.match(re);
    const seconds = normalizeDurationNumber(m?.[1]);
    if (seconds && seconds >= 3) {
      return { durationSec: clampDurationForPlan(seconds), sceneCount, continuousScene: sceneContract.continuousScene, explicitSceneCount: sceneContract.explicitSceneCount, source: 'explicit-total' };
    }
  }

  // Common compact form: "15 Sekunden / 3 Szenen à 5s".
  const compact = raw.match(/(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b\s*(?:[\/|,;·\-–—]|\(|\[)?\s*([1-9]\d?)\s*(?:szenen|scenes|shots?)\b/i);
  const compactSeconds = normalizeDurationNumber(compact?.[1]);
  if (compactSeconds && compactSeconds >= 3) {
    return { durationSec: clampDurationForPlan(compactSeconds), sceneCount: Number(compact?.[2] ?? sceneCount), continuousScene: sceneContract.continuousScene, explicitSceneCount: sceneContract.explicitSceneCount || Boolean(compact?.[2]), source: 'explicit-total' };
  }

  // "3 Szenen insgesamt 15 Sekunden" / "3 scenes total 15s".
  const countThenTotal = raw.match(/([1-9]\d?)\s*(?:szenen|scenes|shots?)\b[^\n]{0,90}?(?:gesamt|insgesamt|total|overall|dauer|duration)[^\n]{0,30}?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i);
  const countThenTotalSeconds = normalizeDurationNumber(countThenTotal?.[2]);
  if (countThenTotal && countThenTotalSeconds && countThenTotalSeconds >= 3) {
    return { durationSec: clampDurationForPlan(countThenTotalSeconds), sceneCount: Number(countThenTotal[1]), continuousScene: sceneContract.continuousScene, explicitSceneCount: true, source: 'explicit-total' };
  }

  // Time windows in scene/shot markers: 0–5s, 5-10s, 10–15s → total 15s.
  // Capture unit groups so we can require an explicit time unit or contextual time anchor.
  const windowRe = /(?:^|[^\d])(\d+(?:[,.]\d+)?)\s*(s|sec|sek\.?|sekunden|seconds)?\s*[–—-]\s*(\d+(?:[,.]\d+)?)\s*(s|sec|sek\.?|sekunden|seconds)?\b/gi;
  const ageTailRe = /^\s*(?:jahre|jahren|jährig|jaehrig|jährige|jaehrige|years?|yrs?|y\.o\.?)\b/i;
  const timeAnchorRe = /(?:zeit|timing|sek|sekunden|second|second|dauer|duration|shot|szene|scene|hook|cta|frame|beat|marker|clip)/i;
  let maxEnd = 0;
  let windows = 0;
  const parsedWindows: Array<{ start: number; end: number }> = [];
  for (const m of raw.matchAll(windowRe)) {
    const start = normalizeDurationNumber(m[1]);
    const end = normalizeDurationNumber(m[3]);
    if (start === null || end === null || end <= start || end > 600) continue;
    const idx = (m.index ?? 0);
    // Skip if this is an "N–M Jahre" age range.
    const after = raw.slice(idx + m[0].length, idx + m[0].length + 20);
    if (ageTailRe.test(after)) continue;
    // Require an explicit time unit in the match OR a time-related anchor in the same line.
    const hasUnit = Boolean(m[2] || m[4]);
    if (!hasUnit) {
      const lineStart = raw.lastIndexOf('\n', idx) + 1;
      const lineEnd = raw.indexOf('\n', idx);
      const line = raw.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (!timeAnchorRe.test(line)) continue;
    }
    maxEnd = Math.max(maxEnd, end);
    windows += 1;
    parsedWindows.push({ start, end });
  }
  if (windows >= 2 && maxEnd >= 3) {
    return { durationSec: clampDurationForPlan(maxEnd), sceneCount: sceneCount ?? windows, continuousScene: sceneContract.continuousScene, explicitSceneCount: sceneContract.explicitSceneCount, source: 'time-windows', windows: parsedWindows };
  }

  // "3 Szenen à 5 Sekunden" → 15s.
  const sceneMath = raw.match(/([1-9]\d?)\s*(?:szenen|scenes|shots?)\b[^\n]{0,60}?(?:à|a|je|each|x|×)\s*(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i);
  const perScene = normalizeDurationNumber(sceneMath?.[2]);
  if (sceneMath && perScene) {
    const count = Number(sceneMath[1]);
    return { durationSec: clampDurationForPlan(count * perScene), sceneCount: count, continuousScene: sceneContract.continuousScene, explicitSceneCount: true, source: 'scene-math' };
  }

  return null;
}

function mergeScenesToSingleScene(scenes: TProductionPlan['scenes'], targetDurationSec: number): TProductionPlan['scenes'] {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes;
  const base = { ...(scenes[0] as any) };
  const castByKey = new Map<string, any>();
  const dialogTurns: any[] = [];
  let overlay: any = base.textOverlay;
  let voiceText = '';
  for (const scene of scenes as any[]) {
    for (const c of Array.isArray(scene?.cast) ? scene.cast : []) {
      const key = String(c?.characterId ?? c?.mentionKey ?? c?.characterName ?? '').toLowerCase();
      if (key && !castByKey.has(key)) castByKey.set(key, c);
    }
    if (Array.isArray(scene?.dialogTurns) && scene.dialogTurns.length > 0) {
      for (const turn of scene.dialogTurns) {
        const text = String(turn?.text ?? '').trim();
        if (text) dialogTurns.push({ ...turn, text });
      }
    } else if (scene?.voiceover?.text) {
      const text = String(scene.voiceover.text).trim();
      if (text) voiceText = voiceText ? `${voiceText} ${text}` : text;
    }
    if (!overlay && scene?.textOverlay) overlay = scene.textOverlay;
  }
  return [{
    ...base,
    index: 1,
    label: base.label ?? 'Durchgehende Szene',
    durationSec: targetDurationSec,
    cast: Array.from(castByKey.values()),
    lipSync: base.lipSync || dialogTurns.length > 0 || Array.from(castByKey.values()).length > 0,
    dialogTurns: dialogTurns.length > 0 ? dialogTurns : base.dialogTurns,
    voiceover: dialogTurns.length > 0
      ? undefined
      : (voiceText ? { ...(base.voiceover ?? {}), text: voiceText } : base.voiceover),
    textOverlay: overlay,
  } as any];
}

function alignPlanScenesToCanonicalTiming(plan: TProductionPlan, timing: BriefingTimingWithWindows): TProductionPlan['scenes'] {
  const currentScenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const desiredCount = timing.explicitSceneCount && timing.sceneCount && timing.sceneCount >= 1
    ? Math.max(1, Math.min(12, Math.round(timing.sceneCount)))
    : currentScenes.length;
  let scenes = currentScenes;
  if (desiredCount === 1 && scenes.length > 1) {
    scenes = mergeScenesToSingleScene(scenes, timing.durationSec);
  } else if (desiredCount > 0 && scenes.length !== desiredCount) {
    if (scenes.length > desiredCount) {
      scenes = scenes.slice(0, desiredCount);
    } else if (scenes.length > 0) {
      const template = scenes[scenes.length - 1];
      while (scenes.length < desiredCount) {
        scenes = [...scenes, { ...(template as any), index: scenes.length + 1, label: `S${scenes.length + 1}` } as any];
      }
    }
  }

  const sceneCount = scenes.length || currentScenes.length || 1;
  const equalDuration = timing.durationSec / sceneCount;
  const windowsMatchScenes = !timing.continuousScene && Array.isArray(timing.windows) && timing.windows.length === sceneCount;
  return scenes.map((scene, index) => {
    const win = windowsMatchScenes ? timing.windows?.[index] : undefined;
    const durationSec = win && win.end > win.start
      ? Math.max(1, Math.min(60, Math.round((win.end - win.start) * 10) / 10))
      : Math.max(1, Math.min(60, Math.round(equalDuration * 10) / 10));
    return { ...scene, index: index + 1, durationSec };
  });
}

/**
 * Phase 2 (refactor): the Edge Function is now the sole authority for
 * canonical timing. If it stamped `_meta.debug.briefing_contract` we trust
 * that verbatim and skip local re-detection. The client-side detector only
 * runs as a legacy fallback for offline / local-fallback plans.
 */
function readServerContractAsTiming(plan: TProductionPlan): BriefingTimingWithWindows | null {
  const contract = readBriefingContract(plan);
  if (!contract) return null;
  const durationSec = contract.durationSec;
  if (!Number.isFinite(durationSec as number) || (durationSec as number) <= 0) return null;
  return {
    durationSec: durationSec as number,
    sceneCount: contract.sceneCount > 0 ? contract.sceneCount : undefined,
    explicitSceneCount: contract.explicitSceneCount,
    continuousScene: contract.continuousScene,
    source:
      contract.source === 'script' || contract.scriptTimingMode === 'SHOT_MARKERS'
        ? 'time-windows'
        : 'explicit-total',
  };
}

export function applyCanonicalTimingToPlan(
  plan: TProductionPlan,
  briefing: ComposerBriefing,
  briefingText: string,
): { plan: TProductionPlan; timing: BriefingTimingWithWindows | null; changed: boolean } {
  const requestedDurationSec = resolveAuthoritativeSliderDuration(briefing, plan);
  const serverTiming = readServerContractAsTiming(plan);
  const localTiming = detectCanonicalBriefingTiming(briefing, briefingText);
  let timing = serverTiming ?? localTiming;

  // If an old server contract only carries short shot windows (e.g. 5.1s)
  // but the raw briefing contains a valid explicit total (e.g. 15s), prefer
  // the explicit briefing total unless the user slider overrides both below.
  if (
    !requestedDurationSec &&
    serverTiming &&
    localTiming &&
    localTiming.durationSec >= MIN_USER_SLIDER_DURATION_SEC &&
    serverTiming.durationSec < MIN_USER_SLIDER_DURATION_SEC
  ) {
    timing = localTiming;
  }

  // v233 — Slider wins. Wenn der Nutzer im Briefing-Tab eine Videodauer per
  // Slider gesetzt hat, ist das die einzige Wahrheit. Text-Angaben und
  // Server-Contract werden proportional auf diesen Wert normalisiert, damit
  // es keine Verwirrung mehr gibt ("Text sagt 15s, Slider steht auf 5s").
  // v235 — harte Durchsetzung: alte Shot-Windows dürfen NICHT erhalten bleiben,
  // sonst ziehen sie die Szenenebene wieder auf z.B. 1.7+1.7+1.7=5.1s zurück.
  const sliderDuration = requestedDurationSec;
  if (sliderDuration !== null) {
    if (timing) {
      timing = {
        ...timing,
        durationSec: sliderDuration,
        source: 'explicit-total',
        windows: undefined,
        sliderAuthoritative: true,
        requestedDurationSec: sliderDuration,
      };
    } else {
      timing = {
        durationSec: sliderDuration,
        sceneCount: undefined,
        explicitSceneCount: false,
        continuousScene: false,
        source: 'explicit-total',
        sliderAuthoritative: true,
        requestedDurationSec: sliderDuration,
      } as BriefingTimingWithWindows;
    }
  }

  if (!timing) return { plan, timing: null, changed: false };


  const target = timing.durationSec;
  const debugTiming = requestedDurationSec !== null
    ? { ...timing, requestedDurationSec }
    : timing;
  const sceneCount = plan.scenes?.length ?? 0;
  if (sceneCount <= 0) {
    const next = ProductionPlan.parse({
      ...plan,
      project: { ...(plan.project ?? {}), totalDurationSec: target },
      _meta: {
        ...(plan._meta ?? {}),
        debug: {
          ...((plan._meta as any)?.debug ?? {}),
          ...(requestedDurationSec !== null ? { requestedDurationSec } : {}),
          canonical_timing: debugTiming,
        },
      },
    });
    (next as any)._meta = {
      ...((next as any)._meta ?? {}),
      script_timing: {
        mode: timing.source === 'time-windows' ? 'SHOT_MARKERS' : 'FREETEXT',
        shots: timing.sceneCount ?? 0,
        source: 'briefing',
      },
      debug: {
        ...(((next as any)._meta as any)?.debug ?? {}),
        ...(requestedDurationSec !== null ? { requestedDurationSec } : {}),
        canonical_timing: debugTiming,
      },
    };
    return { plan: next, timing, changed: true };
  }

  const currentTotal = plan.project?.totalDurationSec;
  const sum = plan.scenes.reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0);
  const desiredSceneCount = timing.explicitSceneCount ? timing.sceneCount : undefined;
  const alreadyAligned = Math.abs((currentTotal ?? sum) - target) < 0.5
    && Math.abs(sum - target) < 0.5
    && (!desiredSceneCount || sceneCount === desiredSceneCount);
  const nextScenes = alignPlanScenesToCanonicalTiming(plan, timing);

  const next = ProductionPlan.parse({
    ...plan,
    project: { ...(plan.project ?? {}), totalDurationSec: target },
    scenes: nextScenes,
    _meta: {
      ...(plan._meta ?? {}),
      debug: {
        ...((plan._meta as any)?.debug ?? {}),
        ...(requestedDurationSec !== null ? { requestedDurationSec } : {}),
        canonical_timing: debugTiming,
      },
    },
  });

  (next as any)._meta = {
    ...((next as any)._meta ?? {}),
    script_timing: (plan._meta as any)?.script_timing ?? {
        mode: timing.continuousScene ? 'SPEAKER_BLOCKS' : timing.source === 'time-windows' ? 'SHOT_MARKERS' : timing.source === 'scene-math' ? 'SPEAKER_BLOCKS' : 'FREETEXT',
        shots: timing.sceneCount ?? nextScenes.length,
      source: 'briefing',
    },
    debug: {
      ...(((next as any)._meta as any)?.debug ?? {}),
      ...(requestedDurationSec !== null ? { requestedDurationSec } : {}),
      canonical_timing: debugTiming,
    },
  };

  return { plan: next, timing: debugTiming, changed: !alreadyAligned };
}

const FRAMING_TOKENS: Array<[RegExp, string]> = [
  [/extreme[-\s]?close[-\s]?up|ECU/i, 'extreme-close-up'],
  [/close[-\s]?up|\bCU\b/i, 'close-up'],
  [/medium[-\s]?close[-\s]?up|MCU/i, 'medium-close-up'],
  [/medium[-\s]?shot|medium\b/i, 'medium'],
  [/wide[-\s]?shot|extreme[-\s]?wide|establishing|wide\b/i, 'wide'],
  [/over[-\s]?the[-\s]?shoulder|OTS/i, 'over-the-shoulder'],
];
const MOVEMENT_TOKENS: Array<[RegExp, string]> = [
  [/static|statisch/i, 'static'],
  [/push[-\s]?in|dolly[-\s]?in/i, 'slow-push-in'],
  [/pull[-\s]?out|dolly[-\s]?out/i, 'slow-pull-out'],
  [/pan/i, 'pan'],
  [/track(ing)?/i, 'tracking'],
  [/handheld|breathing/i, 'handheld'],
];
const LIGHTING_TOKENS: Array<[RegExp, string]> = [
  [/laptop[-\s]?glow|monitor[-\s]?glow|screen[-\s]?glow/i, 'screen-glow'],
  [/golden[-\s]?hour/i, 'golden-hour'],
  [/window|tageslicht|natural[-\s]?light/i, 'soft-window'],
  [/neon/i, 'neon'],
  [/low[-\s]?key|dunkel|dark/i, 'low-key'],
  [/high[-\s]?key|hell|bright/i, 'high-key'],
];

function classify(text: string | undefined, table: Array<[RegExp, string]>): string | undefined {
  if (!text) return undefined;
  for (const [re, v] of table) if (re.test(text)) return v;
  return undefined;
}

/**
 * Splits the briefing into SZENE-blocks and pulls out DIALOG / SHOT /
 * KAMERA / EMOTION lines per block. Works on both German and English
 * briefings; tolerant of whitespace and ASCII dashes.
 */
function extractSceneHints(briefingText: string): SceneHint[] {
  if (!briefingText) return [];
  // Split on "SZENE N" / "SCENE N" / "SZENE 1 —" markers.
  const parts = briefingText.split(/(?:^|\n)\s*(?:SZENE|SCENE)\s+(\d+)\b/i);
  // parts = [pre, '1', block1, '2', block2, ...]
  const blocks: Array<{ idx: number; body: string }> = [];
  for (let i = 1; i < parts.length; i += 2) {
    const idx = Number(parts[i]);
    const body = String(parts[i + 1] ?? '');
    if (Number.isFinite(idx) && body) blocks.push({ idx, body });
  }
  if (blocks.length === 0) return [];

  // Quoted dialog ("..." or „…" or “…”). First match wins per block.
  const dialogRe = /DIALOG[^"„“]*["„“]([^"„“]+)["“”]/i;
  const shotRe = /SHOT\s*:\s*([^\n]+)/i;
  const camRe = /(?:KAMERA|CAMERA)\s*:\s*([^\n]+)/i;
  const emoRe = /(?:EMOTION|MOOD)\s*:\s*([^\n]+)/i;
  const beatRe = /(?:^|\n)\s*(?:—\s*)?(HOOK|REVEAL|PUNCHLINE|CTA|PROBLEM|PAIN|SOLUTION|LÖSUNG|DEMO|PROOF)\b/i;
  // Stage-3 extractors
  const transitionRe = /(?:TRANSITION|ÜBERGANG|UEBERGANG)\s*:\s*(none|cut|hard\s*cut|fade|crossfade|wipe|slide|zoom)(?:\s*[,·\-]\s*([0-9.]+)\s*s?)?/i;
  const overlayRe = /(?:OVERLAY|TEXT[-\s]?OVERLAY|ON[-\s]?SCREEN[-\s]?TEXT|EINBLENDUNG)\s*:\s*["„“]?([^"\n„“”]+)["“”]?(?:\s*[\(\[]\s*(top|center|middle|bottom)\s*[\)\]])?/i;
  const toneRe = /(?:TONE|TON|STIMMUNG)\s*:\s*([^\n]+)/i;
  const seedRe = /SEED\s*[:=]\s*(\d{1,10})/i;

  return blocks
    .sort((a, b) => a.idx - b.idx)
    .map(({ body }) => {
      const dialog = body.match(dialogRe)?.[1]?.trim();
      const shot = body.match(shotRe)?.[1]?.trim();
      const camera = body.match(camRe)?.[1]?.trim();
      const emotion = body.match(emoRe)?.[1]?.trim();
      const beat = body.match(beatRe)?.[1]?.trim();
      const blob = `${shot ?? ''} ${camera ?? ''}`;

      // Transition
      const tMatch = body.match(transitionRe);
      let transition: SceneHint['transition'];
      let transitionDurationSec: number | undefined;
      if (tMatch) {
        const raw = tMatch[1].toLowerCase().replace(/\s+/g, '');
        transition = raw === 'cut' || raw === 'hardcut' ? 'none'
          : (['none','fade','crossfade','wipe','slide','zoom'].includes(raw) ? (raw as SceneHint['transition']) : undefined);
        const d = Number(tMatch[2]);
        if (Number.isFinite(d) && d >= 0 && d <= 3) transitionDurationSec = d;
      }
      // Overlay
      const oMatch = body.match(overlayRe);
      const overlayText = oMatch?.[1]?.trim();
      const overlayPosRaw = oMatch?.[2]?.toLowerCase();
      const overlayPosition: SceneHint['overlayPosition'] =
        overlayPosRaw === 'top' ? 'top'
        : overlayPosRaw === 'center' || overlayPosRaw === 'middle' ? 'center'
        : overlayPosRaw === 'bottom' ? 'bottom'
        : undefined;
      // Tone & seed
      const tone = body.match(toneRe)?.[1]?.trim().slice(0, 80);
      const seedRaw = body.match(seedRe)?.[1];
      const seed = seedRaw ? Number(seedRaw) : undefined;

      return {
        beat,
        dialog,
        shot,
        camera,
        emotion,
        framing: classify(blob, FRAMING_TOKENS),
        movement: classify(blob, MOVEMENT_TOKENS),
        lighting: classify(`${shot ?? ''} ${body}`, LIGHTING_TOKENS),
        transition,
        transitionDurationSec,
        overlayText,
        overlayPosition,
        tone,
        seed: Number.isFinite(seed) ? seed : undefined,
      } as SceneHint;
    });
}

function buildLocalFallbackPlan(briefing: ComposerBriefing, briefingText: string): TProductionPlan {
  const hints = extractSceneHints(briefingText);
  const canonicalTiming = detectCanonicalBriefingTiming(briefing, briefingText);
  const sliderTotal = normalizeUserSliderDuration(briefing?.duration);
  const total = sliderTotal !== null
    ? sliderTotal
    : (canonicalTiming?.durationSec ?? 15);
  const firstMention = briefingText.match(/@[a-z0-9][a-z0-9-_]{1,47}/i)?.[0] ?? null;
  const firstChar = briefing.characters?.[0];
  const selectedCast = (briefing.characters ?? []).slice(0, 4).map((c) => ({
    mentionKey: `@${toMentionSlug(c.name)}`,
    characterId: c.brandCharacterId ?? null,
    characterName: c.name,
    voiceId: null,
  }));
  const cast = selectedCast.length > 0
    ? selectedCast
    : firstMention
    ? [{
        mentionKey: firstMention,
        characterId: firstChar?.brandCharacterId ?? null,
        characterName: firstChar?.name ?? firstMention.replace(/^@/, ''),
        voiceId: null,
      }]
    : [];

  const defaultBeats: Array<{ beat: string; framing: string; movement: string; energy: 'low' | 'mid' | 'high' }> = [
    { beat: 'Hook',   framing: 'medium-close-up', movement: 'slow-push-in', energy: 'high' },
    { beat: 'Reveal', framing: 'wide',            movement: 'tracking',     energy: 'mid'  },
    { beat: 'CTA',    framing: 'medium',          movement: 'static',       energy: 'high' },
  ];

  const sceneCount = canonicalTiming?.explicitSceneCount && canonicalTiming.sceneCount
    ? canonicalTiming.sceneCount
    : Math.max(canonicalTiming?.sceneCount ?? 0, hints.length, defaultBeats.length);
  const per = Math.max(1, Math.min(60, total / sceneCount));

  const hasDialogAnywhere = hints.some((h) => !!h.dialog);

  const scenes = Array.from({ length: sceneCount }).map((_, i) => {
    const h = hints[i];
    const fallback = defaultBeats[i] ?? defaultBeats[defaultBeats.length - 1];
    const beatLabel = h?.beat ?? fallback.beat;
    const framing = h?.framing ?? fallback.framing;
    const movement = h?.movement ?? fallback.movement;
    const lighting = h?.lighting ?? 'soft-window';
    const anchor = h?.shot
      ? h.shot
      : `${beatLabel} beat for ${briefing.productName ?? 'the brand'}: cinematic ${framing} shot, ${movement}, ${lighting} lighting.`;
    const voiceover = h?.dialog ? { text: h.dialog } : undefined;
    const isRequiredEnsemble = cast.length >= 2 && (i === 0 || (sceneCount >= 6 && i === sceneCount - 1));
    const sceneCast = isRequiredEnsemble ? cast : cast.slice(0, 1);
    return {
      index: i + 1,
      label: beatLabel,
      beat: beatLabel,
      durationSec: per,
      engine: (firstMention && (h?.dialog || !hasDialogAnywhere)) ? 'cinematic-sync' as const : 'broll' as const,
      lipSync: !!(firstMention && h?.dialog),
      cast: sceneCast,
      shotDirector: {
        framing,
        angle: 'eye-level',
        movement,
        lighting,
      },
      anchorPromptEN: anchor,
      voiceover,
      performance: {
        mimik: h?.emotion ?? (beatLabel.toLowerCase().includes('hook') ? 'confident' : beatLabel.toLowerCase().includes('cta') ? 'warm-smile' : 'curious'),
        gestik: beatLabel.toLowerCase().includes('cta') ? 'open-palms' : 'still',
        blick: (h?.dialog || beatLabel.toLowerCase().includes('cta')) ? 'to-camera' : 'away',
        energy: fallback.energy === 'high' ? 4 : 3,
      },
      musicCue: { energy: fallback.energy },
      // Stage-3: surface extracted plan→storyboard fields when present.
      transition: h?.transition
        ? { type: h.transition, durationSec: h.transitionDurationSec ?? 0.4 }
        : undefined,
      textOverlay: h?.overlayText
        ? { text: h.overlayText, position: h.overlayPosition ?? 'bottom', animation: 'fade-in' }
        : undefined,
      tone: h?.tone,
      seed: typeof h?.seed === 'number' ? h.seed : undefined,
    };
  });

  return ensureProductionPlanEnsemble(ProductionPlan.parse({
    project: {
      name: briefing.productName,
      aspectRatio: briefing.aspectRatio as any,
      totalDurationSec: total,
    },
    scenes,
    unresolved: [{
      field: 'auto-director',
      reason: hints.length
        ? `Auto-Analyse offline — ${hints.length} Szene(n) wurden direkt aus deinem Briefing-Text extrahiert. Vor Render prüfen.`
        : 'AI-Director offline — deterministischer Plan erstellt. Bitte vor dem Rendern prüfen.',
      severity: 'warn',
    }],
    _meta: {
      source: 'local-fallback',
      debug: {
        ...(canonicalTiming ? { canonical_timing: canonicalTiming } : {}),
        ...(sliderTotal !== null ? { requestedDurationSec: sliderTotal } : {}),
      },
    },
  }), briefing);
}

type Phase = 'idle' | 'A' | 'B' | 'done';

interface Args {
  briefing: ComposerBriefing;
  projectId: string | undefined;
  scenes: ComposerScene[];
  /** Project language (de/en/es/…) — forwarded to deep-parse for LANGUAGE LOCK. */
  language: string;
  /** Ensures a draft project has a real DB UUID before deep-parse/plan persistence. */
  ensureProjectId?: () => Promise<string>;
  /** Navigation hook: switches the dashboard tab to 'storyboard'. */
  navigateToStoryboard: () => void;
  /** Synchronizes board controls when script timing wins over board defaults. */
  onUpdateBriefing?: (patch: Partial<ComposerBriefing>) => void;
}

const isUuid = (val?: string | null) =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

/**
 * Returns true when a scene is "off-limits" for plan replacement.
 * Mirrors the guard in `useApplyProductionPlan` so we keep behaviour
 * consistent between the entry guard and the apply guard.
 */
function isProtected(s: ComposerScene): boolean {
  if (s.clipUrl) return true;
  // Failed/canceled scenes without a render are repairable fallback rows and
  // MUST be replaceable by a later full Briefing plan. Protect only real output
  // or in-flight state.
  if (s.clipStatus === 'generating' || s.clipStatus === 'ready') return true;
  const a = s as any;
  if (a.lipSyncStatus) return true;
  if (a.dialogLockedAt) return true;
  if (a.lockReferenceUrl) return true;
  return false;
}

function isRepairableFailedScene(s: ComposerScene): boolean {
  const status = String(s.clipStatus ?? '');
  return (status === 'failed' || status === 'canceled') && !isProtected(s);
}

/** Slugify a character name into a stable @-mention key. */
function toMentionSlug(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cast';
}

/**
 * Detect whether the user's briefing already carries an explicit script
 * (speaker lines like `NAME:` or scene markers `SZENE N` / `SCENE N`).
 * In that case we switch the parser into LITERAL mode so it does NOT
 * redistribute dialogue or invent new speakers.
 */
export function detectBriefingFidelity(b: ComposerBriefing): {
  mode: 'literal' | 'auto';
  hasSceneMarkers: boolean;
  hasSpeakerLines: boolean;
  speakerLabels: string[];
} {
  const src = String(b.productDescription ?? '');
  const hasSceneMarkers = /(?:^|\n)\s*(?:szene|scene|shot)\s*\d+\b/i.test(src);
  // Colon OR whitespace-hyphen/em-dash. NO in-word hyphen (so "Close-up" won't match).
  const speakerRe = /(?:^|\n)\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\.\s]{0,30}?)\s*(?::|\s[—–-]\s)[ \t]*(?:\r?\n\s*)?["„'“‚«»›‹]?\S/g;

  const norm = (s: string) => String(s ?? '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  const castNorms = new Set<string>();
  const castFirstNorms = new Set<string>();
  for (const c of b.characters ?? []) {
    const n = norm(c.name);
    if (n) castNorms.add(n);
    const first = String(c.name ?? '').trim().split(/\s+/)[0];
    const fn = norm(first);
    if (fn) castFirstNorms.add(fn);
  }
  const matchesCast = (raw: string): boolean => {
    const n = norm(raw);
    if (!n) return false;
    if (castNorms.has(n) || castFirstNorms.has(n)) return true;
    for (const cn of castNorms) if (cn.startsWith(n) || n.startsWith(cn)) return true;
    return false;
  };

  const DENY = /^(szene|scene|shot|hook|reveal|cta|pain|proof|beat|kamera|camera|framing|mood|note|tone|dialog|dialogue|voiceover|vo|inhalt|briefing|thema|target|zielgruppe|projekt|project|duration|dauer|aspect|format|ratio|style|stil|ton|tonalitat|setting|location|endcard|optional|empfohlen|nicht|text|on|off|studio|helles|medium|close|wide|pan|tracking|push|cinematic|perfekter|realistische|split|creator|nach|da|sondern|create|die|der|das|ein|eine|clean|heroisch|heroischer|vier|benennt|erstelle)$/i;

  const labels = new Set<string>();
  for (const m of src.matchAll(speakerRe)) {
    const raw = (m[1] ?? '').replace(/\s+/g, ' ').trim();
    if (raw.length < 2 || raw.length > 32) continue;
    const tokens = raw.split(/\s+/);
    if (tokens.length > 3) continue;
    if (tokens.some((t) => DENY.test(t))) continue;

    // All-caps screenplay label (SAMUEL, SPRECHER 1, MATTHEW DUSATKO)?
    const allCaps = tokens.every((t) => /^[A-ZÄÖÜ][A-ZÄÖÜ0-9\.]*$/.test(t) || /^\d+$/.test(t));
    if (allCaps) { labels.add(raw); continue; }

    // Otherwise: only accept when it matches a briefed cast member.
    if (matchesCast(raw)) labels.add(raw);
  }
  const speakerLabels = Array.from(labels);
  const hasSpeakerLines = speakerLabels.length > 0;
  const mode: 'literal' | 'auto' = (hasSceneMarkers || hasSpeakerLines) ? 'literal' : 'auto';
  return { mode, hasSceneMarkers, hasSpeakerLines, speakerLabels };
}

/**
 * Builds the freeform briefing blob the deep-parser expects.
 * In AUTO-DIRECTOR mode (default), the parser is allowed to synthesize a
 * full screenplay from the structured briefing + selected cast.
 * In LITERAL mode (script detected), the parser MUST reproduce the script
 * verbatim — no speaker reassignment, no dialog rewriting.
 */
function buildBriefingText(b: ComposerBriefing): string {
  const lines: string[] = [];
  const fidelity = detectBriefingFidelity(b);

  if (fidelity.mode === 'literal') {
    lines.push('Mode: LITERAL (reproduce the ## Verbatim Script 1:1 — do NOT reassign speakers, do NOT rewrite dialog, do NOT invent scenes)');
  } else {
    lines.push('Mode: AUTO-DIRECTOR (synthesize full screenplay from briefing + cast)');
  }
  lines.push('');
  if (b.productName) lines.push(`# ${b.productName}`);
  if (b.productDescription) lines.push('', b.productDescription);
  if (b.usps?.length) {
    lines.push('', '## USPs / Key Messages');
    for (const u of b.usps) lines.push(`- ${u}`);
  }
  if (b.targetAudience) lines.push('', `## Target Audience`, b.targetAudience);

  // Cast — the heart of AUTO-DIRECTOR. Each entry becomes an addressable
  // mention key the parser can place into scenes.
  if (b.characters && b.characters.length) {
    lines.push('', '## Cast (selected in briefing)');
    for (const c of b.characters) {
      const slug = toMentionSlug(c.name);
      const libSuffix = c.brandCharacterId ? `  (library:${c.brandCharacterId})` : '';
      lines.push(`- @${slug} — **${c.name}**${libSuffix}`);
      if (c.appearance) lines.push(`  · Appearance: ${c.appearance}`);
      if (c.signatureItems) lines.push(`  · Signature items: ${c.signatureItems}`);
      if (c.appearanceFrequency) lines.push(`  · Frequency: ${c.appearanceFrequency}`);
    }
  }

  // LITERAL-mode helpers: give the parser a stable Speaker-Map from
  // detected script labels → @-mentions of briefed cast (best fuzzy match by
  // name prefix). Also duplicate the raw script into a dedicated block so
  // the server can extract it back out and enforce fidelity server-side.
  if (fidelity.mode === 'literal') {
    if (fidelity.speakerLabels.length && b.characters?.length) {
      const norm = (s: string) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
      const manualMap = b.speakerMap ?? {};
      lines.push('', '## Speaker Map (script label → @mention)');
      for (const label of fidelity.speakerLabels) {
        // Manual override wins — the user explicitly picked this mapping in
        // the ScriptSpeakerMapper UI. Fall back to fuzzy name match otherwise.
        const manualId = manualMap[label];
        const manualHit = manualId ? b.characters.find((c) => c.id === manualId) : null;
        const hit = manualHit ?? b.characters.find((c) => {
          const n = norm(label);
          const cn = norm(c.name);
          return cn && n && (cn.startsWith(n) || n.startsWith(cn) || cn.includes(n) || n.includes(cn));
        });
        if (hit) {
          const tag = manualHit ? ' [manual]' : '';
          lines.push(`- ${label} → @${toMentionSlug(hit.name)}${tag}`);
        } else {
          lines.push(`- ${label} → (unmapped — assign to the closest briefed cast member by role/context)`);
        }
      }
    }
    if (b.productDescription) {
      lines.push('', '## Verbatim Script', '```', b.productDescription.trim(), '```');
    }
  }

  lines.push('', '## Project');
  if (b.tone) lines.push(`- Tone: ${b.tone}`);
  if (b.duration) lines.push(`- Total duration: ${b.duration}s`);
  if (b.aspectRatio) lines.push(`- Aspect: ${b.aspectRatio}`);
  if (b.videoMode) lines.push(`- Video mode: ${b.videoMode}`);
  if (b.visualStyle) lines.push(`- Visual style: ${b.visualStyle}`);
  if (b.brandColors?.length) lines.push(`- Brand colors: ${b.brandColors.join(', ')}`);
  if (b.defaultQuality) lines.push(`- Default quality: ${b.defaultQuality}`);
  if (b.preferStock) lines.push(`- Prefer stock footage when appropriate`);

  return lines.join('\n').trim();
}

export interface StoryboardTransitionState {
  warRoomOpen: boolean;
  phase: Phase;
  progress: number;
  phaseLabel: string;
  planSheetOpen: boolean;
  initialPlan: TProductionPlan | null;
  activeProjectId: string | null;
}

export function useStoryboardTransition({
  briefing, projectId, scenes, language, ensureProjectId, navigateToStoryboard, onUpdateBriefing,
}: Args) {
  const [state, setState] = useState<StoryboardTransitionState>({
    warRoomOpen: false,
    phase: 'idle',
    progress: 0,
    phaseLabel: '',
    planSheetOpen: false,
    initialPlan: null,
    activeProjectId: null,
  });

  const cancelledRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);

  const stopProgress = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  /** Drives a pseudo-progress curve while the edge function runs. */
  const startProgressLoop = () => {
    stopProgress();
    progressTimerRef.current = window.setInterval(() => {
      setState((s) => {
        // Cap at 70% until the real response lands.
        const next = Math.min(s.progress + (s.progress < 50 ? 1.1 : 0.35), 70);
        const phase: Phase = next < 60 ? 'A' : 'B';
        // Briefing-Intelligence v2 — 4 inhaltliche Schritte:
        //   0–20%  Briefing-Modus erkennen (Storytelling/Brand/Produkt/…)
        //   20–45% Research & Wissens-Anreicherung (KI füllt Lücken)
        //   45–65% Strukturextraktion (Szenen, VO, Cast)
        //   65–95% Cast & Locations gegen deine Library auflösen
        const phaseLabel =
          next < 20
            ? 'Schritt 1/4 · Briefing-Modus erkennen'
            : next < 45
              ? 'Schritt 2/4 · Research & Wissens-Anreicherung (KI füllt Lücken)'
              : next < 65
                ? 'Schritt 3/4 · Strukturextraktion (Szenen, VO, Cast)'
                : 'Schritt 4/4 · Cast & Locations gegen Library auflösen';
        return { ...s, progress: next, phase, phaseLabel };
      });
    }, 700);
  };

  const close = useCallback(() => {
    cancelledRef.current = true;
    stopProgress();
    setState({
      warRoomOpen: false,
      phase: 'idle',
      progress: 0,
      phaseLabel: '',
      planSheetOpen: false,
      initialPlan: null,
      activeProjectId: null,
    });
  }, []);

  /**
   * Decide + run. Returns true when the caller should NOT navigate itself
   * (we'll handle navigation after the plan is applied). Returns false
   * when the caller should fall through with normal tab navigation.
   */
  const attempt = useCallback(async (): Promise<{ handled: boolean }> => {
    // GUARD 1 — protected scenes exist: never re-analyse.
    if (scenes.some(isProtected)) {
      return { handled: false };
    }
    // GUARD 2 — already has user-created scenes: skip auto-analyse. Exception:
    // failed/canceled fallback rows are repairable and should be replaced by the
    // full plan instead of trapping the user in stale placeholders.
    if (scenes.length > 0 && !scenes.every(isRepairableFailedScene)) {
      return { handled: false };
    }
    // GUARD 3 — empty briefing: nothing to analyse.
    const text = buildBriefingText(briefing);
    if (text.length < 40) {
      return { handled: false };
    }

    let activeProjectId = projectId;
    if (!isUuid(activeProjectId)) {
      if (!ensureProjectId) {
        toast({
          title: 'Projekt noch nicht gespeichert',
          description: 'Bitte kurz speichern und erneut versuchen.',
          variant: 'destructive',
        });
        return { handled: true };
      }
      try {
        activeProjectId = await ensureProjectId();
      } catch (err: any) {
        toast({
          title: 'Projekt konnte nicht vorbereitet werden',
          description: err?.message ?? String(err),
          variant: 'destructive',
        });
        return { handled: true };
      }
      if (!isUuid(activeProjectId)) {
        toast({
          title: 'Projekt-ID fehlt',
          description: 'Die Analyse wurde gestoppt, damit kein unverbundener Plan entsteht.',
          variant: 'destructive',
        });
        return { handled: true };
      }
    }

    cancelledRef.current = false;
    setState({
      warRoomOpen: true,
      phase: 'A',
      progress: 2,
      phaseLabel: 'Schritt 1/4 · Briefing-Modus erkennen …',
      planSheetOpen: false,
      initialPlan: null,
      activeProjectId,
    });
    startProgressLoop();

    // Direct fetch with 120s AbortController. Backend now uses a Flash-first
    // chain (Flash 35s ×2 → Pro 60s → Flash-Lite 25s) that typically returns
    // in 8-25s; 120s is the worst-case ceiling with all fallbacks burning.
    // `supabase.functions.invoke` imposes a ~30s timeout that kicks in before
    // deep-parse can finish, so we use raw fetch.
    const CLIENT_TIMEOUT_MS = 120_000;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/briefing-deep-parse`;
    const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token ?? anon;

    const doFetch = async (): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
      try {
        return await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'apikey': anon,
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ briefing: text, projectId: activeProjectId, language }),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };


    const parsePlan = (data: any): { plan: TProductionPlan | null; dropped: number; error?: string } => {
      let dropped = 0;
      const parsed = ProductionPlan.safeParse(data?.plan);
      if (parsed.success) return { plan: ensureProductionPlanEnsemble(parsed.data, briefing), dropped };
      console.error('[useStoryboardTransition] plan validation failed', parsed.error.flatten());
      const rawScenes: any[] = Array.isArray(data?.plan?.scenes) ? data.plan.scenes : [];
      const survivors: any[] = [];
      for (const s of rawScenes) {
        const sp = PlanScene.safeParse(s);
        if (sp.success) survivors.push(sp.data); else dropped += 1;
      }
      if (survivors.length > 0) {
        const retry = ProductionPlan.safeParse({ ...(data?.plan ?? {}), scenes: survivors });
        if (retry.success) return { plan: ensureProductionPlanEnsemble(retry.data, briefing), dropped };
      }
      const issues = parsed.error.issues.slice(0, 2)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join(' · ');
      return { plan: null, dropped, error: `Plan-Validierung fehlgeschlagen — ${issues || 'unbekannter Fehler'}` };
    };

    try {
      // First attempt; on transient 502/503/504, retry once after 2s before
      // surfacing any error — backend chain has its own retries but a fresh
      // edge-runtime cold start can still kick a 503.
      let res = await doFetch();
      if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
        console.warn(`[useStoryboardTransition] deep-parse ${res.status} — 1× client retry after 2s`);
        try { await res.text(); } catch { /* drain */ }
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelledRef.current) return { handled: true };
        res = await doFetch();
      }
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const err: any = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }
      const data = await res.json();
      const { plan, dropped, error: validationErr } = parsePlan(data);
      if (!plan) throw new Error(validationErr || 'Plan-Validierung fehlgeschlagen');

      // T-1 — attach the response envelope onto plan._meta.debug so the
      // ProductionPlanSheet can surface parser diagnostics behind ?debug=1
      // without a second round-trip.
      try {
        (plan as any)._meta = {
          ...((plan as any)._meta ?? {}),
          script_timing: data?.script_timing ?? null,
          duration_auto_extend: Array.isArray(data?.duration_auto_extend)
            ? data.duration_auto_extend
            : [],
          debug: {
            passA_model: data?.passA_model ?? null,
            passB_model: data?.passB_model ?? null,
            passA_error: data?.passA_error ?? null,
            passB_error: data?.passB_error ?? null,
            passA_diagnostics: data?.passA_diagnostics ?? [],
            passB_diagnostics: data?.passB_diagnostics ?? [],
            timings: data?.timings ?? null,
            ensemble_repair: data?.ensemble_repair ?? null,
            strict_cast: data?.strict_cast ?? null,
            fidelity: data?.fidelity ?? null,
            solo_cast: data?.solo_cast ?? null,
            script_timing: data?.script_timing ?? null,
            duration_auto_extend: data?.duration_auto_extend ?? [],
            version: data?.version ?? null,
          },
        };
      } catch { /* non-fatal — debug chip just stays hidden */ }

      const normalized = applyCanonicalTimingToPlan(plan, briefing, text);
      const displayPlan = normalized.plan;
      if (normalized.timing && Math.abs((briefing.duration ?? 0) - normalized.timing.durationSec) >= 0.5) {
        onUpdateBriefing?.({ duration: normalized.timing.durationSec });
      }

      if (dropped > 0) {
        toast({
          title: 'Plan teilweise übernommen',
          description: `${dropped} Szene(n) konnten nicht validiert werden und wurden übersprungen.`,
        });
      }

      // Smoothly drive the bar to 100% before swapping to the plan sheet.
      setState((s) => ({ ...s, progress: 100, phase: 'done', phaseLabel: 'Plan bereit' }));
      await new Promise((r) => setTimeout(r, 650));

      setState({
        warRoomOpen: false,
        phase: 'idle',
        progress: 0,
        phaseLabel: '',
        planSheetOpen: true,
        initialPlan: displayPlan,
        activeProjectId,
      });
      return { handled: true };
    } catch (e: any) {
      stopProgress();
      if (cancelledRef.current) return { handled: true };

      const isAbort = e?.name === 'AbortError';
      const status: number | undefined = e?.status;
      const msg: string = isAbort ? `Timeout nach ${Math.round(CLIENT_TIMEOUT_MS / 1000)}s` : (e?.message || 'Deep-Parse fehlgeschlagen');
      console.error('[useStoryboardTransition] deep-parse failed', { status, msg, body: e?.body, isAbort });


      // Hard blocks (credits / rate-limit / payload): keep classic toast + navigate.
      if (status === 402 || status === 429 || status === 413) {
        toast({
          title: 'Briefing-Analyse fehlgeschlagen',
          description: status === 402 ? 'Keine AI-Credits mehr — bitte aufladen.'
            : status === 429 ? 'Zu viele Anfragen — bitte kurz warten und erneut versuchen.'
            : 'Briefing zu lang — bitte kürzen.',
          variant: 'destructive',
        });
        setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
        navigateToStoryboard();
        return { handled: true };
      }

      // v232 — Soft-fail Grace-Window.
      // Statt sofort mit einem Local-Fallback-Plan zu öffnen (Nutzer sieht
      // 5.1s / 3 Szenen statt seiner 15s-Vorgabe und interpretiert es als
      // Bug), halten wir das War-Room-Modal offen und geben der Backend-
      // Analyse ein Grace-Window von 45s, in dem der Late-Arrival-Retry
      // läuft. Erst wenn auch dieser scheitert, fällt die UI auf den
      // Local-Fallback-Plan zurück — dann aber klar als Schätzung markiert.
      try {
        const reason = isAbort
          ? 'Timeout'
          : status ? (status === 504 ? `Timeout (${status})` : `Status ${status}`)
          : 'Netzwerkfehler';

        // Halte War-Room offen, aber wechsle in eine "Retry"-Phase.
        setState((s) => ({
          ...s,
          warRoomOpen: true,
          planSheetOpen: false,
          phase: 'B',
          progress: Math.max(s.progress || 0, 80),
          phaseLabel: `${reason} — versuche nochmal (bis 45s) …`,
        }));

        const GRACE_MS = 45_000;
        let resolved = false;

        const openFallback = () => {
          if (resolved || cancelledRef.current) return;
          resolved = true;
          const fallbackRaw = buildLocalFallbackPlan(briefing, text);
          const normalizedFallback = applyCanonicalTimingToPlan(fallbackRaw, briefing, text);
          const fallback = normalizedFallback.plan;
          const fallbackDuration = normalizedFallback.timing?.durationSec ?? fallback.project?.totalDurationSec;
          if (typeof fallbackDuration === 'number' && Math.abs((briefing.duration ?? 0) - fallbackDuration) >= 0.5) {
            onUpdateBriefing?.({ duration: fallbackDuration });
          }
          toast({
            title: 'AI-Analyse nicht verfügbar',
            description: `${reason} — Basis-Plan eingeblendet (nur Schätzung). Bitte Werte vor „Plan anwenden" prüfen.`,
            variant: 'destructive',
          });
          setState({
            warRoomOpen: false,
            phase: 'idle',
            progress: 0,
            phaseLabel: '',
            planSheetOpen: true,
            initialPlan: fallback,
            activeProjectId,
          });
        };

        const graceTimer = window.setTimeout(openFallback, GRACE_MS);

        // Late-arrival retry — bei jeder Soft-Fail-Ursache versuchen wir
        // Server-seitig nochmal (kein Client-Timeout mehr). Kommt der echte
        // Plan innerhalb von 45s, ersetzt er die Retry-Phase direkt durch
        // die Plan-Sheet mit AI-Ergebnis; sonst greift der Fallback.
        (async () => {
          try {
            const lateRes = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': anon,
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({ briefing: text, projectId: activeProjectId, language }),
            });
            if (!lateRes.ok) throw new Error(`late-arrival status ${lateRes.status}`);
            const lateData = await lateRes.json();
            const { plan: lateRawPlan } = parsePlan(lateData);
            const latePlan = lateRawPlan
              ? applyCanonicalTimingToPlan(lateRawPlan, briefing, text).plan
              : null;
            if (!latePlan) throw new Error('late-arrival plan invalid');
            const lateDuration = latePlan.project?.totalDurationSec;
            if (typeof lateDuration === 'number' && Math.abs((briefing.duration ?? 0) - lateDuration) >= 0.5) {
              onUpdateBriefing?.({ duration: lateDuration });
            }
            if (cancelledRef.current) return;
            window.clearTimeout(graceTimer);
            if (resolved) {
              // Fallback wurde bereits eingeblendet – dennoch ersetzen wir
              // ihn transparent durch den echten Plan.
              setState((s) => {
                const sheetWasClosed = !s.planSheetOpen;
                toast({
                  title: sheetWasClosed
                    ? '✨ Vollständiger Plan nachgeladen — bitte erneut anwenden'
                    : '✨ Vollständiger Plan nachgeladen',
                  description: sheetWasClosed
                    ? 'Dein Briefing wurde im Hintergrund analysiert. Klicke „Plan anwenden", um Fallback-Szenen zu ersetzen.'
                    : 'Der AI-generierte Plan ist jetzt verfügbar.',
                });
                return { ...s, planSheetOpen: true, initialPlan: latePlan, activeProjectId };
              });
              return;
            }
            resolved = true;
            setState({
              warRoomOpen: false,
              phase: 'idle',
              progress: 0,
              phaseLabel: '',
              planSheetOpen: true,
              initialPlan: latePlan,
              activeProjectId,
            });
          } catch (lateErr) {
            console.warn('[useStoryboardTransition] late-arrival failed', lateErr);
            // Grace-Timer greift ohnehin und öffnet Fallback.
          }
        })();
      } catch (fallbackErr: any) {
        console.error('[useStoryboardTransition] local fallback failed', fallbackErr);
        toast({
          title: 'Briefing-Analyse fehlgeschlagen',
          description: status ? `${status}: ${msg}` : msg,
          variant: 'destructive',
        });
        setState((s) => ({ ...s, warRoomOpen: false, phase: 'idle', progress: 0 }));
        navigateToStoryboard();
      }
      return { handled: true };
    }
  }, [briefing, projectId, scenes, language, ensureProjectId, navigateToStoryboard, onUpdateBriefing]);

  const setPlanSheetOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, planSheetOpen: open, initialPlan: open ? s.initialPlan : null }));
  }, []);

  return {
    state,
    attempt,
    close,
    setPlanSheetOpen,
  };
}
