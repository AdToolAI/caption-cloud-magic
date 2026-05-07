// Pre-compose a scene-aware character first-frame via the
// `compose-scene-anchor` edge function when the resolver decides that the
// raw portrait would over-constrain composition.
//
// Returns the URL to use as `referenceImageUrl` for the provider call,
// or undefined when the strategy is `text-only` / `subject-reference`.

import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';
import { resolveSceneCharacterAnchor, type SceneAnchor } from './resolveSceneCharacterAnchor';
import type { ComposerCharacter } from '@/types/video-composer';

interface BrandCharLike {
  id?: string;
  name?: string;
  reference_image_url?: string;
}

export interface PreparedAnchor {
  /** URL to send as i2v first-frame; undefined when strategy ≠ first-frame-* */
  firstFrameUrl?: string;
  /** Subject-reference URL (Vidu/Kling Reference2V); undefined otherwise. */
  subjectReferenceUrl?: string;
  anchor?: SceneAnchor;
  composed: boolean;
}

export async function prepareSceneAnchor(
  scene: ComposerScene,
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
  scenePromptForCompose: string,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
): Promise<PreparedAnchor> {
  // Existing manual reference always wins.
  if (scene.referenceImageUrl) {
    return { firstFrameUrl: scene.referenceImageUrl, composed: false };
  }

  const anchor = resolveSceneCharacterAnchor(scene, characters, brandChar);
  if (!anchor) return { composed: false };

  switch (anchor.strategy) {
    case 'first-frame-direct':
      return { firstFrameUrl: anchor.referenceImageUrl, anchor, composed: false };
    case 'subject-reference':
      return { subjectReferenceUrl: anchor.referenceImageUrl, anchor, composed: false };
    case 'text-only':
      return { anchor, composed: false };
    case 'first-frame-composed': {
      try {
        const { data, error } = await supabase.functions.invoke('compose-scene-anchor', {
          body: {
            sceneId: scene.id,
            portraitUrl: anchor.referenceImageUrl,
            scenePrompt: scenePromptForCompose,
            aspectRatio,
            shotType: scene.characterShot?.shotType,
          },
        });
        if (error) throw error;
        if (data?.composedUrl) {
          return { firstFrameUrl: data.composedUrl, anchor, composed: true };
        }
        // Fallback strategy from the function: text-only
        console.warn(`[prepareSceneAnchor] compose returned no url for ${scene.id}, falling back to text-only`);
        return { anchor, composed: false };
      } catch (e) {
        console.error(`[prepareSceneAnchor] compose failed for ${scene.id}, text-only fallback`, e);
        return { anchor, composed: false };
      }
    }
  }
}
