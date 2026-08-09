import { tx } from "@/lib/i18nText";
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

  if (!scene.subject?.trim()) findings.push(block('scene_no_subject', tx({ de: 'Szene hat kein Motiv.', en: 'Scene has no subject.', es: 'La escena no tiene sujeto.' }), id));
  if (!scene.action?.trim()) findings.push(block('scene_no_action', tx({ de: 'Szene hat keine Handlung.', en: 'Scene has no action.', es: 'La escena no tiene acción.' }), id));
  if (!scene.environment?.trim()) {
    findings.push(block('scene_no_environment', tx({ de: 'Szene hat keinen Ort.', en: 'Scene has no location.', es: 'La escena no tiene ubicación.' }), id));
  }

  const limits = ENGINE_DURATION_LIMITS[scene.engine ?? ''] ?? DEFAULT_LIMITS;
  if (scene.durationSeconds < limits.min) {
    findings.push(
      block(
        'scene_too_short',
        tx({ de: `Szene ist ${scene.durationSeconds}s — das Modell braucht mindestens ${limits.min}s.`, en: `Scene is ${scene.durationSeconds}s — the model needs at least ${limits.min}s.`, es: `La escena dura ${scene.durationSeconds}s — el modelo necesita al menos ${limits.min}s.` }),
        id,
      ),
    );
  }
  if (scene.durationSeconds > limits.max) {
    findings.push(
      block(
        'scene_too_long',
        tx({ de: `Szene ist ${scene.durationSeconds}s — das Modell erlaubt maximal ${limits.max}s.`, en: `Scene is ${scene.durationSeconds}s — the model allows a maximum of ${limits.max}s.`, es: `La escena dura ${scene.durationSeconds}s — el modelo permite un máximo de ${limits.max}s.` }),
        id,
      ),
    );
  }

  const turns = scene.turns ?? [];

  if (turns.length > 0) {
    // Multi-speaker: every turn needs a cast speaker and a voice of its own,
    // otherwise the Sync.so pass for that speaker has nothing to animate.
    turns.forEach((turn, i) => {
      const label = turn.speakerName ?? `Sprecher ${i + 1}`;
      if (!turn.speakerCharacterId) {
        findings.push(warn('turn_no_speaker', tx({ de: `Redebeitrag ${i + 1}: Sprecher wird automatisch besetzt.`, en: `Speech ${i + 1}: Speaker will be assigned automatically.`, es: `Discurso ${i + 1}: El orador se asignará automáticamente.` }), id));
      } else if (
        scene.characterIds.length > 0 &&
        !scene.characterIds.includes(turn.speakerCharacterId)
      ) {
        findings.push(
          warn('turn_speaker_not_in_scene', tx({ de: `${label} wird der Szene automatisch hinzugefügt.`, en: `${label} will be added to the scene automatically.`, es: `${label} se añadirá a la escena automáticamente.` }), id),
        );
      }
      if (!turn.voiceId) {
        findings.push(warn('turn_no_voice', tx({ de: `${label}: Stimme wird automatisch gewählt.`, en: `${label}: Voice will be chosen automatically.`, es: `${label}: La voz se elegirá automáticamente.` }), id));
      }
    });
    if (turns.length > 4) {
      findings.push(
        warn(
          'turns_too_many',
          tx({ de: `${turns.length} Sprecher in einer Szene — ab 5 wird der Lip-Sync unzuverlässig.`, en: `${turns.length} speakers in one scene — lip-sync becomes unreliable from 5.`, es: `${turns.length} oradores en una escena; la sincronización labial deja de ser fiable a partir de 5.` }),
          id,
        ),
      );
    }
    const turnWords = turns.reduce((acc, turn) => acc + turn.text.trim().split(/\s+/).length, 0);
    const turnNeeded = turnWords / 2.6 + Math.max(0, turns.length - 1) * 0.25;
    if (turnNeeded > scene.durationSeconds + 0.75) {
      findings.push(
        warn(
          'dialogue_too_long',
          tx({ de: `Die Redebeiträge brauchen ca. ${turnNeeded.toFixed(1)}s, Szene ist nur ${scene.durationSeconds}s lang.`, en: `The speeches need approx. ${turnNeeded.toFixed(1)}s, scene is only ${scene.durationSeconds}s long.`, es: `Los discursos necesitan aprox. ${turnNeeded.toFixed(1)}s, la escena dura solo ${scene.durationSeconds}s.` }),
          id,
        ),
      );
    }
  } else if (scene.dialogue?.trim()) {
    if (!scene.speakerCharacterId) {
      findings.push(warn('dialogue_no_speaker', tx({ de: 'Sprecher wird automatisch besetzt.', en: 'Speaker will be automatically assigned.', es: 'El orador será asignado automáticamente.' }), id));
    }
    if (!scene.voiceId) {
      findings.push(warn('dialogue_no_voice', tx({ de: 'Stimme wird automatisch gewählt.', en: 'Voice will be automatically selected.', es: 'La voz se seleccionará automáticamente.' }), id));
    }
    if (!scene.voiceLanguage) {
      findings.push(warn('dialogue_no_language', tx({ de: 'Dialog ohne Sprachcode — nutze Projektsprache.', en: 'Dialogue without language code — use project language.', es: 'Diálogo sin código de idioma: utilice el idioma del proyecto.' }), id));
    }
    if (scene.characterIds.length > 0 && scene.speakerCharacterId) {
      if (!scene.characterIds.includes(scene.speakerCharacterId)) {
        findings.push(
          warn('speaker_not_in_scene', tx({ de: 'Der Sprecher wird der Szene automatisch hinzugefügt.', en: 'The speaker will be automatically added to the scene.', es: 'El orador se añadirá automáticamente a la escena.' }), id),
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
          tx({ de: `Text braucht ca. ${needed.toFixed(1)}s, Szene ist nur ${scene.durationSeconds}s lang.`, en: `Text needs approx. ${needed.toFixed(1)}s, scene is only ${scene.durationSeconds}s long.`, es: `El texto necesita aprox. ${needed.toFixed(1)}s, la escena dura solo ${scene.durationSeconds}s.` }),
          id,
        ),
      );
    }
  }


  const uniqueChars = new Set(scene.characterIds);
  if (uniqueChars.size !== scene.characterIds.length) {
    findings.push(block('duplicate_character', tx({ de: 'Derselbe Charakter ist doppelt besetzt.', en: 'The same character is cast twice.', es: 'El mismo personaje está asignado dos veces.' }), id));
  }

  return findings;
}

