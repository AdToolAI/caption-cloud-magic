// =============================================================================
// qualityScore — Director Console heuristic prompt-quality analyzer
// =============================================================================
//
// Pure, dependency-free function that grades a composed scene prompt against
// the same rubric the May-2026 Veo 3 / Sora 2 / Artlist research distilled:
//   1. SUBJECT clearly named (cast / brand character)
//   2. ACTION described in concrete verbs (no abstract "shows", "feels")
//   3. SHOT defined (framing / camera / lighting / mood)
//   4. DIALOG either absent OR locked as Audio Plan with measured timings
//   5. NEGATIVE channel populated (avoids on-screen text drift)
//   6. PROMPT length sane (>= 35 chars, <= 1200 chars)
//   7. NO conflicting style cues (Artlist "one outcome per line" rule)
//
// Each rule contributes equally to the 0-100 score and emits a localized
// `Tip` so the user knows EXACTLY what to fix to climb the score.

import type { AudioPlan, ComposerScene } from '@/types/video-composer';
import type { DirectorLanguage } from './composeFinalPrompt';
import { isBoilerplateAction } from './isBoilerplateAction';
import { jaccardOverlap } from './composePromptLayers';
import type { PerformanceEntry } from './buildPerformanceBlock';



export type QualityAxis =
  | 'subject'
  | 'action'
  | 'shot'
  | 'dialog'
  | 'negative'
  | 'length'
  | 'consistency';

export type Severity = 'pass' | 'warn' | 'fail';

export interface Tip {
  axis: QualityAxis;
  severity: Severity;
  /** Short label for the badge. */
  label: string;
  /** Actionable, localized one-liner. */
  hint: string;
}

export interface QualityResult {
  /** 0-100 — average of per-axis scores. */
  score: number;
  /** Per-axis breakdown. */
  axes: Record<QualityAxis, Severity>;
  /** Ordered tips (fails first, then warns, then passes). */
  tips: Tip[];
}

