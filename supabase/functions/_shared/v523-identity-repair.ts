/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V523 — IDENTITY-LOCKED FACE REPAIR AUTHORITY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 19, Sarah pass 1. The scene terminalized on
 * `no_coherent_track_samples`: V520 evaluated six track samples and accepted
 * none — four scale-incoherent, two invalid boxes — and V516 reported the
 * tracked mouth at ~[188,466] while Sarah's assignment-locked face was
 * [108,280,178,386]. Both gates were right. They were describing a region
 * that is not Sarah.
 *
 * The region came from upstream. The v96 face-gate repair picked its face
 * like this:
 *
 *     faces.filter(big enough).sort(x ascending)[pass.speaker_idx]
 *
 * That is positional slot inference, not identity. In a four-person shot the
 * left-to-right ordinal is a property of where people are standing at frame
 * 202, not of who they are — and Sarah's repair moved her locked centre
 * [143,333] to [91,471], 52 px left and 138 px down, onto a face nobody
 * proved was hers. The tracker then followed that region, and every gate
 * downstream correctly refused what it found.
 *
 * So the repair is bound to identity here, and refuses when identity cannot
 * be proven:
 *
 *   1. resolve the requested speaker's LOCKED reference by characterId
 *   2. hand the repair-frame candidates to the SAME continuation rule the
 *      turn tracker already uses (`pickAssignedFace`, injected)
 *   3. no proof → no repair
 *
 * Nothing new is invented. `pickAssignedFace` already carries the IoU floor,
 * the centre-drift limit, the sibling veto and the ambiguity refusal, all
 * with thresholds that have been in production since V456. This module adds
 * no threshold of its own: every number it relies on lives in
 * `plate-face-track.ts`, and the picker is injected rather than imported so
 * this stays a leaf module with one continuation model, exactly as V519 did
 * with `cameraPathContainsAll`.
 */

/**
 * V524 — the geometry-space vocabulary lives with the registration module,
 * imported rather than restated so there is one classification of what a
 * box is a measurement OF.
 */
import type { PlateGeometrySpace } from "./v524-plate-identity-registration.ts";
export type { PlateGeometrySpace };

export type Box = [number, number, number, number];

/** A plate-identity face record. `characterId` is the only identity key. */
export interface IdentityFaceRecord {
  characterId?: string | null;
  bbox?: unknown;
  mouth?: unknown;
}

export type IdentityReferenceFailure =
  /** No characterId at all — neither the lock nor the speaker carries one. */
  | "no_character_id"
  /** The lock and the speaker name different characters for this slot. */
  | "identity_lock_conflict"
  /** More than one plate face claims this characterId. */
  | "identity_lock_ambiguous"
  /** A reference exists but only from positional inference. */
  | "reference_not_identity_locked"
  /**
   * V524 — a reference exists and is identity-bound, but its geometry was
   * measured on the ANCHOR. Scaling it into plate units does not make it
   * describe the plate. Distinct from `reference_not_identity_locked`
   * (identity missing) and from `identity_unresolved` (identity fine,
   * no candidate matched): here the reference is about another picture.
   */
  | "reference_space_mismatch";

export interface IdentityReference {
  ok: boolean;
  reason?: IdentityReferenceFailure;
  characterId?: string | null;
  bbox?: Box;
  mouth?: [number, number] | null;
  /**
   * `plate_native`       V524 — measured on an actual frame of the current
   *                      base video and identity-matched biometrically.
   *                      The only geometry that describes what will be
   *                      dispatched.
   * `lock_face`          resolved from plate faces BY characterId.
   * `hydrated_identity`  the per-speaker box, but only while its own
   *                      provenance says it came from the lock or a
   *                      characterId match.
   */
  source?: "plate_native" | "lock_face" | "hydrated_identity";
  /** V524 — which picture the geometry was measured on. */
  space?: PlateGeometrySpace;
  detail?: string;
}

export type RepairFailure =
  | "no_candidates"
  | "identity_unresolved"
  /** Another locked cast member could claim the same face. */
  | "identity_contested";

