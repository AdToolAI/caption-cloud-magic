/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V524 — PLATE-NATIVE IDENTITY REGISTRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 20, Sarah pass 0. V523 refused the repair with
 * `identity_unresolved`, and it was right to: the locked reference it was
 * handed was [269,84,343,204] while Sarah's actual face on base-video frame 60
 * was [87,192,275,378]. Centre distance 188 px, IoU 0.002, width 74 against
 * 188. Not a near-threshold case — a different picture.
 *
 * The reference came from the v278 router, whose own comment says what it
 * does: AWS Rekognition cannot read MP4 bytes, so it detects on the ANCHOR
 * STILL and scales the normalized boxes into `plateDims`. The result is
 * arithmetically in plate pixels and semantically in anchor composition. The
 * legacy `detectPlateFaces` path does the same whenever `anchorUrl` is set.
 *
 * So the pipeline has been conflating two different claims:
 *
 *     IDENTITY   "this face is Sarah"          — the anchor can answer this
 *     GEOMETRY   "Sarah is HERE in the plate"  — only the plate can answer it
 *
 * Whenever the generated base video changes framing, camera, scale or actor
 * position, the second claim is false while still being expressed in the right
 * units. That is the whole of the generation-20 failure.
 *
 * The bridge already existed in pieces, unassembled: Rekognition refuses MP4
 * bytes but reads a JPEG happily, and the codebase already extracts stills
 * from a video (`extractFrameForFaceProbe`) and already matches faces to
 * characters biometrically (`resolveIdentityViaRekognition`). Pointing the
 * second at the output of the first gives identity AND geometry measured on
 * the same actual plate frame.
 *
 * Both primitives are INJECTED, so this module stays a leaf with no network,
 * no AWS and no storage — the same discipline V519 used for
 * `cameraPathContainsAll` and V523 for `pickAssignedFace`.
 *
 * Nothing here loosens anything. A registration that cannot name every
 * requested character, or names one twice, or lands on a frame whose raster
 * does not correspond to the plate, fails closed. Anchor geometry stays a
 * hint; it never becomes plate geometry by being multiplied.
 */

import { stripCharacterIdPrefix } from "./v523-identity-repair.ts";

export type Box = [number, number, number, number];

/**
 * Which picture a bounding box was actually measured on.
 *
 * `anchor_native`     measured on the anchor still. Valid as an identity
 *                     seed and as a search hint; NEVER valid as plate
 *                     geometry, however it is scaled.
 * `plate_native`      measured on a frame of the current base video.
 * `registered_plate`  a stored `plate_native` record, re-read and proven
 *                     to belong to this scene/run/generation/video.
 * `positional`        inferred from ordering. Never identity.
 * `unknown`           provenance not established — treated as not proven.
 */
export type PlateGeometrySpace =
  | "anchor_native"
  | "plate_native"
  | "registered_plate"
  | "positional"
  | "unknown";

/** True only for spaces that were measured on the plate itself. */
export function isPlateNativeSpace(space: PlateGeometrySpace | null | undefined): boolean {
  return space === "plate_native" || space === "registered_plate";
}

/**
 * Classify a plate-identity map's own detector/lock provenance.
 *
 * `v278-rekognition-hungarian` routes on `anchorLayout.anchorUrl`, and
 * `aws_rekognition_anchor` is the legacy anchor-first detector — both produce
 * anchor composition expressed in plate units. The Gemini rescue path reads
 * the MP4 at a mid-duration timestamp and is genuinely plate-native.
 */
export function classifyIdentityMapSpace(input: {
  detector?: string | null;
  assignmentLockSource?: string | null;
}): PlateGeometrySpace {
  const d = String(input?.detector ?? "").toLowerCase();
  const l = String(input?.assignmentLockSource ?? "").toLowerCase();
  if (!d && !l) return "unknown";
  if (d.includes("anchor") || l.includes("anchor") || d.includes("hungarian") || l.includes("hungarian")) {
    return "anchor_native";
  }
  if (d.includes("gemini") || d.includes("mp4") || d.includes("plate")) return "plate_native";
  return "unknown";
}

/** One character's face, measured on an actual frame of the current plate. */
export interface PlateNativeIdentityRecord {
  characterId: string;
  /** PLATE pixels, in `plateDims`. */
  bbox: Box;
  frameNumber: number;
  plateDims: { width: number; height: number };
  source: "plate_native";
  identityEvidence: "aws_rekognition_compare_faces";
  similarity: number | null;
  /** Fencing — the exact plate this geometry describes. */
  baseVideoUrl: string;
  sceneId: string;
  runId: string | null;
  plateGeneration: number;
  registeredAt: string;
}

