/**
 * Preflight — pure, AI-free validation that runs BEFORE any paid step.
 *
 * Every check here is a rule, not a judgement call. Catching a missing voice id
 * or an out-of-range duration costs nothing; discovering it after a €2 clip has
 * rendered costs €2 and a refund transaction.
 */

import type { SceneGrammar, AutopilotTreatment } from './types';

export type PreflightSeverity = 'block' | 'warn';

export interface PreflightFinding {
  severity: PreflightSeverity;
  code: string;
  message: string;
  sceneId?: string;
}

export interface PreflightResult {
  ok: boolean;
  findings: PreflightFinding[];
}

/** Per-engine hard duration limits (seconds). */
const ENGINE_DURATION_LIMITS: Record<string, { min: number; max: number }> = {
  'minimax/hailuo-02': { min: 3, max: 10 },
  'kwaivgi/kling-v2.1': { min: 5, max: 10 },
  'bytedance/seedance-1-lite': { min: 3, max: 12 },
  'google/veo-3.1': { min: 4, max: 8 },
};

const DEFAULT_LIMITS = { min: 3, max: 10 };

function block(code: string, message: string, sceneId?: string): PreflightFinding {
  return { severity: 'block', code, message, sceneId };
}

function warn(code: string, message: string, sceneId?: string): PreflightFinding {
  return { severity: 'warn', code, message, sceneId };
}

/** Checks a single scene in isolation. */
export function preflightScene(scene: SceneGrammar): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  const id = scene.id;

  if (!scene.subject?.trim()) findings.push(block('scene_no_subject', 'Szene hat kein Motiv.', id));
  if (!scene.action?.trim()) findings.push(block('scene_no_action', 'Szene hat keine Handlung.', id));
  if (!scene.environment?.trim()) {
    findings.push(block('scene_no_environment', 'Szene hat keinen Ort.', id));
  }

  const limits = ENGINE_DURATION_LIMITS[scene.engine ?? ''] ?? DEFAULT_LIMITS;
  if (scene.durationSeconds < limits.min) {
    findings.push(
      block(
        'scene_too_short',
        `Szene ist ${scene.durationSeconds}s — das Modell braucht mindestens ${limits.min}s.`,
        id,
      ),
    );
  }
  if (scene.durationSeconds > limits.max) {
    findings.push(
      block(
        'scene_too_long',
        `Szene ist ${scene.durationSeconds}s — das Modell erlaubt maximal ${limits.max}s.`,
        id,
      ),
    );
  }

  if (scene.dialogue?.trim()) {
    if (!scene.speakerCharacterId) {
      findings.push(block('dialogue_no_speaker', 'Dialog ohne zugeordneten Sprecher.', id));
    }
    if (!scene.voiceId) {
      findings.push(block('dialogue_no_voice', 'Dialog ohne Stimme — bitte Stimme zuweisen.', id));
    }
    if (!scene.voiceLanguage) {
      findings.push(warn('dialogue_no_language', 'Dialog ohne Sprachcode — nutze Projektsprache.', id));
    }
    if (scene.characterIds.length > 0 && scene.speakerCharacterId) {
      if (!scene.characterIds.includes(scene.speakerCharacterId)) {
        findings.push(
          block('speaker_not_in_scene', 'Der Sprecher kommt in dieser Szene gar nicht vor.', id),
        );
      }
    }
    // Rough speaking-rate sanity: ~2.6 words/second for natural German delivery.
    const words = scene.dialogue.trim().split(/\s+/).length;
    const needed = words / 2.6;
    if (needed > scene.durationSeconds + 0.75) {
      findings.push(
        warn(
          'dialogue_too_long',
          `Text braucht ca. ${needed.toFixed(1)}s, Szene ist nur ${scene.durationSeconds}s lang.`,
          id,
        ),
      );
    }
  }

  const uniqueChars = new Set(scene.characterIds);
  if (uniqueChars.size !== scene.characterIds.length) {
    findings.push(block('duplicate_character', 'Derselbe Charakter ist doppelt besetzt.', id));
  }

  return findings;
}

/** Checks a scene right before the paid MOTION pass. */
export function preflightBeforeMotion(scene: SceneGrammar): PreflightFinding[] {
  const findings = preflightScene(scene);
  if (!scene.anchorUrl) {
    findings.push(
      block('no_anchor', 'Kein freigegebenes Ankerbild — Animation würde ins Blaue gehen.', scene.id),
    );
  }
  return findings;
}

/** Whole-treatment check, run once before the user approves and pays. */
export function preflightTreatment(treatment: AutopilotTreatment): PreflightResult {
  const findings: PreflightFinding[] = [];

  if (!treatment.scenes.length) {
    findings.push(block('no_scenes', 'Das Treatment enthält keine Szenen.'));
  }

  if (treatment.scenes.length > 12) {
    findings.push(warn('many_scenes', 'Mehr als 12 Szenen — Laufzeit und Kosten steigen deutlich.'));
  }

  const sum = treatment.scenes.reduce((acc, s) => acc + s.durationSeconds, 0);
  const drift = Math.abs(sum - treatment.totalDurationSeconds);
  if (drift > 1.5) {
    findings.push(
      block(
        'duration_drift',
        `Szenensumme (${sum.toFixed(1)}s) weicht von der Zielzeit (${treatment.totalDurationSeconds}s) ab.`,
      ),
    );
  }

  const orders = treatment.scenes.map((s) => s.orderIndex);
  if (new Set(orders).size !== orders.length) {
    findings.push(block('duplicate_order', 'Zwei Szenen haben denselben Reihenfolge-Index.'));
  }

  const hasHook = treatment.scenes.some((s) => s.beat === 'hook');
  if (!hasHook) findings.push(warn('no_hook', 'Kein Hook in den ersten Sekunden.'));

  for (const scene of treatment.scenes) findings.push(...preflightScene(scene));

  return { ok: !findings.some((f) => f.severity === 'block'), findings };
}

export function blockingFindings(result: PreflightResult): PreflightFinding[] {
  return result.findings.filter((f) => f.severity === 'block');
}