export interface IdentityRepairResult {
  ok: boolean;
  reason?: RepairFailure;
  bbox?: Box;
  mouth?: [number, number] | null;
  iou?: number;
  /** How many repair-frame candidates were offered to the picker. */
  candidatesConsidered: number;
  /**
   * TELEMETRY ONLY — which candidate the old left-to-right rule would have
   * chosen, so a future incident can see the two answers side by side. It
   * decides nothing.
   */
  positionalWouldHavePicked?: Box | null;
  detail?: string;
}

/**
 * The ONE character-id normalisation. Wardrobe/pose variants of the same
 * character share an identity; the prefix is presentation, not identity.
 *
 * (`compose-dialog-segments` still carries two local copies of this same
 * expression, in the persisted-hydration and assignment-lock blocks. They
 * are outside this repair chain and are reported rather than refactored.)
 */
export function stripCharacterIdPrefix(id?: string | null): string {
  return String(id ?? "")
    .toLowerCase()
    .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
}

const isFiniteBox = (b: unknown): b is Box =>
  Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(Number(n)));

const asBox = (b: unknown): Box | null =>
  isFiniteBox(b) ? [Number(b[0]), Number(b[1]), Number(b[2]), Number(b[3])] : null;

const asPoint = (p: unknown): [number, number] | null =>
  Array.isArray(p) && p.length === 2 &&
    Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
    ? [Number(p[0]), Number(p[1])]
    : null;

export const centerOfBox = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/**
 * V523 — the characterId accessor. Array position is NEVER identity.
 *
 * `plate_identity.faces[]` is detector-ordered, `bboxes[]` and
 * `assignmentLock` are speaker-indexed, and nothing guarantees the three
 * agree. Sarah's slot 0 happened to line up in generation 19; that is a
 * coincidence, not a contract. So faces are found by the only key that
 * carries identity, and a duplicate claim is an ambiguity, not a race to
 * `find()`.
 */
export function findFacesByCharacterId(
  faces: IdentityFaceRecord[] | null | undefined,
  characterId: string | null | undefined,
): IdentityFaceRecord[] {
  const want = stripCharacterIdPrefix(characterId);
  if (!want) return [];
  return (faces ?? []).filter((f) => stripCharacterIdPrefix(f?.characterId) === want);
}

/**
 * True when a per-speaker box's own provenance says a characterId decided it.
 *
 * The hydration writes `plate-persisted-lock`, `plate-persisted-cid`,
 * `plate-persisted-mouth-lock`, `plate-identity-cid…` for identity matches
 * and `…-positional` for the legacy positional fallback. A positional box is
 * the very thing this release refuses to treat as authority.
 */
export function isIdentityDerivedSource(source: string | null | undefined): boolean {
  const s = String(source ?? "");
  if (!s) return false;
  if (/positional/i.test(s)) return false;
  return /(^|[-_])(lock|cid)($|[-_])/i.test(s) || /identity-cid/i.test(s);
}

/**
 * V523 — resolve the LOCKED reference face for one requested speaker.
 *
 * Order of authority:
 *   1. the assignment lock's characterId for this slot, cross-checked
 *      against the speaker's own characterId;
 *   2. that characterId looked up in the plate faces;
 *   3. failing that, the already-hydrated per-speaker box — but ONLY while
 *      its provenance says a characterId produced it.
 *
 * There is no fourth step. A positional box, a missing characterId or two
 * faces claiming the same character all end here, refused.
 */
