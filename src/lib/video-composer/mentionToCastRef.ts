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

  // Catalog characters: meta.baseCharacterId may carry the catalog row's
  // resolved avatar id; otherwise strip the prefix as a last resort.
  if (m.meta?.kind === 'catalog' && m.meta.baseCharacterId) {
    return {
      characterId: m.meta.baseCharacterId,
      outfitLookId: null,
      displayName: m.name,
      voiceId: m.voice_id ?? null,
    };
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
