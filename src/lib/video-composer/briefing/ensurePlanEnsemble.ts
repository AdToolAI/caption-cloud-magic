import type { ComposerBriefing } from '@/types/video-composer';
import type { TProductionPlan, TPlanScene, TResolvedCast } from './productionPlan';

const MAX_CAST = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeAssetKey(value?: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

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

export function ensureProductionPlanEnsemble(
  plan: TProductionPlan,
  briefing?: ComposerBriefing,
): TProductionPlan {
  const resolvedPlanCast = new Map<string, TResolvedCast>();
  for (const scene of plan?.scenes ?? []) {
    for (const c of scene.cast ?? []) {
      if (!c.characterId) continue;
      const keys = [c.mentionKey, c.characterName].map(normalizeAssetKey).filter(Boolean);
      for (const key of keys) if (!resolvedPlanCast.has(key)) resolvedPlanCast.set(key, c);
    }
  }
  const required = briefingCast(briefing).map((c) => {
    if (c.characterId) return c;
    const hit = resolvedPlanCast.get(normalizeAssetKey(c.mentionKey))
      ?? resolvedPlanCast.get(normalizeAssetKey(c.characterName));
    return hit?.characterId ? { ...c, characterId: hit.characterId, voiceId: c.voiceId ?? hit.voiceId ?? null } : c;
  });
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

    const cast = [...(scene.cast ?? [])];
    const present = new Set(cast.map(castKey).filter(Boolean));
    for (const c of required) {
      const key = castKey(c);
      if (present.has(key)) continue;
      if (cast.length >= MAX_CAST) break;
      cast.push({ ...c, shotType: 'full' });
      present.add(key);
    }

    const names = required.map((c) => c.characterName || c.mentionKey.replace(/^@/, ''));
    nextScenes[idx] = {
      ...scene,
      cast,
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

  return repaired > 0 ? { ...plan, scenes: nextScenes } : plan;
}