export function resolveLockedIdentityReference(params: {
  speakerIdx: number;
  /** `speakerIdx (string) → characterId`, the v242/v277 assignment lock. */
  assignmentLock?: Record<string, string> | null;
  /** The speaker's own characterId from the cast. */
  speakerCharacterId?: string | null;
  /** `plate_identity.faces[]` — detector-ordered, identity-keyed. */
  plateFaces?: IdentityFaceRecord[] | null;
  /** The per-speaker hydrated box for this slot, plate pixels. */
  hydratedBbox?: unknown;
  /** The per-speaker hydrated mouth for this slot, plate pixels. */
  hydratedMouth?: unknown;
  /** `coordSources[speakerIdx]` — the provenance of `hydratedBbox`. */
  hydratedSource?: string | null;
  /**
   * V524 — this character's face as measured on the current plate. When
   * present it outranks everything below: it is the only reference that
   * describes the video the repair candidates came from.
   */
  plateNativeBbox?: unknown;
  plateNativeMouth?: unknown;
  /**
   * V524 — which picture `plateFaces` / `hydratedBbox` were measured on.
   * `anchor_native` means they are a different composition wearing plate
   * units, and no amount of scaling repairs that.
   */
  referenceSpace?: PlateGeometrySpace;
}): IdentityReference {
  const lockedCid = stripCharacterIdPrefix(
    params.assignmentLock?.[String(params.speakerIdx)] ?? null,
  );
  const speakerCid = stripCharacterIdPrefix(params.speakerCharacterId);

  // A lock that names a different character than the cast slot is not a
  // stronger authority — it is a contradiction, and guessing which side is
  // right is how a voice ends up on the wrong face.
  if (lockedCid && speakerCid && lockedCid !== speakerCid) {
    return {
      ok: false,
      reason: "identity_lock_conflict",
      detail: `lock=${lockedCid} speaker=${speakerCid}`,
    };
  }
  const characterId = lockedCid || speakerCid;
  if (!characterId) return { ok: false, reason: "no_character_id" };

  // ══ V524 — PLATE-NATIVE GEOMETRY OUTRANKS EVERYTHING ═══════════════
  //
  // Generation 20: the reference was [269,84,343,204] and Sarah's actual
  // face on the probed frame was [87,192,275,378] — 188 px apart, IoU
  // 0.002, width 74 against 188. The identity was right and the picture
  // was wrong, and no continuation rule can bridge that.
  const plateNative = asBox(params.plateNativeBbox);
  if (plateNative) {
    return {
      ok: true,
      characterId,
      bbox: plateNative,
      mouth: asPoint(params.plateNativeMouth),
      source: "plate_native",
      space: "plate_native",
    };
  }
  // No plate-native record, and what we do have was measured on the
  // anchor. Refusing here is the point of this release: the alternative
  // is a confident answer about a picture nobody rendered.
  if (params.referenceSpace === "anchor_native") {
    return {
      ok: false,
      reason: "reference_space_mismatch",
      characterId,
      space: "anchor_native",
      detail: "identity is anchor-native; no plate-native registration for this generation",
    };
  }

  const claimed = findFacesByCharacterId(params.plateFaces, characterId)
    .filter((f) => !!asBox(f?.bbox));
  if (claimed.length > 1) {
    return {
      ok: false,
      reason: "identity_lock_ambiguous",
      characterId,
      detail: `${claimed.length} plate faces claim ${characterId}`,
    };
  }
  if (claimed.length === 1) {
    return {
      ok: true,
      characterId,
      bbox: asBox(claimed[0].bbox)!,
      mouth: asPoint(claimed[0].mouth),
      source: "lock_face",
      space: params.referenceSpace ?? "unknown",
    };
  }

  const hydrated = asBox(params.hydratedBbox);
  if (hydrated && isIdentityDerivedSource(params.hydratedSource)) {
    return {
      ok: true,
      characterId,
      bbox: hydrated,
      mouth: asPoint(params.hydratedMouth),
      source: "hydrated_identity",
      space: params.referenceSpace ?? "unknown",
    };
  }
  return {
    ok: false,
    reason: "reference_not_identity_locked",
    characterId,
    detail: hydrated
      ? `hydrated box present but source=${params.hydratedSource ?? "unknown"}`
      : "no identity-derived reference for this character",
  };
}

/**
 * V523 — the identity-bound repair.
 *
 * `pick` is `pickAssignedFace` from `plate-face-track.ts`, injected so this
 * module stays a leaf and there is exactly ONE continuation rule in the
 * codebase. It already refuses a candidate that is too far from the
 * reference, vetoes one that sits nearer another cast member's locked
 * centre, and returns null when two candidates are equally plausible. Every
 * threshold it uses is its own; V523 adds none.
 *
 * `null` from the picker is the answer, not a prompt to look further.
 */
