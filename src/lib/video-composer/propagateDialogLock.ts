/**
 * Phase C.1 — Continuity Auto-Lock im Dialog-Modus.
 *
 * Iterates composer scenes in order and:
 *  1) Persists no DB writes itself (server persists the initial lock in
 *     compose-video-clips after the anchor compose).
 *  2) Propagates an existing `lockReferenceUrl` from the FIRST dialog scene
 *     of a cast-group to every subsequent dialog scene of the same cast that
 *     has no own lock yet.
 *  3) Annotates each scene with a transient `lockSource: 'self' | 'inherited' | null`
 *     plus `lockSourceSceneIndex` (1-based) so the UI can render different
 *     badges for own vs inherited locks. These fields are runtime-only and
 *     are NOT persisted (the dashboard's snake_case mapper does not write them).
 *
 * Cast signature = sorted, lowercased, unique characterIds of all
 * `characterShots` entries with `shotType !== 'absent'`. Empty cast ⇒ no group.
 */
import type { ComposerScene } from '@/types/video-composer';

function castSignature(scene: ComposerScene): string {
  const ids = (scene.characterShots ?? [])
    .filter((s) => s && s.shotType !== 'absent' && s.characterId)
    .map((s) => String(s.characterId).toLowerCase())
    .filter(Boolean);
  if (ids.length === 0 && scene.characterShot?.characterId && scene.characterShot.shotType !== 'absent') {
    ids.push(String(scene.characterShot.characterId).toLowerCase());
  }
  return Array.from(new Set(ids)).sort().join('|');
}

function isDialogScene(scene: ComposerScene): boolean {
  return Boolean((scene.dialogScript ?? '').trim().length > 0);
}

export interface PropagatedScene extends ComposerScene {
  /** Runtime-only: where the lockReferenceUrl came from. */
  lockSource?: 'self' | 'inherited' | null;
  /** Runtime-only: 1-based index of the source scene (for "erbt von Szene N"). */
  lockSourceSceneIndex?: number | null;
}

export function propagateDialogLock(scenes: ComposerScene[]): PropagatedScene[] {
  // Group leader = first dialog scene in each contiguous run of identical
  // cast signatures that has a non-empty lockReferenceUrl. Group ends on
  // cast-change OR when a non-dialog scene breaks the run.
  const out: PropagatedScene[] = scenes.map((s) => ({ ...s }));
  let leaderIdx: number | null = null;
  let leaderSig: string | null = null;
  let leaderLock: string | null = null;

  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (!isDialogScene(s)) {
      leaderIdx = null;
      leaderSig = null;
      leaderLock = null;
      // Strip any stale transient annotation.
      s.lockSource = s.lockReferenceUrl ? 'self' : null;
      s.lockSourceSceneIndex = null;
      continue;
    }
    const sig = castSignature(s);
    if (!sig) {
      leaderIdx = null;
      leaderSig = null;
      leaderLock = null;
      s.lockSource = s.lockReferenceUrl ? 'self' : null;
      s.lockSourceSceneIndex = null;
      continue;
    }

    if (sig !== leaderSig) {
      // Cast changed — start a new group.
      leaderSig = sig;
      leaderIdx = i;
      leaderLock = s.lockReferenceUrl ?? null;
      s.lockSource = s.lockReferenceUrl ? 'self' : null;
      s.lockSourceSceneIndex = null;
      continue;
    }

    // Same cast as leader.
    if (s.noInheritLock) {
      // Phase C.2 — user explicitly broke inheritance. Treat this scene as
      // the new sub-group leader (with no lock yet) so downstream same-cast
      // scenes can inherit from its future self-lock, not the old leader.
      leaderSig = sig;
      leaderIdx = i;
      leaderLock = s.lockReferenceUrl ?? null;
      s.lockSource = s.lockReferenceUrl ? 'self' : null;
      s.lockSourceSceneIndex = null;
    } else if (s.lockReferenceUrl) {
      // Has its own lock — stays self, becomes new leader for downstream.
      s.lockSource = 'self';
      s.lockSourceSceneIndex = null;
      leaderIdx = i;
      leaderLock = s.lockReferenceUrl;
    } else if (leaderLock) {
      // Inherit leader's lock at runtime (not persisted to DB).
      s.lockReferenceUrl = leaderLock;
      s.lockSource = 'inherited';
      s.lockSourceSceneIndex = (leaderIdx ?? 0) + 1;
    } else {
      s.lockSource = null;
      s.lockSourceSceneIndex = null;
    }
  }

  return out;
}