export type RegistrationFailure =
  | "no_characters"
  | "invalid_plate_dims"
  | "frame_extract_failed"
  | "identity_detect_failed"
  | "no_identity_evidence"
  | "incomplete_registration"
  | "ambiguous_identity"
  | "dims_incoherent";

export interface PlateIdentityRegistration {
  ok: boolean;
  reason?: RegistrationFailure;
  records: PlateNativeIdentityRecord[];
  frameNumber: number;
  frameUrl: string | null;
  detail?: string;
  /** Bounded diagnostics. No frames, no tracks, no images. */
  diagnostics: {
    requested: number;
    resolved: number;
    detected: number;
    minSimilarity: number | null;
    detectorDims: { width: number; height: number } | null;
    rescaled: boolean;
  };
}

/**
 * V525 — one bounded row per attempted registration frame.
 *
 * Generation 21 persisted only the LAST attempted frame (30), because the
 * result variable was overwritten on each iteration of the bounded loop. The
 * two earlier attempts, and the reason each failed, were simply gone. At most
 * three rows, each a handful of scalars.
 */
export interface RegistrationAttempt {
  frame: number;
  extract_ok: boolean;
  extract_reason: string | null;
  extract_source: string | null;
  extract_cache_hit: boolean | null;
  registration_ok: boolean;
  registration_reason: string | null;
  registration_detail: string | null;
  resolved: number;
  requested: number;
}

/** V525 — never keep more than the bounded search itself can produce. */
export const MAX_REGISTRATION_ATTEMPTS = 3;
export function boundAttempts(rows: RegistrationAttempt[]): RegistrationAttempt[] {
  return (rows ?? []).slice(0, MAX_REGISTRATION_ATTEMPTS);
}

const isFiniteBox = (b: unknown): b is Box =>
  Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)));

/**
 * V524 — register every requested character's face on ONE actual plate frame.
 *
 * `frameNumber` is chosen by the caller from the frames the pipeline already
 * probes; this module invents no frame authority of its own.
 *
 * Failure is total, never partial: a run that could not place every requested
 * character on the plate has not established where anybody is, and half a
 * registration is exactly the kind of evidence that looks usable and is not.
 */
