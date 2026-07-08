// Pre-compose a scene-aware character first-frame via the
// `compose-scene-anchor` edge function when the resolver decides that the
// raw portrait would over-constrain composition.
//
// Returns the URL to use as `referenceImageUrl` for the provider call,
// or undefined when the strategy is `text-only` / `subject-reference`.
//
// Multi-character: when more than one character is detected in the scene
// (explicit shot + name matches, or multiple cast names in the prompt),
// ALL portraits are sent to compose-scene-anchor in a single Nano Banana 2
// edit call so the resulting first-frame contains all of them positioned
// according to the scene description.
//
// Stage A — World Assets as Visual References:
// Locations, buildings and props that the user mentions in the scene
// (via @-tag or the UnifiedAssetPicker block) are also forwarded as
// additional reference images to compose-scene-anchor. Nano Banana 2 then
// composes the named environment + props INTO the same first frame,
// instead of inventing generic stand-ins. This is the Artlist-parity
// "World assets are visual" unlock.

import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';
import {
  resolveSceneCharacterAnchorsAll,
  type SceneAnchor,
} from './resolveSceneCharacterAnchor';
import type { ComposerCharacter } from '@/types/video-composer';
import type { MotionStudioLocation } from '@/types/motion-studio';
import { findMentions } from './mentionParser';
import { readSceneAssetSlugs, slugifyAssetName } from './applySceneAssetsToPrompt';

interface BrandCharLike {
  id?: string;
  name?: string;
  reference_image_url?: string;
}

/** Resolved world reference picked up from scene mentions / asset block. */
export interface WorldRef {
  kind: 'location' | 'building' | 'prop';
  name: string;
  url: string;
}

export interface PreparedAnchor {
  /** URL to send as i2v first-frame; undefined when strategy ≠ first-frame-* */
  firstFrameUrl?: string;
  /** Subject-reference URL (Vidu/Kling Reference2V) — single. */
  subjectReferenceUrl?: string;
  /** Multiple subject references (Vidu Q2 reference2v: up to 7). */
  subjectReferenceUrls?: string[];
  /** Primary anchor (first one) — kept for backwards-compat logging. */
  anchor?: SceneAnchor;
  /** All anchors detected in the scene (>= 1 when any). */
  anchors?: SceneAnchor[];
  composed: boolean;
  /** When true, caller should consider routing to a multi-ref provider (Vidu). */
  isMulti?: boolean;
  /** Stage A — world refs that were composed into the first frame (audit/UI). */
  worldRefs?: WorldRef[];
}

export interface PrepareSceneAnchorOptions {
  /** When true, ignore an existing scene.referenceImageUrl and always run the
   *  multi-character composition (Nano Banana 2). Used by the Two-Shot path,
   *  where we MUST re-compose so all selected cast portraits land in one frame. */
  forceCompose?: boolean;
}

/**
 * Stage A helper — extract location / building / prop refs from a scene
 * by inspecting BOTH the @-mentions in the prompt and the
 * `<!--scene-assets-->` slug block left by the UnifiedAssetPicker.
 *
 * Hard caps mirror the edge function: 1 location, 1 building, 3 props.
 * Returns [] when the scene opted out via `scene.ignoreWorldRefs === true`
 * or when the world library is empty.
 */