export function resolveIdentityLockedRepair(params: {
  reference: IdentityReference;
  /** Repair-frame candidates in PLATE pixels. */
  candidates: Array<{ bbox: Box; mouth: [number, number] | null }>;
  /** Locked centres of the OTHER cast members, plate pixels. */
  siblingCenters: Array<[number, number]>;
  /**
   * Locked BOXES of the other cast members, plate pixels — the same
   * references, kept whole for the exclusivity check below.
   *
   * REQUIRED. A caller that omits them silently loses the exclusivity
   * guarantee, and a silently weaker identity check is the whole subject of
   * this release.
   */
  siblingReferences: Box[];
  pick: (
    candidates: Array<{ bbox: Box; mouth: [number, number] | null }>,
    reference: Box,
    siblingCenters: Array<[number, number]>,
    referenceMouth?: [number, number] | null,
  ) => { bbox: Box; mouth: [number, number] | null; iou: number } | null;
  /** TELEMETRY ONLY — the slot the retired left-to-right rule would use. */
  positionalSlot?: number | null;
}): IdentityRepairResult {
  const candidates = (params.candidates ?? []).filter((c) => !!asBox(c?.bbox));
  // Recorded, never consulted. Kept so the next incident can compare the
  // answer this release gives with the one it replaced.
  const positional = Number.isFinite(Number(params.positionalSlot))
    ? [...candidates].sort((a, b) => a.bbox[0] - b.bbox[0])[Number(params.positionalSlot)]?.bbox ?? null
    : null;

  if (!params.reference?.ok || !params.reference.bbox) {
    return {
      ok: false,
      reason: "identity_unresolved",
      candidatesConsidered: candidates.length,
      positionalWouldHavePicked: positional,
      detail: `reference:${params.reference?.reason ?? "missing"}`,
    };
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "no_candidates",
      candidatesConsidered: 0,
      positionalWouldHavePicked: null,
    };
  }

  const picked = params.pick(
    candidates,
    params.reference.bbox,
    params.siblingCenters ?? [],
    params.reference.mouth ?? null,
  );
  if (!picked) {
    return {
      ok: false,
      reason: "identity_unresolved",
      candidatesConsidered: candidates.length,
      positionalWouldHavePicked: positional,
      detail: "no candidate is a provable continuation of the locked face",
    };
  }
  // ══ EXCLUSIVITY — A FACE MAY BELONG TO ONLY ONE CHARACTER ══════════
  //
  // The picker answers "is this a plausible continuation of MY reference"
  // from one side only, and a stale reference cannot survive a crossing:
  // when two cast members trade places, each one's locked box is a better
  // match for the OTHER's current face, and the picker says yes to both
  // with no ambiguity to catch it. That is the generation-19 failure mode
  // dressed in geometry instead of an ordinal.
  //
  // So the same question is asked from every other locked reference, using
  // the SAME picker with no sibling list — which reduces it to exactly the
  // acceptance gate `pickAssignedFace` already applies. If any other
  // character could also claim this face, nobody can: the evidence at a
  // repair frame is anonymous geometry, and geometry cannot break a tie
  // it created. Fail closed.
  //
  // No new threshold: the reused call carries `TRACK_MIN_IOU` and
  // `TRACK_MAX_CENTER_DRIFT` from `plate-face-track.ts`, unchanged.
  const contender = (params.siblingReferences ?? []).find((ref) =>
    isFiniteBox(ref) && !!params.pick([{ bbox: picked.bbox, mouth: picked.mouth }], ref, [])
  );
  if (contender) {
    return {
      ok: false,
      reason: "identity_contested",
      candidatesConsidered: candidates.length,
      positionalWouldHavePicked: positional,
      detail: `face=[${picked.bbox.join(",")}] also claimable by locked [${contender.join(",")}]`,
    };
  }

  return {
    ok: true,
    bbox: picked.bbox,
    mouth: picked.mouth,
    iou: picked.iou,
    candidatesConsidered: candidates.length,
    positionalWouldHavePicked: positional,
  };
}
