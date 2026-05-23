/**
 * Phase C.2 — shared helper to compute a stable cast signature for a scene.
 * Kept in its own module so both `propagateDialogLock` and the dashboard
 * cast-change detector agree on the same key shape.
 */
import type { ComposerScene } from '@/types/video-composer';

export function castSignature(scene: ComposerScene | undefined | null): string {
  if (!scene) return '';
  const ids = (scene.characterShots ?? [])
    .filter((s) => s && s.shotType !== 'absent' && s.characterId)
    .map((s) => String(s.characterId).toLowerCase())
    .filter(Boolean);
  if (
    ids.length === 0 &&
    scene.characterShot?.characterId &&
    scene.characterShot.shotType !== 'absent'
  ) {
    ids.push(String(scene.characterShot.characterId).toLowerCase());
  }
  return Array.from(new Set(ids)).sort().join('|');
}
