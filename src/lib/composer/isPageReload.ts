/**
 * Returns true if the *current tab session started with* a real browser
 * reload (F5 / Cmd-R / refresh button / programmatic `location.reload()`),
 * but ONLY for mount-time effects that happen close to the document load.
 *
 * Implementation notes:
 * - `performance.getEntriesByType("navigation")[0].type` reflects the
 *   original document load and never changes during the tab's lifetime.
 *   Naively returning it would treat *every* later SPA navigation as a
 *   reload, permanently suppressing intros and similar one-shot effects.
 * - We therefore cache the answer once at module load, and after a short
 *   grace window (~1.5s after the document finished loading) the helper
 *   always returns false. SPA navigations triggered later in the session
 *   are correctly treated as fresh navigations.
 */
const NAV_GRACE_MS = 1500;

let cachedWasReload: boolean | null = null;
let loadTimestamp = 0;

function readNavType(): boolean {
  try {
    if (typeof performance === "undefined") return false;
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  cachedWasReload = readNavType();
  loadTimestamp = (typeof performance !== "undefined" ? performance.now() : 0);
}

export function isPageReload(): boolean {
  if (typeof window === "undefined") return false;
  if (cachedWasReload !== true) return false;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  return now - loadTimestamp <= NAV_GRACE_MS;
}
