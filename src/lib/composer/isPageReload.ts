/**
 * Returns true if the current page was loaded via a browser reload
 * (F5, Cmd-R, refresh button, programmatic `location.reload()`).
 *
 * Returns false for fresh SPA navigations (sidebar clicks, direct URL
 * entry, back/forward) — these get navigation.type === 'navigate' or
 * 'back_forward'.
 *
 * Defensive: older Safari and some embedded webviews don't expose the
 * Navigation Timing API; in that case we assume "not a reload" so the
 * cinematic intro still plays at least once.
 */
export function isPageReload(): boolean {
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
