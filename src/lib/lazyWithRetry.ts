import { lazy, type ComponentType } from "react";

/**
 * React.lazy with stale-bundle recovery.
 *
 * After a new deployment the browser may still hold the previous entry bundle,
 * whose route chunks no longer exist on the CDN. The dynamic import then fails
 * with "Failed to fetch dynamically imported module" and React's error boundary
 * swallows the rejection, so the global handler in main.tsx never sees it and
 * the user is stuck on the error card.
 *
 * Strategy: retry the import once (covers transient network blips), then reload
 * the page exactly once per session to pick up the fresh bundle. The
 * sessionStorage guard is shared with main.tsx so we never loop.
 */
const CHUNK_RELOAD_FLAG = "chunk-reload-attempted";

function isChunkLoadError(reason: unknown): boolean {
  const msg = String(
    (reason as { message?: string } | null)?.message ?? reason ?? "",
  );
  const name = String((reason as { name?: string } | null)?.name ?? "");
  return (
    name === "ChunkLoadError" ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

export function lazyWithRetry<T extends ComponentType<never>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      // 1st recovery: plain retry (transient network / CDN hiccup).
      try {
        return await factory();
      } catch (retryError) {
        if (!isChunkLoadError(retryError)) throw retryError;

        // 2nd recovery: the bundle really is stale — reload once per session.
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === "1";
          if (!alreadyReloaded) sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
        } catch {
          /* sessionStorage blocked */
        }

        if (!alreadyReloaded) {
          console.warn("[lazyWithRetry] stale bundle detected, reloading once");
          window.location.reload();
          // Keep the promise pending while the page reloads.
          return await new Promise<{ default: T }>(() => {});
        }

        throw retryError;
      }
    }
  });
}
