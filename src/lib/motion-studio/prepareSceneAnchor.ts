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

import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';
import {
  resolveSceneCharacterAnchorsAll,
  type SceneAnchor,
} from './resolveSceneCharacterAnchor';
import type { ComposerCharacter } from '@/types/video-composer';

interface BrandCharLike {
  id?: string;
  name?: string;
  reference_image_url?: string;
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
}

export interface PrepareSceneAnchorOptions {
  /** When true, ignore an existing scene.referenceImageUrl and always run the
   *  multi-character composition (Nano Banana 2). Used by the Two-Shot path,
   *  where we MUST re-compose so all selected cast portraits land in one frame. */
  forceCompose?: boolean;
}

export async function prepareSceneAnchor(
  scene: ComposerScene,
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
  scenePromptForCompose: string,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  options: PrepareSceneAnchorOptions = {},
): Promise<PreparedAnchor> {
  // Existing manual reference always wins UNLESS the caller explicitly
  // requests a re-compose (e.g. multi-speaker two-shot).
  if (scene.referenceImageUrl && !options.forceCompose) {
    return { firstFrameUrl: scene.referenceImageUrl, composed: false };
  }

  const anchors = resolveSceneCharacterAnchorsAll(scene, characters, brandChar);
  if (anchors.length === 0) return { composed: false };

  const primary = anchors[0];
  const isMulti = anchors.length > 1;

  // Subject-reference provider (Vidu) → pass ALL portraits as separate refs.
  if (primary.strategy === 'subject-reference') {
    return {
      subjectReferenceUrl: primary.referenceImageUrl,
      subjectReferenceUrls: anchors.map((a) => a.referenceImageUrl),
      anchor: primary,
      anchors,
      composed: false,
      isMulti,
    };
  }

  if (primary.strategy === 'first-frame-direct' && !isMulti) {
    return { firstFrameUrl: primary.referenceImageUrl, anchor: primary, anchors, composed: false };
  }

  if (primary.strategy === 'text-only' && !isMulti) {
    return { anchor: primary, anchors, composed: false };
  }

  // first-frame-composed (single OR multi). Multi always lands here because
  // the resolver upgrades the strategy when >1 anchor is present.
  try {
    const portraitUrls = anchors.map((a) => a.referenceImageUrl);
    // 60s race timeout — protects the UI if the edge worker dies before
    // returning. The edge function itself has a 45s internal timeout, so this
    // is just an extra safety net.
    const invokePromise = supabase.functions.invoke('compose-scene-anchor', {
      body: {
        sceneId: scene.id,
        portraitUrl: portraitUrls[0],
        portraitUrls,
        characterNames: anchors.map((a) => a.name),
        scenePrompt: scenePromptForCompose,
        aspectRatio,
        shotType: scene.characterShot?.shotType,
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
      };
    }
    console.warn(`[prepareSceneAnchor] compose returned no url for ${scene.id}, falling back to text-only`);
    return { anchor: primary, anchors, composed: false, isMulti };
  } catch (e) {
    console.error(`[prepareSceneAnchor] compose failed for ${scene.id}, text-only fallback`, e);
    return { anchor: primary, anchors, composed: false, isMulti };
  }
}