const T = {
  en: {
    subject: { pass: 'Cast set', warn: 'Cast vague', fail: 'No cast' },
    action: { pass: 'Action concrete', warn: 'Action vague', fail: 'Action missing' },
    shot: { pass: 'Shot defined', warn: 'Shot generic', fail: 'No shot' },
    dialog: { pass: 'Dialog locked', warn: 'Dialog draft', fail: 'Dialog mismatch' },
    negative: { pass: 'Negative set', warn: 'Negative weak', fail: 'No negative' },
    length: { pass: 'Length good', warn: 'Length tight', fail: 'Length off' },
    consistency: { pass: 'Coherent', warn: 'Mixed cues', fail: 'Conflicting cues' },
    hints: {
      subjectFail: 'Add at least one cast member or brand character — providers need a clear subject.',
      subjectWarn: 'Name the on-camera subject explicitly (e.g. "@Anna" or "the founder").',
      actionFail: 'Describe what physically happens in the scene with a concrete verb.',
      actionWarn: 'Replace abstract verbs ("shows", "feels") with concrete action ("walks", "lifts").',
      shotFail: 'Pick a Shot Director preset (framing, angle, movement, lighting).',
      shotWarn: 'Add a specific lens or movement cue (e.g. "85mm slow dolly-in").',
      dialogFail: 'Dialog text exists but no Audio Plan is locked — generate the voiceover to lock timings.',
      dialogWarn: 'Voiceover not yet generated — lip-sync will be approximated.',
      negativeFail: 'Add a negative prompt to suppress text/captions/watermarks drift.',
      negativeWarn: 'Negative is short — consider adding "no captions, no subtitles".',
      lengthFail: 'Prompt too short (<35 chars) — providers default to generic shots.',
      lengthFailLong: 'Prompt too long (>1200 chars) — trim to one outcome per line.',
      lengthWarn: 'Prompt borderline — Artlist recommends 80–600 chars per scene.',
      consistencyWarn: 'Detected mixed style cues (e.g. "noir" + "cinematic colorful") — pick one direction.',
      redundancyWarn: 'Cast actions repeat the scene action — tighten or delete duplicates so each line directs something specific.',
      boilerplateWarn: 'Auto-placeholder cast actions detected ("gesturing naturally, visible to camera") — they will be filtered from the final prompt; consider replacing them with concrete direction.',
      performanceConflictWarn: 'A cast action already describes a gesture/expression that is also set in the Performance tab — pick one source so the model gets a single, unambiguous direction.',
    },

  },

  de: {
    subject: { pass: 'Cast gesetzt', warn: 'Cast unklar', fail: 'Kein Cast' },
    action: { pass: 'Aktion konkret', warn: 'Aktion vage', fail: 'Keine Aktion' },
    shot: { pass: 'Shot definiert', warn: 'Shot generisch', fail: 'Kein Shot' },
    dialog: { pass: 'Dialog gelockt', warn: 'Dialog Entwurf', fail: 'Dialog Mismatch' },
    negative: { pass: 'Negative gesetzt', warn: 'Negative schwach', fail: 'Kein Negative' },
    length: { pass: 'Länge passt', warn: 'Länge knapp', fail: 'Länge daneben' },
    consistency: { pass: 'Kohärent', warn: 'Gemischte Cues', fail: 'Konflikt' },
    hints: {
      subjectFail: 'Füge mindestens ein Cast-Mitglied oder einen Brand-Character hinzu — Provider brauchen ein klares Subjekt.',
      subjectWarn: 'Nenne das On-Camera-Subjekt explizit (z. B. "@Anna" oder "die Gründerin").',
      actionFail: 'Beschreibe konkret, was in der Szene physisch passiert (klares Verb).',
      actionWarn: 'Ersetze abstrakte Verben ("zeigt", "fühlt") mit konkreten Aktionen ("läuft", "hebt").',
      shotFail: 'Wähle ein Shot-Director-Preset (Framing, Winkel, Bewegung, Licht).',
      shotWarn: 'Ergänze ein konkretes Linsen-/Bewegungs-Cue (z. B. "85mm langsamer Dolly-In").',
      dialogFail: 'Dialog vorhanden aber kein Audio Plan gelockt — generiere das Voiceover, damit Timings fixiert sind.',
      dialogWarn: 'Voiceover noch nicht generiert — Lip-Sync wird nur approximiert.',
      negativeFail: 'Setze einen Negative Prompt, um Text/Untertitel/Watermarks zu unterdrücken.',
      negativeWarn: 'Negative ist kurz — ergänze z. B. "no captions, no subtitles".',
      lengthFail: 'Prompt zu kurz (<35 Zeichen) — Provider liefern dann generische Aufnahmen.',
      lengthFailLong: 'Prompt zu lang (>1200 Zeichen) — kürze auf "ein Outcome pro Zeile".',
      lengthWarn: 'Prompt grenzwertig — Artlist empfiehlt 80–600 Zeichen pro Szene.',
      consistencyWarn: 'Gemischte Style-Cues entdeckt (z. B. "noir" + "cinematic colorful") — entscheide dich für eine Richtung.',
      redundancyWarn: 'Cast-Aktionen wiederholen die Scene-Action — präzisiere oder lösche Dubletten, damit jede Zeile etwas Eigenes lenkt.',
      boilerplateWarn: 'Auto-Platzhalter in Cast-Aktionen erkannt ("gestikuliert natürlich, sichtbar zur Kamera") — wird aus dem finalen Prompt gefiltert; ersetze sie für mehr Kontrolle.',

    },
  },
  es: {
    subject: { pass: 'Reparto fijo', warn: 'Reparto vago', fail: 'Sin reparto' },
    action: { pass: 'Acción concreta', warn: 'Acción vaga', fail: 'Sin acción' },
    shot: { pass: 'Plano definido', warn: 'Plano genérico', fail: 'Sin plano' },
    dialog: { pass: 'Diálogo fijado', warn: 'Diálogo borrador', fail: 'Diálogo no coincide' },
    negative: { pass: 'Negativo OK', warn: 'Negativo débil', fail: 'Sin negativo' },
    length: { pass: 'Longitud OK', warn: 'Longitud justa', fail: 'Longitud mala' },
    consistency: { pass: 'Coherente', warn: 'Cues mezclados', fail: 'En conflicto' },
    hints: {
      subjectFail: 'Añade al menos un personaje del reparto o marca — los proveedores necesitan un sujeto claro.',
      subjectWarn: 'Nombra al sujeto en cámara explícitamente (p. ej. "@Anna" o "la fundadora").',
      actionFail: 'Describe con un verbo concreto qué sucede físicamente en la escena.',
      actionWarn: 'Reemplaza verbos abstractos ("muestra", "siente") con acciones concretas ("camina", "levanta").',
      shotFail: 'Elige un preset del Shot Director (encuadre, ángulo, movimiento, luz).',
      shotWarn: 'Añade un detalle de lente o movimiento (p. ej. "dolly lento 85mm").',
      dialogFail: 'Hay diálogo pero ningún Audio Plan está fijado — genera el voiceover para fijar tiempos.',
      dialogWarn: 'Voiceover aún no generado — el lip-sync será aproximado.',
      negativeFail: 'Añade un prompt negativo para evitar texto/subtítulos/marcas de agua.',
      negativeWarn: 'El negativo es corto — añade p. ej. "no captions, no subtitles".',
      lengthFail: 'Prompt demasiado corto (<35 caracteres) — los proveedores generarán planos genéricos.',
      lengthFailLong: 'Prompt demasiado largo (>1200 caracteres) — recorta a "un resultado por línea".',
      lengthWarn: 'Prompt en el límite — Artlist recomienda 80–600 caracteres por escena.',
      consistencyWarn: 'Cues de estilo mezclados detectados (p. ej. "noir" + "cinematic colorful") — elige una dirección.',
      redundancyWarn: 'Las acciones del reparto repiten la acción de la escena — afina o elimina duplicados para que cada línea aporte algo propio.',
      boilerplateWarn: 'Detectados placeholders automáticos en acciones del reparto ("gesticula con naturalidad, visible a cámara") — se filtrarán del prompt final; sustitúyelos por dirección concreta.',

    },
  },
} as const;

