import type { ComposerBriefing } from '@/types/video-composer';
import type { TProductionPlan, TPlanScene, TResolvedCast } from './productionPlan';
import { dedupePlanScenesCast, dedupePlanSceneCast } from './planCastDedup';
import { planIsScriptLocked } from './finalizePlanCanonical';
import { normalizeAssetKey } from './assetKeyUtils';

const MAX_CAST = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMentionSlug(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cast';
}

function briefingCast(briefing?: ComposerBriefing): TResolvedCast[] {
  const out: TResolvedCast[] = [];
  const seen = new Set<string>();
  for (const c of (briefing?.characters ?? []).slice(0, MAX_CAST)) {
    const id = c.brandCharacterId || (UUID_RE.test(String(c.id ?? '')) ? String(c.id) : null);
    const name = c.name || 'Avatar';
    const key = id || normalizeAssetKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      mentionKey: `@${toMentionSlug(name)}`,
      characterId: id,
      characterName: name,
      referenceImageUrl: c.referenceImageUrl ?? null,
      voiceId: null,
    });
  }
  return out;
}

function castKey(c: Pick<TResolvedCast, 'characterId' | 'mentionKey' | 'characterName'>) {
  return c.characterId || normalizeAssetKey(c.mentionKey || c.characterName);
}

function sceneHasAll(scene: TPlanScene, required: TResolvedCast[]) {
  const keys = new Set((scene.cast ?? []).map(castKey).filter(Boolean));
  return required.every((c) => keys.has(castKey(c)));
}

function coverage(scene: TPlanScene, required: TResolvedCast[]) {
  const keys = new Set((scene.cast ?? []).map(castKey).filter(Boolean));
  return required.filter((c) => keys.has(castKey(c))).length;
}

function appendEnsemblePrompt(prompt: string | undefined, names: string[]) {
  const clean = String(prompt ?? '').trim();
  const joined = names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const sentence = `${joined} share the scene together in a wide group shot, all faces clearly visible to camera, standing side by side, each with a distinct visible action.`;
  if (clean.toLowerCase().includes(joined.toLowerCase())) return clean || sentence;
  return clean ? `${clean} ${sentence}` : sentence;
}