export async function registerPlateNativeIdentities(params: {
  sceneId: string;
  runId: string | null;
  plateGeneration: number;
  /** The durable base video this geometry must describe. */
  baseVideoUrl: string;
  plateDims: { width: number; height: number };
  /** A frame the pipeline already probes. */
  frameNumber: number;
  registeredAt: string;
  characters: Array<{ characterId: string; portraitUrl: string; speakerIdx: number }>;
  /** Injected: `extractFrameForFaceProbe`. */
  extractFrame: (input: { videoUrl: string; frameNumber: number }) => Promise<{
    ok: boolean;
    frameUrl?: string | null;
    reason?: string | null;
  }>;
  /** Injected: `resolveIdentityViaRekognition`, pointed at the extracted still. */
  detectIdentities: (input: {
    imageUrl: string;
    characters: Array<{ characterId: string; portraitUrl: string; speakerIdx: number }>;
  }) => Promise<{
    ok: boolean;
    dims: { width: number; height: number };
    faces: Array<{ characterId: string | null; bbox: Box; similarity: number | null }>;
    resolvedCount?: number;
    reason?: string | null;
  }>;
}): Promise<PlateIdentityRegistration> {
  const emptyDiag = {
    requested: params.characters?.length ?? 0,
    resolved: 0,
    detected: 0,
    minSimilarity: null as number | null,
    detectorDims: null as { width: number; height: number } | null,
    rescaled: false,
  };
  const fail = (
    reason: RegistrationFailure,
    detail?: string,
    diagnostics = emptyDiag,
    frameUrl: string | null = null,
  ): PlateIdentityRegistration => ({
    ok: false,
    reason,
    records: [],
    frameNumber: params.frameNumber,
    frameUrl,
    detail,
    diagnostics,
  });

  const characters = (params.characters ?? []).filter((c) =>
    !!stripCharacterIdPrefix(c?.characterId) && typeof c?.portraitUrl === "string" && c.portraitUrl.length > 0
  );
  if (characters.length === 0) return fail("no_characters");
  const W = Number(params.plateDims?.width);
  const H = Number(params.plateDims?.height);
  if (!(W > 0) || !(H > 0)) return fail("invalid_plate_dims");

  const extracted = await params.extractFrame({
    videoUrl: params.baseVideoUrl,
    frameNumber: params.frameNumber,
  });
  if (!extracted?.ok || !extracted.frameUrl) {
    return fail("frame_extract_failed", String(extracted?.reason ?? "no frame url"));
  }

  const detected = await params.detectIdentities({
    imageUrl: extracted.frameUrl,
    characters,
  });
  const diag = {
    ...emptyDiag,
    detected: detected?.faces?.length ?? 0,
    detectorDims: detected?.dims ?? null,
  };
  if (!detected?.ok) {
    return fail("identity_detect_failed", String(detected?.reason ?? "detector not ok"), diag, extracted.frameUrl);
  }

  // ── Raster coherence ────────────────────────────────────────────────
  //
  // The still is the SAME picture as the plate, possibly written at a
  // different raster size. Rescaling that is a unit conversion, not a change
  // of subject — which is exactly what anchor→plate was not. It is allowed
  // only while the aspect ratios agree; anything else means the still does
  // not depict this plate, and guessing a mapping is how generation 20
  // happened.
  const dw = Number(detected.dims?.width);
  const dh = Number(detected.dims?.height);
  if (!(dw > 0) || !(dh > 0)) {
    return fail("dims_incoherent", "detector reported no dimensions", diag, extracted.frameUrl);
  }
  const aspectDrift = Math.abs((dw / dh) - (W / H)) / (W / H);
  if (aspectDrift > 0.01) {
    return fail(
      "dims_incoherent",
      `still=${dw}x${dh} plate=${W}x${H} aspect_drift=${aspectDrift.toFixed(4)}`,
      diag,
      extracted.frameUrl,
    );
  }
  const sx = W / dw;
  const sy = H / dh;
  const rescaled = dw !== W || dh !== H;

  // ── Identity → geometry, keyed by characterId only ──────────────────
  const byChar = new Map<string, { bbox: Box; similarity: number | null }>();
  const duplicates: string[] = [];
  let minSimilarity: number | null = null;
  for (const f of detected.faces ?? []) {
    const cid = stripCharacterIdPrefix(f?.characterId);
    if (!cid) continue;
    if (!isFiniteBox(f?.bbox)) continue;
    const b = f.bbox.map(Number) as Box;
    if (!(b[2] > b[0]) || !(b[3] > b[1])) continue;
    if (byChar.has(cid)) {
      duplicates.push(cid);
      continue;
    }
    byChar.set(cid, {
      bbox: [
        Math.round(b[0] * sx),
        Math.round(b[1] * sy),
        Math.round(b[2] * sx),
        Math.round(b[3] * sy),
      ],
      similarity: Number.isFinite(Number(f?.similarity)) ? Number(f.similarity) : null,
    });
    if (f?.similarity != null && Number.isFinite(Number(f.similarity))) {
      const s = Number(f.similarity);
      minSimilarity = minSimilarity === null ? s : Math.min(minSimilarity, s);
    }
  }
  diag.resolved = byChar.size;
  diag.minSimilarity = minSimilarity;
  diag.rescaled = rescaled;

  if (duplicates.length > 0) {
    return fail(
      "ambiguous_identity",
      `two plate faces claim ${duplicates.join(",")}`,
      diag,
      extracted.frameUrl,
    );
  }
  if (byChar.size === 0) {
    return fail("no_identity_evidence", "no face carried a characterId", diag, extracted.frameUrl);
  }

  const records: PlateNativeIdentityRecord[] = [];
  const missing: string[] = [];
  for (const c of characters) {
    const cid = stripCharacterIdPrefix(c.characterId);
    const hit = byChar.get(cid);
    if (!hit) {
      missing.push(cid);
      continue;
    }
    records.push({
      characterId: cid,
      bbox: hit.bbox,
      frameNumber: params.frameNumber,
      plateDims: { width: W, height: H },
      source: "plate_native",
      identityEvidence: "aws_rekognition_compare_faces",
      similarity: hit.similarity,
      baseVideoUrl: params.baseVideoUrl,
      sceneId: params.sceneId,
      runId: params.runId,
      plateGeneration: params.plateGeneration,
      registeredAt: params.registeredAt,
    });
  }
  if (missing.length > 0) {
    return fail(
      "incomplete_registration",
      `unresolved on the plate: ${missing.join(",")}`,
      diag,
      extracted.frameUrl,
    );
  }

  return {
    ok: true,
    records,
    frameNumber: params.frameNumber,
    frameUrl: extracted.frameUrl,
    diagnostics: diag,
  };
}

/**
 * V524 — is a stored registration still about THIS plate?
 *
 * Generation 19's geometry is not generation 20's, and a record that survives
 * a rerender is a stale measurement wearing a fresh label. Every fence must
 * match exactly; a missing value is a mismatch, not a wildcard.
 */
