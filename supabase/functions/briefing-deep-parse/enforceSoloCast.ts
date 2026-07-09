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

export function enforceSoloCast(plan: any): { trimmedScenes: number; droppedSlots: number } {
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  let trimmedScenes = 0;
  let droppedSlots = 0;

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

    const cast = Array.isArray(sc.cast) ? sc.cast : [];
    if (cast.length <= 1) continue;

    const kept = cast.filter((c: any) => castKey(c) === soloKey);
    if (kept.length === 0) continue; // no match → don't wipe the cast

    if (kept.length !== cast.length) {
      droppedSlots += cast.length - kept.length;
      trimmedScenes += 1;
      sc.cast = kept;
      // Also mark the scene meta so the UI can flag the trim.
      const meta = (sc._meta = sc._meta ?? {});
      const af = new Set<string>(Array.isArray(meta.aiFilled) ? meta.aiFilled : []);
      af.add('cast.soloEnforced');
      meta.aiFilled = [...af];
    }

    // H3 — strip ensemble phrasing from action/description/visual fields so
    // solo shots don't render "Samuel, Matthew and Sarah share the scene".
    const ensembleRe = /\b([A-ZÄÖÜ][\w-]+(?:,\s*[A-ZÄÖÜ][\w-]+)+(?:\s*(?:and|und|&)\s*[A-ZÄÖÜ][\w-]+)?)\s+(share the (?:scene|frame|shot)|teilen sich (?:die\s+)?(?:szene|einstellung))\b[^.]*\.?/gi;
    for (const field of ['action', 'sceneAction', 'description', 'visualDirection', 'visual_direction', 'directorNote', 'notes']) {
      const v = sc[field];
      if (typeof v !== 'string' || !v) continue;
      const cleaned = v.replace(ensembleRe, '').replace(/\s{2,}/g, ' ').trim();
      if (cleaned !== v) sc[field] = cleaned;
    }
  }

  return { trimmedScenes, droppedSlots };
}