// I3 (client mirror) — patterns copied from supabase/functions/briefing-deep-parse/enforceSoloCast.ts
const ENSEMBLE_SCRUB_PATTERNS: RegExp[] = [
  /\b[A-ZÄÖÜ][\w'-]+(?:,\s*[A-ZÄÖÜ][\w'-]+)+(?:\s*(?:and|und|&)\s*[A-ZÄÖÜ][\w'-]+)?\s+(?:share|teilen sich)\b[^.]*\.?/gi,
  /\b(?:group|ensemble|multi[- ]speaker|four[- ]speaker|four[- ]way)\s+(?:scene|shot|composition|frame)\b[^.]*\.?/gi,
  /\beach\s+(?:visible|in frame|in shot|to camera)[^.]*\.?/gi,
  /\bevery\s+face\s+(?:in\s+(?:frame|shot)|visible|composition)[^.]*\.?/gi,
  /\ball\s+faces?\s+(?:clearly\s+)?(?:visible|in frame|in shot)[^.]*\.?/gi,
  /\ball\s+(?:four|4|three|3|speakers?|characters?)\s+(?:visible|in frame|share|together)[^.]*\.?/gi,
  /\b(?:standing|sitting)\s+side\s+by\s+side[^.]*\.?/gi,
];
const ENSEMBLE_SCRUB_FIELDS = [
  'action', 'sceneAction', 'description', 'visual', 'visualPrompt',
  'visualDirection', 'directorNote', 'notes', 'prompt', 'aiPrompt',
  'shotPrompt', 'summary', 'anchorPromptEN',
] as const;

function scrubEnsembleText(text: string): string {
  let out = text;
  for (const re of ENSEMBLE_SCRUB_PATTERNS) out = out.replace(re, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

function scrubSoloSceneEnsemble(scene: TPlanScene): TPlanScene {
  const turns = (scene as any).dialogTurns as Array<{ speakerMentionKey?: string }> | undefined;
  if (!Array.isArray(turns) || turns.length === 0) return scene;
  const speakers = new Set(turns.map((t) => normalizeAssetKey(t?.speakerMentionKey)).filter(Boolean));
  if (speakers.size !== 1) return scene;

  let changed = false;
  const next: any = { ...scene };
  for (const field of ENSEMBLE_SCRUB_FIELDS) {
    const v = next[field];
    if (typeof v !== 'string' || !v) continue;
    const cleaned = scrubEnsembleText(v);
    if (cleaned !== v) {
      next[field] = cleaned;
      changed = true;
    }
  }
  if (typeof next.voiceover?.text === 'string' && next.voiceover.text) {
    const cleaned = scrubEnsembleText(next.voiceover.text);
    if (cleaned !== next.voiceover.text) {
      next.voiceover = { ...next.voiceover, text: cleaned };
      changed = true;
    }
  }
  return changed ? (next as TPlanScene) : scene;
}

/**
 * A scene is "explicitly solo/duet" when its dialogTurns name a fixed set of
 * speakers (< required cast). In that case we MUST NOT force-inject the
 * remaining briefed cast — the script (LITERAL mode) or the LLM decided a
 * specific speaker breakdown and the ensemble-guarantee would overwrite it.
 */
function sceneIsExplicitlyScripted(scene: TPlanScene): boolean {
  const turns = (scene as any).dialogTurns as Array<{ speakerMentionKey?: string }> | undefined;
  if (!Array.isArray(turns) || turns.length === 0) return false;
  const uniqueSpeakers = new Set(
    turns.map((t) => normalizeAssetKey(t?.speakerMentionKey)).filter(Boolean),
  );
  return uniqueSpeakers.size >= 1;
}

export function ensureProductionPlanEnsemble(
  plan: TProductionPlan,
  briefing?: ComposerBriefing,
): TProductionPlan {
  // v215 — Script/Literal-Lock: wenn der Plan aus einem Skript stammt oder
  // im LITERAL-Mode ist, darf die Ensemble-Garantie NICHT eingreifen.
  // Solo-Szenen bleiben Solo, die Sprecherverteilung stammt vom Skript.
  const scriptLocked = planIsScriptLocked(plan);

  const resolvedPlanCast = new Map<string, TResolvedCast>();
  const outfitByCharacterId = new Map<string, string>();
  for (const scene of plan?.scenes ?? []) {
    for (const c of scene.cast ?? []) {
      if (!c.characterId) continue;
      const keys = [c.mentionKey, c.characterName].map((v) => normalizeAssetKey(v)).filter(Boolean);
      for (const key of keys) if (!resolvedPlanCast.has(key)) resolvedPlanCast.set(key, c);
      const look = (c as any).outfitLookId;
      if (look && !outfitByCharacterId.has(c.characterId)) outfitByCharacterId.set(c.characterId, look);
    }
  }
  const required = briefingCast(briefing).map((c) => {
    if (c.characterId) return c;
    const hit = resolvedPlanCast.get(normalizeAssetKey(c.mentionKey))
      ?? resolvedPlanCast.get(normalizeAssetKey(c.characterName));
    return hit?.characterId ? { ...c, characterId: hit.characterId, voiceId: c.voiceId ?? hit.voiceId ?? null } : c;
  });

  // In Script-Lock: nur Scrub (keine „share the scene"-Leaks) + Dedup,
  // aber KEINE Ensemble-Injektion.
  if (scriptLocked) {
    const scrubbed = (plan.scenes ?? []).map(scrubSoloSceneEnsemble);
    const anyScrubbed = scrubbed.some((s, i) => s !== plan.scenes[i]);
    const dedup = dedupePlanScenesCast(scrubbed);
    if (!anyScrubbed && dedup.removed === 0) return plan;
    return { ...plan, scenes: dedup.scenes as TPlanScene[] };
  }

  if (!plan?.scenes?.length || required.length < 2) return plan;

  const requiredCount = plan.scenes.length >= 6 ? 2 : 1;
  const currentCount = plan.scenes.filter((s) => sceneHasAll(s, required)).length;
  if (currentCount >= requiredCount) return plan;

  const middle: number[] = [];
  for (let i = 1; i < plan.scenes.length - 1; i += 1) middle.push(i);
  middle.sort((a, b) => coverage(plan.scenes[b], required) - coverage(plan.scenes[a], required));

  const order: number[] = [0];
  if (plan.scenes.length > 1) order.push(plan.scenes.length - 1);
  order.push(...middle);

  const nextScenes = plan.scenes.slice();
  let repaired = 0;
  const needed = requiredCount - currentCount;

  for (const idx of order) {
    if (repaired >= needed) break;
    const scene = nextScenes[idx];
    if (!scene || sceneHasAll(scene, required)) continue;
    // v214 — respect explicit script/dialog assignments: never overwrite scenes
    // whose dialogTurns already name specific speakers (LITERAL mode / solo shot).
    if (sceneIsExplicitlyScripted(scene)) continue;

    const cast = [...(scene.cast ?? [])];
    const present = new Set(cast.map(castKey).filter(Boolean));
    for (const c of required) {
      const key = castKey(c);
      if (present.has(key)) continue;
      if (cast.length >= MAX_CAST) break;
      const look = c.characterId ? outfitByCharacterId.get(c.characterId) ?? null : null;
      cast.push({ ...c, shotType: 'full', ...(look ? { outfitLookId: look } : {}) } as any);
      present.add(key);
    }
    const dedupCast = dedupePlanSceneCast(cast).cast;

    const names = required.map((c) => c.characterName || c.mentionKey.replace(/^@/, ''));
    nextScenes[idx] = {
      ...scene,
      cast: dedupCast,
      engine: 'cinematic-sync',
      lipSync: true,
      shotDirector: {
        ...(scene.shotDirector ?? {}),
        framing: 'wide',
        angle: scene.shotDirector?.angle ?? 'eye-level',
        movement: scene.shotDirector?.movement ?? 'static',
      },
      anchorPromptEN: appendEnsemblePrompt(scene.anchorPromptEN, names),
      _meta: {
        ...((scene as any)._meta ?? {}),
        aiFilled: Array.from(new Set([
          ...(((scene as any)._meta?.aiFilled ?? []) as string[]),
          'cast.ensembleGuarantee',
          'shotDirector.framing',
          'anchorPromptEN',
        ])),
      },
    } as TPlanScene;
    repaired += 1;
  }

  const finalScenes = repaired > 0 ? nextScenes : plan.scenes;
  const scrubbed = finalScenes.map(scrubSoloSceneEnsemble);
  const anyScrubbed = scrubbed.some((s, i) => s !== finalScenes[i]);
  const dedup = dedupePlanScenesCast(scrubbed);
  if (repaired === 0 && dedup.removed === 0 && !anyScrubbed) return plan;
  return { ...plan, scenes: dedup.scenes as TPlanScene[] };
}