export function resolveSceneWorldRefs(
  scene: Pick<ComposerScene, 'aiPrompt' | 'ignoreWorldRefs'>,
  worldLib: MotionStudioLocation[] | undefined,
): WorldRef[] {
  if (!worldLib || worldLib.length === 0) return [];
  if (scene.ignoreWorldRefs === true) return [];
  const prompt = scene.aiPrompt || '';
  if (!prompt) return [];

  const tagOf = (l: MotionStudioLocation): 'location' | 'building' | 'prop' => {
    const tags = (l.tags ?? []) as string[];
    if (tags.includes('building')) return 'building';
    if (tags.includes('prop')) return 'prop';
    return 'location';
  };

  // (a) @-mentions resolved against the world library (locations slot also
  // carries buildings + props, distinguished by tag).
  const matches = findMentions(prompt, [], worldLib);

  // (b) Slugs from the UnifiedAssetPicker block at the head of the prompt.
  //     v211: the block itself is slug-only for LLM readability, but callers
  //     that also emit a canonical `scene_assets` array pass through here via
  //     `scene.scene_assets` (below). Slug-fallback stays for legacy scenes.
  const slugs = readSceneAssetSlugs(prompt);

  // Merge: collect unique ids.
  const picked = new Map<string, MotionStudioLocation>();
  for (const m of matches) {
    if (m.kind !== 'location') continue;
    const l = worldLib.find((x) => x.id === m.id);
    if (l && l.reference_image_url && !picked.has(l.id)) picked.set(l.id, l);
  }
  // v211 — canonical UUID scene_assets (from composer_scenes.scene_assets column
  // or explicit picker state) win over slug-matching. Slugs are only used as a
  // fallback for legacy scenes that never had UUID persistence.
  const canonicalRefs = ((scene as any).scene_assets ?? []) as Array<{
    type?: string; id?: string;
  }>;
  for (const ref of canonicalRefs) {
    if (!ref?.id) continue;
    if (ref.type && !['location', 'building', 'prop'].includes(ref.type)) continue;
    const l = worldLib.find((x) => x.id === ref.id);
    if (l && l.reference_image_url && !picked.has(l.id)) picked.set(l.id, l);
  }
  for (const slug of slugs) {
    const l = worldLib.find((x) => slugifyAssetName(x.name) === slug);
    if (l && l.reference_image_url && !picked.has(l.id)) picked.set(l.id, l);
  }

  // Bucketize with hard caps.
  const result: WorldRef[] = [];
  let locCount = 0;
  let bldCount = 0;
  let propCount = 0;
  for (const l of picked.values()) {
    const kind = tagOf(l);
    if (kind === 'location' && locCount < 1) {
      result.push({ kind, name: l.name, url: l.reference_image_url! });
      locCount += 1;
    } else if (kind === 'building' && bldCount < 1) {
      result.push({ kind, name: l.name, url: l.reference_image_url! });
      bldCount += 1;
    } else if (kind === 'prop' && propCount < 3) {
      result.push({ kind, name: l.name, url: l.reference_image_url! });
      propCount += 1;
    }
  }
  return result;
}

