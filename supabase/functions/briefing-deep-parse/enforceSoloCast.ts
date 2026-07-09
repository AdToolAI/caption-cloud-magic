/**
 * G3 — Solo-Cast Enforcement.
 *
 * For scenes whose `dialogTurns` name exactly one unique speaker (the shot is
 * a solo close-up on that speaker), trim `scene.cast` down to that single
 * character. This overrides the ensemble-guarantee for shots that were
 * explicitly written as solo in the script.
 *
 * Runs AFTER ensemble-repair and AFTER strict-cast, so all remaining cast
 * slots already carry a resolved `characterId` from the briefed library.
 *
 * Voice-binding (G4) is handled naturally: voice slots live on
 * `cast[].voiceId`, so trimming cast automatically drops leftover voice
 * assignments for characters that aren't speaking in the scene.
 *
 * Non-destructive: scenes without dialogTurns or with 2+ unique speakers are
 * left untouched.
 */

function normalizeMention(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function castKey(c: any): string {
  const id = typeof c?.characterId === 'string' ? c.characterId.toLowerCase() : '';
  if (id) return id;
  return normalizeMention(c?.mentionKey || c?.characterName || '');
}

// I3 — Ensemble phrasing patterns that must never survive on a solo shot.
// Matches phrases like:
//   "Samuel, Matthew, Sarah and Kailee share the scene together"
//   "…each visible to camera with their own action"
//   "Group scene with Samuel, Matthew…"
//   "every face composition"
//   "…teilen sich die Szene"
const ENSEMBLE_PATTERNS: RegExp[] = [
  /\b[A-ZÄÖÜ][\w'-]+(?:,\s*[A-ZÄÖÜ][\w'-]+)+(?:\s*(?:and|und|&)\s*[A-ZÄÖÜ][\w'-]+)?\s+(?:share|teilen sich)\b[^.]*\.?/gi,
  /\b(?:group|ensemble|multi[- ]speaker|four[- ]speaker|four[- ]way)\s+(?:scene|shot|composition|frame)\b[^.]*\.?/gi,
  /\beach\s+(?:visible|in frame|in shot|to camera)[^.]*\.?/gi,
  /\bevery\s+face\s+(?:in\s+(?:frame|shot)|visible|composition)[^.]*\.?/gi,
  /\ball\s+(?:four|4|three|3|speakers?|characters?)\s+(?:visible|in frame|share|together)[^.]*\.?/gi,
];

const ENSEMBLE_FIELDS = [
  'action',
  'sceneAction',
  'scene_action',
  'description',
  'visual',
  'visualPrompt',
  'visual_prompt',
  'visualDirection',
  'visual_direction',
  'directorNote',
  'director_note',
  'notes',
  'prompt',
  'aiPrompt',
  'ai_prompt',
  'shotPrompt',
  'shot_prompt',
  'summary',
];

function scrubEnsemble(text: string): string {
  let out = text;
  for (const re of ENSEMBLE_PATTERNS) {
    out = out.replace(re, '');
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

export function enforceSoloCast(plan: any): { trimmedScenes: number; droppedSlots: number; scrubbedFields: number } {
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  let trimmedScenes = 0;
  let droppedSlots = 0;
  let scrubbedFields = 0;

  for (const sc of scenes) {
    const turns = Array.isArray(sc?.dialogTurns) ? sc.dialogTurns : [];
    if (turns.length === 0) continue;
    const speakerKeys = new Set<string>();
    for (const t of turns) {
      const k = normalizeMention(t?.speakerMentionKey);
      if (k) speakerKeys.add(k);
    }
    if (speakerKeys.size !== 1) continue;
    const soloKey = [...speakerKeys][0];
    if (!soloKey) continue;

    // Trim cast down to the solo speaker (if cast still has multiple slots).
    const cast = Array.isArray(sc.cast) ? sc.cast : [];
    if (cast.length > 1) {
      const kept = cast.filter((c: any) => castKey(c) === soloKey);
      if (kept.length > 0 && kept.length !== cast.length) {
        droppedSlots += cast.length - kept.length;
        trimmedScenes += 1;
        sc.cast = kept;
        const meta = (sc._meta = sc._meta ?? {});
        const af = new Set<string>(Array.isArray(meta.aiFilled) ? meta.aiFilled : []);
        af.add('cast.soloEnforced');
        meta.aiFilled = [...af];
      }
    }

    // I3 — ALWAYS scrub ensemble phrasing on solo shots, even when cast was
    // already trimmed. The leak lives in prompt/visual/description too.
    for (const field of ENSEMBLE_FIELDS) {
      const v = sc[field];
      if (typeof v !== 'string' || !v) continue;
      const cleaned = scrubEnsemble(v);
      if (cleaned !== v) {
        sc[field] = cleaned;
        scrubbedFields += 1;
      }
    }
  }

  return { trimmedScenes, droppedSlots, scrubbedFields };
}