export interface PlateNativeFence {
  sceneId: string;
  runId: string | null;
  plateGeneration: number;
  baseVideoUrl: string;
  /**
   * V524-P0 — the raster the geometry is expressed in. A record measured
   * against 720x1280 says nothing about a 1080x1920 dispatch, and reusing
   * it would reintroduce a space error through the cache door.
   */
  plateDims: { width: number; height: number };
}

export function isPlateNativeRegistrationFresh(
  record: Partial<PlateNativeIdentityRecord> | null | undefined,
  current: PlateNativeFence,
): boolean {
  if (!record) return false;
  if (record.source !== "plate_native") return false;
  if (!isFiniteBox(record.bbox)) return false;
  if (String(record.sceneId ?? "") !== String(current.sceneId ?? "")) return false;
  if (String(record.baseVideoUrl ?? "") !== String(current.baseVideoUrl ?? "")) return false;
  if (Number(record.plateGeneration) !== Number(current.plateGeneration)) return false;
  if (
    Number(record.plateDims?.width) !== Number(current.plateDims?.width) ||
    Number(record.plateDims?.height) !== Number(current.plateDims?.height)
  ) return false;
  // A run id is part of the fence whenever the current dispatch has one.
  if (current.runId && String(record.runId ?? "") !== String(current.runId)) return false;
  return true;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V524-P0 — IS A STORED REGISTRATION USABLE AS-IS?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Registration costs a frame extract, a DetectFaces and one CompareFaces
 * per character. Repeating that on every re-dispatch of the same run,
 * against the same base video, at the same generation, buys nothing: the
 * picture has not changed, so neither has the answer.
 *
 * A hit requires ALL of it: the stored attempt succeeded, every requested
 * character has exactly one record, and every record passes the same fence
 * a fresh one would. A failed, partial or ambiguous attempt is never a hit —
 * caching a refusal as an answer is how a fail-closed gate quietly stops
 * being one.
 */
export interface StoredPlateNativeRegistration {
  ok?: boolean;
  records?: Array<Partial<PlateNativeIdentityRecord>> | null;
  frame_number?: number | null;
}

export interface RegistrationReuse {
  hit: boolean;
  records: PlateNativeIdentityRecord[];
  frameNumber: number | null;
  /** Why it was not a hit. `null` when it was. */
  miss:
    | null
    | "no_stored_registration"
    | "stored_registration_failed"
    | "stored_registration_incomplete"
    | "stored_registration_stale";
}

export function reuseStoredRegistration(params: {
  stored: StoredPlateNativeRegistration | null | undefined;
  characterIds: Array<string | null | undefined>;
  fence: PlateNativeFence;
}): RegistrationReuse {
  const miss = (m: RegistrationReuse["miss"]): RegistrationReuse => ({
    hit: false,
    records: [],
    frameNumber: null,
    miss: m,
  });
  const stored = params.stored;
  if (!stored || !Array.isArray(stored.records) || stored.records.length === 0) {
    return miss("no_stored_registration");
  }
  if (stored.ok !== true) return miss("stored_registration_failed");

  const wanted = (params.characterIds ?? [])
    .map((c) => stripCharacterIdPrefix(c))
    .filter((c) => !!c);
  if (wanted.length === 0) return miss("stored_registration_incomplete");

  const out: PlateNativeIdentityRecord[] = [];
  for (const cid of wanted) {
    const hit = findPlateNativeRecord(stored.records, cid, params.fence);
    if (!hit) {
      // Distinguish "this character is absent" from "the whole set belongs
      // to another plate", so the log names the real reason.
      const present = (stored.records ?? []).some((r) =>
        stripCharacterIdPrefix(r?.characterId) === cid
      );
      return miss(present ? "stored_registration_stale" : "stored_registration_incomplete");
    }
    out.push(hit);
  }
  return {
    hit: true,
    records: out,
    frameNumber: Number.isFinite(Number(stored.frame_number))
      ? Number(stored.frame_number)
      : (out[0]?.frameNumber ?? null),
    miss: null,
  };
}

/** V524 — the stored record for one character, by characterId only. */
export function findPlateNativeRecord(
  records: Array<Partial<PlateNativeIdentityRecord>> | null | undefined,
  characterId: string | null | undefined,
  current: PlateNativeFence,
): PlateNativeIdentityRecord | null {
  const want = stripCharacterIdPrefix(characterId);
  if (!want) return null;
  const hits = (records ?? []).filter((r) =>
    stripCharacterIdPrefix(r?.characterId) === want && isPlateNativeRegistrationFresh(r, current)
  );
  // Two records for one character is not a tie to break.
  if (hits.length !== 1) return null;
  return hits[0] as PlateNativeIdentityRecord;
}
