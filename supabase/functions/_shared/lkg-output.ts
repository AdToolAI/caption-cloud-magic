/**
 * V517-B2 — LAST-KNOWN-GOOD POINTER ON DURABLE GENERATION OUTPUTS
 * ---------------------------------------------------------------------------
 * V518 made every new Dialog/Cinematic output durable and immutable per
 * generation:
 *
 *   composer/{projectId}/{sceneId}/gen-{N}/base.mp4
 *   composer/{projectId}/{sceneId}/gen-{N}/final.mp4
 *
 * That removes the hard part of the original V517-B design. The old output no
 * longer has to be COPIED before a rerender destroys it — it is already at an
 * address the next generation cannot address. All that is missing is a
 * pointer, and a reset that knows the difference between "the user wants a new
 * take" and "the user wants this gone".
 *
 * ── WHY THE GENERATION COMES FROM THE KEY ──────────────────────────────────
 * `composer_start_scene_run` bumps `plate_generation` and sets
 * `plate_ready_generation = NULL` BEFORE `hardResetScene` runs. By the time
 * the reset reads the scene, the realized generation is already erased and
 * `plate_generation` is the NEW one — neither column can name the output that
 * is about to be cleared.
 *
 * The durable key can. `/gen-14/final.mp4` states its own provenance, so the
 * pointer is derived from the artefact rather than from a column whose value
 * has already moved on.
 *
 * This also settles the legacy question for free: a pre-V518 output — a fixed
 * scene key, an external provider URL, an upload — carries no generation
 * segment, cannot be proven durable, and is therefore never promoted. Old
 * scenes keep working; they simply gain a fallback at their first post-V518
 * rerender instead of immediately.
 */

/** Mirrors the V518 layout. Kept as a literal so this module stays a leaf. */
const DURABLE_KEY_RE =
  /\/composer\/([^/?#]+)\/([^/?#]+)\/gen-(\d+)\/(base|final)\.mp4(?:$|[?#])/;

export interface DurableOutputRef {
  projectId: string;
  sceneId: string;
  generation: number;
  kind: "base" | "final";
}

export type LkgDecisionReason =
  | "promoted"
  | "no_current_output"
  | "current_output_not_durable"
  | "kept_existing";

export interface LkgDecision {
  /** The fields to merge into the reset patch. `null` = leave the row alone. */
  patch: { last_good_output_url: string; last_good_output_generation: number } | null;
  reason: LkgDecisionReason;
  /** What the pointer will name after this reset, for telemetry. */
  generation: number | null;
}

/**
 * PURE — read the provenance out of a durable output URL.
 *
 * Returns null for anything that is not exactly the V518 layout: an external
 * provider URL, the legacy fixed scene key, an upload, a malformed string.
 */
export function parseDurableOutputRef(url: unknown): DurableOutputRef | null {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return null;
  const m = DURABLE_KEY_RE.exec(s);
  if (!m) return null;
  const generation = Number(m[3]);
  if (!Number.isFinite(generation) || !Number.isInteger(generation) || generation < 0) return null;
  return { projectId: m[1], sceneId: m[2], generation, kind: m[4] as "base" | "final" };
}

/**
 * PURE — what should the LKG pointer be after this rerender?
 *
 * Precedence for the candidate follows the existing generated-output
 * semantics: the finished, muxed result outranks the plate. `upload_url` is
 * deliberately absent — a user upload is not a generated result, and it is
 * not cleared by a rerender anyway, so it needs no fallback.
 *
 * The three ways to leave the pointer alone matter as much as the promotion:
 *
 *   · no current output at all — a paused or failed run produced nothing, and
 *     the previous fallback must survive. Generation 14 succeeds, 15 pauses,
 *     16 starts: 16 must still be able to show 14.
 *   · the current output is not a durable V518 object — legacy or external,
 *     so a pointer to it would be a promise we cannot keep.
 *   · both — keep whatever is already there.
 */
export function decideLkgPromotion(input: {
  processedVideoUrl?: unknown;
  baseVideoUrl?: unknown;
  clipUrl?: unknown;
  existingLkgUrl?: unknown;
}): LkgDecision {
  const candidates = [input?.processedVideoUrl, input?.baseVideoUrl, input?.clipUrl];
  const hasAnyCurrent = candidates.some((c) => typeof c === "string" && c.trim().length > 0);

  for (const candidate of candidates) {
    const ref = parseDurableOutputRef(candidate);
    if (ref) {
      return {
        patch: {
          last_good_output_url: String(candidate).trim(),
          last_good_output_generation: ref.generation,
        },
        reason: "promoted",
        generation: ref.generation,
      };
    }
  }

  const keptRef = parseDurableOutputRef(input?.existingLkgUrl);
  return {
    patch: null,
    reason: !hasAnyCurrent
      ? "no_current_output"
      : "current_output_not_durable",
    generation: keptRef?.generation ?? null,
  };
}

/**
 * PURE — the exact storage prefix that holds every durable generation of ONE
 * scene. Never a bucket-wide walk, never a substring match: a sibling scene
 * whose id merely contains this one's would be reachable by `includes()`, and
 * deleting another scene's video is not a cleanup, it is data loss.
 */
export function durableScenePrefix(projectId: string, sceneId: string): string {
  const p = String(projectId ?? "").trim();
  const s = String(sceneId ?? "").trim();
  if (!p || !s) throw new Error("durableScenePrefix: projectId and sceneId are required");
  return `composer/${p}/${s}`;
}

/**
 * PURE — which of the enumerated generation folders may be deleted.
 *
 * `keep` names the generations that are still referenced: the current run's
 * and the one the LKG pointer names. Everything else is unreferenced history.
 * An unparseable folder name is KEPT — a name we cannot read is not a name we
 * may delete.
 */
export function selectDeletableGenerationFolders(
  folders: Array<string | null | undefined>,
  keep: Array<number | null | undefined>,
): string[] {
  const keepSet = new Set(
    keep.filter((g): g is number => typeof g === "number" && Number.isInteger(g)),
  );
  const out: string[] = [];
  for (const f of folders ?? []) {
    const name = String(f ?? "").trim();
    const m = /^gen-(\d+)$/.exec(name);
    if (!m) continue;
    const gen = Number(m[1]);
    if (!Number.isInteger(gen)) continue;
    if (keepSet.has(gen)) continue;
    out.push(name);
  }
  return out;
}
