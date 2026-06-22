/**
 * Returns true if the *current page mount* is the result of a real browser
 * reload (F5 / Cmd-R / refresh button / programmatic `location.reload()`).
 *
 * Important: `performance.getEntriesByType("navigation")[0].type` reflects
 * the original document load and never changes during the tab's lifetime.
 * That means once a user reloaded the page once, every subsequent SPA
 * navigation would also look like a "reload" — which would permanently
 * suppress mount-time effects like the Motion Studio welcome intro.
 *
 * To avoid that we only honour the reload signal for the *first* call after
 * the document loaded. Every later call (i.e. SPA navigations within the
 * same tab) returns false so the consuming effect runs normally.
 */
let consumed = false;

export function isPageReload(): boolean {
  try {
    if (typeof performance === "undefined") return false;
    if (consumed) return false;
    consumed = true;
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
}