export async function prepareSceneAnchor(
  scene: ComposerScene,
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
  scenePromptForCompose: string,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  options: PrepareSceneAnchorOptions = {},
  worldLib?: MotionStudioLocation[],
): Promise<PreparedAnchor> {
  const worldRefs = resolveSceneWorldRefs(scene, worldLib);

  // Existing manual reference always wins UNLESS the caller explicitly
  // requests a re-compose (e.g. multi-speaker two-shot).
  if (scene.referenceImageUrl && !options.forceCompose) {
    return { firstFrameUrl: scene.referenceImageUrl, composed: false, worldRefs };
  }

  const anchors = resolveSceneCharacterAnchorsAll(scene, characters, brandChar);
  if (anchors.length === 0) return { composed: false, worldRefs };

  const primary = anchors[0];
  const isMulti = anchors.length > 1;

  // Subject-reference provider (Vidu) → pass ALL portraits as separate refs.
  // Stage A: also append world-ref URLs so Vidu Q2 receives location/prop
  // identity (cap 7 total handled by Vidu provider; portraits ≤4 + worldRefs ≤5).
  if (primary.strategy === 'subject-reference') {
    const portraitOnly = anchors.map((a) => a.referenceImageUrl);
    const subjectAll = [...portraitOnly, ...worldRefs.map((w) => w.url)].slice(0, 7);
    return {
      subjectReferenceUrl: primary.referenceImageUrl,
      subjectReferenceUrls: subjectAll,
      anchor: primary,
      anchors,
      composed: false,
      isMulti,
      worldRefs,
    };
  }

  if (primary.strategy === 'first-frame-direct' && !isMulti) {
    return { firstFrameUrl: primary.referenceImageUrl, anchor: primary, anchors, composed: false, worldRefs };
  }

  if (primary.strategy === 'text-only' && !isMulti) {
    return { anchor: primary, anchors, composed: false, worldRefs };
  }

  // first-frame-composed (single OR multi). Multi always lands here because
  // the resolver upgrades the strategy when >1 anchor is present.
  try {
    // Outfit lookup — when a cast slot has `outfitLookId`, replace the
    // bare portrait with the saved outfit cover (e.g. Roman armor) so the
    // composed first frame shows the user-picked wardrobe. The bare
    // portrait is kept as `identityPortraitUrls` so face-lock still works.
    const rawSlots = (scene.characterShots && scene.characterShots.length > 0)
      ? scene.characterShots
      : (scene.characterShot ? [scene.characterShot] : []);
    const outfitIds = rawSlots
      .map((s) => (s as any)?.outfitLookId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const outfitUrlById = new Map<string, string>();
    const characterIdToOutfitUrl = new Map<string, string>();
    if (outfitIds.length > 0) {
      try {
        const { data: rows } = await supabase
          .from('avatar_outfit_looks')
          .select('id, cover_url, front_url')
          .in('id', outfitIds);
        for (const row of rows ?? []) {
          const url = (row as any).cover_url || (row as any).front_url;
          if (typeof url === 'string' && url.length > 0) {
            outfitUrlById.set(String((row as any).id), url);
          }
        }
        for (const s of rawSlots) {
          const oid = (s as any)?.outfitLookId as string | undefined;
          const url = oid ? outfitUrlById.get(oid) : undefined;
          if (s?.characterId && url) characterIdToOutfitUrl.set(s.characterId, url);
        }
      } catch (e) {
        console.warn('[prepareSceneAnchor] outfit lookup failed', e);
      }
    }
    const portraitUrls = anchors.map((a) =>
      characterIdToOutfitUrl.get(a.characterId) || a.referenceImageUrl,
    );
    const identityPortraitUrls = anchors.map((a) => a.referenceImageUrl);
    const wardrobeLockNames = anchors
      .filter((a) => characterIdToOutfitUrl.has(a.characterId))
      .map((a) => a.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    const locationUrls = worldRefs.filter((w) => w.kind === 'location').map((w) => w.url);
    const locationNames = worldRefs.filter((w) => w.kind === 'location').map((w) => w.name);
    const buildingUrls = worldRefs.filter((w) => w.kind === 'building').map((w) => w.url);
    const buildingNames = worldRefs.filter((w) => w.kind === 'building').map((w) => w.name);
    const propUrls = worldRefs.filter((w) => w.kind === 'prop').map((w) => w.url);
    const propNames = worldRefs.filter((w) => w.kind === 'prop').map((w) => w.name);
    // 60s race timeout — protects the UI if the edge worker dies before
    // returning. The edge function itself has a 45s internal timeout, so this
    // is just an extra safety net.
    const invokePromise = supabase.functions.invoke('compose-scene-anchor', {
      body: {
        sceneId: scene.id,
        portraitUrl: portraitUrls[0],
        portraitUrls,
        identityPortraitUrls,
        characterNames: anchors.map((a) => a.name),
        scenePrompt: scenePromptForCompose,
        aspectRatio,
        shotType: scene.characterShot?.shotType,
        locationUrls,
        locationNames,
        buildingUrls,
        buildingNames,
        propUrls,
        propNames,
        wardrobeLock: wardrobeLockNames.length > 0,
        wardrobeLockNames,
      },
    });
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: new Error('compose-scene-anchor client timeout (60s)') }),
        60_000,
      ),
    );
    const { data, error } = (await Promise.race([invokePromise, timeoutPromise])) as any;
    if (error) throw error;
    if (data?.composedUrl) {
      return {
        firstFrameUrl: data.composedUrl,
        anchor: primary,
        anchors,
        composed: true,
        isMulti,
        worldRefs,
      };
    }
    console.warn(`[prepareSceneAnchor] compose returned no url for ${scene.id}, falling back to text-only`);
    return { anchor: primary, anchors, composed: false, isMulti, worldRefs };
  } catch (e) {
    console.error(`[prepareSceneAnchor] compose failed for ${scene.id}, text-only fallback`, e);
    return { anchor: primary, anchors, composed: false, isMulti, worldRefs };
  }
}
