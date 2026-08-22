/**
 * generated-anchor — V440 "Rerender Anchor Lifecycle".
 *
 * Why this exists
 * ---------------
 * A cinematic-sync scene dispatches its plate with `reference_image_url` as the
 * provider's image input. That URL can point at two very different things:
 *
 *   1. a GENERATED scene anchor — composed by `compose-scene-anchor` and stored
 *      under `composer-frames/<user>/scene-anchors/<sceneId>-<hash>.png`. It is
 *      owned by the run: a hard reset purges the object.
 *   2. a PERSISTENT reference — a cast portrait, a brand-character image, a
 *      user upload, an external URL. It is NOT owned by the run and must
 *      survive every rerender.
 *
 * On 2026-08-22 a hard reset purged (1) but left the pointer on the scene row.
 * The v195 guard only tested string truthiness, so the dangling pointer passed
 * and HappyHorse was paid to fetch an object that returned `NoSuchKey` (400).
 *
 * This module supplies the two missing predicates:
 *   - which pointers a reset owns (so teardown may clear exactly those), and
 *   - whether a storage-backed anchor physically exists (so dispatch can refuse
 *     to spend on a dead link).
 *
 * Deliberately IO-light and Deno-global-free so it is unit-testable from the
 * frontend Vitest suite.
 */

/** Path markers that identify a generated (run-owned) scene anchor. */
export const GENERATED_ANCHOR_MARKERS = [
  "/scene-anchors/",
  "/composer-anchors/",
] as const;

export type AnchorVerdict =
  /** no pointer at all */
  | "anchor_pointer_missing"
  /** pointer resolves to an existing storage object */
  | "anchor_verified"
  /** pointer is storage-backed but the object is gone */
  | "anchor_object_missing"
  /** not a Supabase storage URL (external / persistent reference) — not ours to verify */
  | "anchor_not_storage_backed"
  /** storage answered with an error — fail OPEN, never block a paid run on infra noise */
  | "anchor_unverifiable";

export interface StorageObjectRef {
  bucket: string;
  /** full object path inside the bucket */
  path: string;
  /** directory portion (may be "") */
  dir: string;
  /** file name portion */
  file: string;
}

type StorageLike = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        opts?: Record<string, unknown>,
      ) => Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
    };
  };
};

/** True for URLs that were produced by our own anchor composition step. */
export function isGeneratedAnchorUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  return GENERATED_ANCHOR_MARKERS.some((m) => url.includes(m));
}

/**
 * True only for generated anchors that the hard reset of THIS scene purges.
 *
 * `purgeArtifacts()` deletes objects whose name contains the scene id, so the
 * ownership test mirrors that rule exactly. A generated anchor of a sibling
 * scene — or any persistent/user/cast reference — is never reset-owned.
 */
export function isResetOwnedGeneratedAnchor(
  url: unknown,
  sceneId: string,
): boolean {
  if (!isGeneratedAnchorUrl(url)) return false;
  if (!sceneId) return false;
  return String(url).includes(sceneId);
}

/**
 * Parses a Supabase storage URL (public or signed) into bucket + object path.
 * Returns null for anything that is not a Supabase storage object URL.
 */
export function parseSupabaseStorageUrl(
  url: unknown,
): StorageObjectRef | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const m = url.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/,
  );
  if (!m) return null;
  const bucket = decodeURIComponent(m[1]);
  const path = decodeURIComponent(m[2]);
  if (!bucket || !path) return null;
  const slash = path.lastIndexOf("/");
  return {
    bucket,
    path,
    dir: slash >= 0 ? path.slice(0, slash) : "",
    file: slash >= 0 ? path.slice(slash + 1) : path,
  };
}

/**
 * Existence check for a storage-backed anchor.
 *
 * Uses `list(dir, { search: file })` with an exact-name comparison — no HTTP
 * fetch against the provider-facing URL, no external egress.
 *
 * Fail-open on storage errors (`anchor_unverifiable`): an infra hiccup must not
 * turn a healthy anchor into a hard scene failure. Only a *proven* absence
 * returns `anchor_object_missing`.
 */
export async function verifyAnchorObject(
  client: StorageLike,
  url: unknown,
): Promise<AnchorVerdict> {
  if (typeof url !== "string" || url.length === 0) {
    return "anchor_pointer_missing";
  }
  const ref = parseSupabaseStorageUrl(url);
  if (!ref) return "anchor_not_storage_backed";
  try {
    const { data, error } = await client.storage
      .from(ref.bucket)
      .list(ref.dir, { limit: 100, search: ref.file });
    if (error) return "anchor_unverifiable";
    const found = (data ?? []).some((o) => (o?.name ?? "") === ref.file);
    return found ? "anchor_verified" : "anchor_object_missing";
  } catch {
    return "anchor_unverifiable";
  }
}

/** A verdict that must never reach a paid provider dispatch. */
export function blocksProviderDispatch(verdict: AnchorVerdict): boolean {
  return verdict === "anchor_pointer_missing" ||
    verdict === "anchor_object_missing";
}

/**
 * Which anchor pointer columns a hard reset of `sceneId` must clear.
 *
 * Returns an empty object when nothing is reset-owned, so the caller can spread
 * the result into its update patch without ever touching persistent anchors.
 */
export function resetOwnedAnchorPatch(
  scene: {
    reference_image_url?: unknown;
    lock_reference_url?: unknown;
  } | null | undefined,
  sceneId: string,
): Record<string, null> {
  const patch: Record<string, null> = {};
  if (!scene) return patch;
  if (isResetOwnedGeneratedAnchor(scene.reference_image_url, sceneId)) {
    patch.reference_image_url = null;
  }
  if (isResetOwnedGeneratedAnchor(scene.lock_reference_url, sceneId)) {
    patch.lock_reference_url = null;
  }
  return patch;
}
