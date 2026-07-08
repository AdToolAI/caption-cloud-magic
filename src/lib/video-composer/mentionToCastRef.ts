/**
 * mentionToCastRef — single official boundary between the @-mention
 * library and the `CastRef` value object. Use this everywhere you turn
 * a `MotionStudioCharacter` (from `useUnifiedMentionLibrary`) into a
 * cast slot. Never construct CastRefs by hand from `mention.id`.
 */

import type { MotionStudioCharacter } from '@/types/motion-studio';
import type { CastRef } from '@/lib/video-composer/CastRef';
import { stripLegacyCastIdPrefix } from '@/lib/video-composer/CastRef';

export function mentionToCastRef(m: MotionStudioCharacter | null | undefined): CastRef | null {
  if (!m) return null;

  // Outfit mentions carry the base avatar id in meta.
  if (m.meta?.kind === 'outfit' && m.meta.baseCharacterId) {
    return {
      characterId: m.meta.baseCharacterId,
      outfitLookId: m.meta.outfitLookId ?? null,
      displayName: m.name,
      voiceId: m.voice_id ?? null,
    };
  }

  // Catalog characters: meta.baseCharacterId carries the resolved
  // brand_characters.id when the catalog row has been adopted into the user's
  // brand library (see useUnifiedMentionLibrary catalog bridge). Without that
  // bridge the catalog id is NOT a brand_characters UUID and downstream
  // renderers cannot look up portraits — surface a loud warning so the UI can
  // route the user to CastConsistencyMap / library adoption.
  if (m.meta?.kind === 'catalog') {
    if (m.meta.baseCharacterId) {
      return {
        characterId: m.meta.baseCharacterId,
        outfitLookId: null,
        displayName: m.name,
        voiceId: m.voice_id ?? null,
      };
    }
    if (typeof console !== 'undefined') {
      console.warn(
        `[mentionToCastRef] catalog character "${m.name}" (${m.id}) has no brand_characters bridge; ` +
          'render pipeline will not find a portrait until the character is adopted into the brand library.',
      );
    }
    return null;
  }

  const base = stripLegacyCastIdPrefix(m.id);
  if (!base) return null;
  return {
    characterId: base,
    outfitLookId: null,
    displayName: m.name,
    voiceId: m.voice_id ?? null,
  };
}
