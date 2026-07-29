/**
 * Fresh-Start-Guard
 *
 * When a user explicitly starts a NEW project in a wizard, any silent
 * auto-resume (DB draft recovery, localStorage backup restore) must be
 * suppressed — even across a full page reload (F5). Deleting the old draft
 * row is the primary mechanism; this flag is the fail-safe for cases where
 * the delete fails (offline, RLS, race).
 *
 * The flag lives in localStorage and is consumed on the next mount.
 */

const PREFIX = 'fresh-start:';
const MAX_AGE_MS = 1000 * 60 * 60; // 1h — long enough for a reload, short enough to self-heal

export function markFreshStart(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, String(Date.now()));
  } catch {
    /* storage unavailable — delete path still applies */
  }
}

/** Returns true if a fresh start was requested; clears the flag. */
export function consumeFreshStart(key: string): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return false;
    localStorage.removeItem(PREFIX + key);
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function clearFreshStart(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* noop */
  }
}
