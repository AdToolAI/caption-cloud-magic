/**
 * countSceneSpeakers — single source of truth for how many *distinct*
 * speakers a dialog scene has. Strictly ID-based: dedupes by `characterId`
 * (Cast & World UUID), falling back to `voiceId` only when the older
 * persisted map lacks characterId.
 *
 * Fixes the double-counting bug where `Object.keys(dialogVoices).length`
 * inflated the pass count because SceneDialogStudio writes several alias
 * keys per speaker (uuid + slug + first-name) into the map.
 */
import type { ComposerScene, DialogVoiceCfg } from '@/types/video-composer';

export function countSceneSpeakers(scene: Pick<ComposerScene, 'dialogVoices'>): number {
  const dv = scene?.dialogVoices;
  if (!dv) return 1;
  const ids = new Set<string>();
  for (const raw of Object.values(dv)) {
    if (!raw) continue;
    if (typeof raw === 'string') {
      // Legacy: bare voiceId string. Dedupe by that string.
      ids.add(raw);
      continue;
    }
    const cfg = raw as DialogVoiceCfg;
    const id = cfg.characterId ?? cfg.voiceId;
    if (id) ids.add(String(id));
  }
  return Math.max(1, ids.size);
}