const ABSTRACT_VERBS = /\b(shows?|feels?|seems?|appears?|zeigt|fühlt|wirkt|muestra|siente|parece)\b/i;
const STYLE_CONFLICTS: Array<[RegExp, RegExp]> = [
  [/\bnoir\b/i, /\b(colorful|vibrant|bunt|pastel|technicolor)\b/i],
  [/\b(anime|cartoon|comic)\b/i, /\b(photoreal|hyperreal|documentary)\b/i],
  [/\bvintage\b/i, /\b(futurist|cyberpunk|neon)\b/i],
];

interface ScoreInputs {
  scene: Pick<
    ComposerScene,
    | 'aiPrompt'
    | 'characterShots'
    | 'characterShot'
    | 'shotDirector'
    | 'cinematicPresetSlug'
    | 'dialogScript'
    | 'audioPlan'
    | 'dialogLockedAt'
  >;
  finalPrompt: string;
  negativePrompt: string;
  language?: DirectorLanguage;
}

function severityScore(s: Severity): number {
  return s === 'pass' ? 100 : s === 'warn' ? 60 : 0;
}

export function evaluateSceneQuality({
  scene,
  finalPrompt,
  negativePrompt,
  language = 'en',
}: ScoreInputs): QualityResult {
  const L = T[language] ?? T.en;
  const tips: Tip[] = [];
  const axes: Record<QualityAxis, Severity> = {
    subject: 'fail',
    action: 'fail',
    shot: 'fail',
    dialog: 'pass',
    negative: 'fail',
    length: 'fail',
    consistency: 'pass',
  };

  const prompt = (finalPrompt ?? '').trim();
  const raw = (scene.aiPrompt ?? '').trim();

  // 1. SUBJECT — at least one cast assignment OR explicit @mention
  const castCount =
    (scene.characterShots?.length ?? 0) +
    (scene.characterShot ? 1 : 0);
  const hasMention = /@\w/.test(raw);
  if (castCount > 0 || hasMention) {
    axes.subject = 'pass';
  } else if (/\b(person|woman|man|founder|host|narrator|frau|mann|gründer|persona|fundador)\b/i.test(raw)) {
    axes.subject = 'warn';
    tips.push({ axis: 'subject', severity: 'warn', label: L.subject.warn, hint: L.hints.subjectWarn });
  } else {
    tips.push({ axis: 'subject', severity: 'fail', label: L.subject.fail, hint: L.hints.subjectFail });
  }

  // 2. ACTION — present and not built around abstract verbs
  if (raw.length >= 20) {
    if (ABSTRACT_VERBS.test(raw) && !/\b(walks?|runs?|lifts?|pours?|opens?|läuft|rennt|hebt|gießt|öffnet|camina|corre|levanta|vierte|abre)\b/i.test(raw)) {
      axes.action = 'warn';
      tips.push({ axis: 'action', severity: 'warn', label: L.action.warn, hint: L.hints.actionWarn });
    } else {
      axes.action = 'pass';
    }
  } else {
    tips.push({ axis: 'action', severity: 'fail', label: L.action.fail, hint: L.hints.actionFail });
  }

  // 3. SHOT — Shot Director or preset
  const sd = scene.shotDirector;
  const shotSlots = sd ? [sd.framing, sd.angle, sd.movement, sd.lighting].filter(Boolean).length : 0;
  if (scene.cinematicPresetSlug || shotSlots >= 3) {
    axes.shot = 'pass';
  } else if (shotSlots >= 1 || /\b(close-up|wide|dolly|tracking|crane|steadicam|85mm|24mm)\b/i.test(raw)) {
    axes.shot = 'warn';
    tips.push({ axis: 'shot', severity: 'warn', label: L.shot.warn, hint: L.hints.shotWarn });
  } else {
    tips.push({ axis: 'shot', severity: 'fail', label: L.shot.fail, hint: L.hints.shotFail });
  }

  // 4. DIALOG — pass if no dialog OR locked plan; warn if draft; fail if dialog text exists but no plan
  const hasDialogText = !!(scene.dialogScript && scene.dialogScript.trim().length > 0);
  const plan: AudioPlan | undefined = scene.audioPlan;
  const planLocked = !!scene.dialogLockedAt && !!plan?.speakers?.some((s) => s.endSec > 0);
  if (!hasDialogText && !plan?.speakers?.length) {
    axes.dialog = 'pass';
  } else if (planLocked) {
    axes.dialog = 'pass';
  } else if (hasDialogText && !plan?.speakers?.length) {
    axes.dialog = 'fail';
    tips.push({ axis: 'dialog', severity: 'fail', label: L.dialog.fail, hint: L.hints.dialogFail });
  } else {
    axes.dialog = 'warn';
    tips.push({ axis: 'dialog', severity: 'warn', label: L.dialog.warn, hint: L.hints.dialogWarn });
  }

  // 5. NEGATIVE
  const negLen = (negativePrompt ?? '').trim().length;
  if (negLen >= 40) axes.negative = 'pass';
  else if (negLen > 0) {
    axes.negative = 'warn';
    tips.push({ axis: 'negative', severity: 'warn', label: L.negative.warn, hint: L.hints.negativeWarn });
  } else {
    tips.push({ axis: 'negative', severity: 'fail', label: L.negative.fail, hint: L.hints.negativeFail });
  }

  // 6. LENGTH (of final prompt — not raw)
  const len = prompt.length;
  if (len >= 80 && len <= 600) axes.length = 'pass';
  else if (len < 35) {
    tips.push({ axis: 'length', severity: 'fail', label: L.length.fail, hint: L.hints.lengthFail });
  } else if (len > 1200) {
    tips.push({ axis: 'length', severity: 'fail', label: L.length.fail, hint: L.hints.lengthFailLong });
  } else {
    axes.length = 'warn';
    tips.push({ axis: 'length', severity: 'warn', label: L.length.warn, hint: L.hints.lengthWarn });
  }

  // 7. CONSISTENCY — style clashes + Phase 1 hygiene (boilerplate + redundancy)
  for (const [a, b] of STYLE_CONFLICTS) {
    if (a.test(prompt) && b.test(prompt)) {
      axes.consistency = 'warn';
      tips.push({ axis: 'consistency', severity: 'warn', label: L.consistency.warn, hint: L.hints.consistencyWarn });
      break;
    }
  }

  // 7a. BOILERPLATE — system auto-placeholder cast actions still in scene
  const castMatch = raw.match(/\[CastActions\]\s*([\s\S]*?)\s*\[\/CastActions\]/i);
  const sceneMatch = raw.match(/\[SceneAction\]\s*([\s\S]*?)\s*\[\/SceneAction\]/i);
  const castLines = castMatch
    ? castMatch[1].split('\n').map((l) => l.replace(/^\s*-\s*[^:]+:\s*/, '').trim()).filter(Boolean)
    : [];
  const boilerCount = castLines.filter((l) => isBoilerplateAction(l)).length;
  if (boilerCount > 0) {
    if (axes.consistency === 'pass') axes.consistency = 'warn';
    tips.push({ axis: 'consistency', severity: 'warn', label: L.consistency.warn, hint: L.hints.boilerplateWarn });
  }

  // 7b. REDUNDANCY — cast line overlaps scene action ≥ 0.5 Jaccard
  const sceneText = sceneMatch?.[1]?.trim() ?? '';
  if (sceneText && castLines.length > 0) {
    const overlap = castLines.some((l) => !isBoilerplateAction(l) && jaccardOverlap(l, sceneText) >= 0.5);
    if (overlap) {
      if (axes.consistency === 'pass') axes.consistency = 'warn';
      tips.push({ axis: 'consistency', severity: 'warn', label: L.consistency.warn, hint: L.hints.redundancyWarn });
    }
  }



  // Aggregate score
  const values = Object.values(axes);
  const score = Math.round(
    values.reduce((sum, s) => sum + severityScore(s), 0) / values.length,
  );

  // Order tips: fail → warn → pass(none emitted)
  tips.sort((a, b) => {
    const order: Record<Severity, number> = { fail: 0, warn: 1, pass: 2 };
    return order[a.severity] - order[b.severity];
  });

  return { score, axes, tips };
}
