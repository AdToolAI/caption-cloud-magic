/**
 * Tiny in-memory registry of "just-clicked" lip-sync toggle values per scene.
 *
 * Why this exists:
 *   The composer dashboard subscribes to `composer_scenes` realtime changes
 *   and re-hydrates local scene state from the DB on every tick. When the user
 *   clicks the Lip-Sync toggle, we do an optimistic local update + an atomic
 *   DB write. But a realtime UPDATE event from a *different* column (e.g.
 *   clip_status from the render pipeline) can fire in the gap between our
 *   write being sent and Postgres committing it — the refetch then reads the
 *   OLD `lip_sync_with_voiceover` value and silently reverts the toggle.
 *
 * The registry remembers the user's intended value for a short window
 * (REGISTRY_TTL_MS). The refetch path consults this map and prefers the
 * pending value over the DB row, so the toggle no longer flips back.
 *
 * Entries auto-expire so a genuine remote change (collaborator turning it off)
 * still wins after the window has passed.
 */

type Entry = { value: boolean; expiresAt: number };

const REGISTRY_TTL_MS = 8_000;
const registry = new Map<string, Entry>();

export function markLipSyncPending(sceneId: string, value: boolean): void {
  if (!sceneId) return;
  registry.set(sceneId, { value, expiresAt: Date.now() + REGISTRY_TTL_MS });
}

export function clearLipSyncPending(sceneId: string): void {
  registry.delete(sceneId);
}

/**
 * Returns the pending toggle value for a scene if one was recorded recently,
 * otherwise undefined. Expired entries are cleaned up lazily on read.
 */
export function getLipSyncPending(sceneId: string): boolean | undefined {
  const entry = registry.get(sceneId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    registry.delete(sceneId);
    return undefined;
  }
  return entry.value;
}

/**
 * Resolves the value to use for `lipSyncWithVoiceover` when hydrating a scene
 * from a DB row. Pending value wins inside the TTL window; otherwise the DB
 * value is the source of truth.
 */
export function resolveLipSyncValue(sceneId: string, dbValue: boolean): boolean {
  const pending = getLipSyncPending(sceneId);
  if (pending === undefined) return dbValue;
  // Once the DB has caught up to our pending value, drop the override so
  // future remote changes (collaborators, server-side flips) take effect
  // immediately.
  if (pending === dbValue) {
    registry.delete(sceneId);
    return dbValue;
  }
  return pending;
}