/** Checks a scene right before the paid MOTION pass. */
export function preflightBeforeMotion(scene: SceneGrammar): PreflightFinding[] {
  const findings = preflightScene(scene);
  if (!scene.anchorUrl) {
    findings.push(
      block('no_anchor', tx({ de: 'Kein freigegebenes Ankerbild — Animation würde ins Blaue gehen.', en: 'No shared anchor image — animation would go nowhere.', es: 'Sin imagen de anclaje compartida: la animación no iría a ninguna parte.' }), scene.id),
    );
  }
  return findings;
}

/** Whole-treatment check, run once before the user approves and pays. */
export function preflightTreatment(treatment: AutopilotTreatment): PreflightResult {
  const findings: PreflightFinding[] = [];

  if (!treatment.scenes.length) {
    findings.push(block('no_scenes', tx({ de: 'Das Treatment enthält keine Szenen.', en: 'The treatment contains no scenes.', es: 'El tratamiento no contiene escenas.' })));
  }

  if (treatment.scenes.length > 12) {
    findings.push(warn('many_scenes', tx({ de: 'Mehr als 12 Szenen — Laufzeit und Kosten steigen deutlich.', en: 'More than 12 scenes — runtime and costs increase significantly.', es: 'Más de 12 escenas — el tiempo de ejecución y los costos aumentan significativamente.' })));
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
    findings.push(block('duplicate_order', tx({ de: 'Zwei Szenen haben denselben Reihenfolge-Index.', en: 'Two scenes have the same order index.', es: 'Dos escenas tienen el mismo índice de orden.' })));
  }

  const hasHook = treatment.scenes.some((s) => s.beat === 'hook');
  if (!hasHook) findings.push(warn('no_hook', tx({ de: 'Kein Hook in den ersten Sekunden.', en: 'No hook in the first few seconds.', es: 'Ningún gancho en los primeros segundos.' })));

  for (const scene of treatment.scenes) findings.push(...preflightScene(scene));

  return { ok: !findings.some((f) => f.severity === 'block'), findings };
}

export function blockingFindings(result: PreflightResult): PreflightFinding[] {
  return result.findings.filter((f) => f.severity === 'block');
}
