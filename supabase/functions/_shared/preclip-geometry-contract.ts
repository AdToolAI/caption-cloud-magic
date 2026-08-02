/**
 * preclip-geometry-contract.ts — v396 Orchestrierung von T8–T10
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Der Autoritätsvertrag in einer Datei:
 *
 *   Anchor-Geometrie   → Seed: Identität und grober Suchbereich
 *   Plate-Geometrie    → plant den Crop
 *   Preclip-Geometrie  → bestimmt den Provider-Payload
 *
 * Belegter Fehlerfall (Szene 9eded574, Pass 3): die Transformation war
 * algebraisch korrekt, transformierte aber VERALTETE Ausgangskoordinaten
 * aus der Anchor-Face-Map.
 *
 *   geplantes Gesichtszentrum  [1110.5, 437]
 *   gemessenes Gesichtszentrum [1167,   470]     Δ [+56.5, +33]
 *   geplanter Mund             [1111, 465]
 *   gemessener Mund            [1184, 518]       Δ [+73, +53]
 *
 * 57 Plate-Pixel entsprechen ca. 41 Anchor-Pixeln — das ist kein
 * Skalierungsrauschen. Eine Anchor-Bbox ist schlicht keine Positionsmessung
 * im generierten Video. Deshalb heisst dieser Fehler ab v396
 * `source_geometry_drift` und nicht mehr `mouth_at_edge`.
 */

import { checkPreclipFrame, frameSpaceRecord, plateFrame, preclipFrame, type FrameSpaceRecord } from "./frame-space.ts";
import {
  assertRoundtrip,
  buildPreclipTransform,
  geometryFingerprint,
  persistTransform,
  plateToPreclip,
  ROUNDTRIP_TOLERANCE_PX,
  type PersistedTransform,
  type PlateCropRect,
} from "./preclip-transform.ts";
import { bindPreclipIdentity, type IdentityBinding, type IdentityCandidate } from "./preclip-identity-binding.ts";
import {
  DRIFT_SIGNIFICANT_PX,
  measureGeometryDrift,
  preclipRectToPlate,
  recropToSafeRegion,
  stableAnchor,
  type DriftSample,
  type Rect,
  type StableFeatures,
} from "./preclip-safe-region.ts";

export const GEOMETRY_CONTRACT_VERSION = "v396-authority-contract";

/**
 * `mouth_at_edge` warf bisher völlig verschiedene Ursachen in einen
 * einzigen terminalen Fehler. Ab v396 sind sie getrennt — nur
 * `crop_not_viable` heisst wirklich "die richtige Person, im richtigen
 * Frame, bei korrekter Transformation, liegt am Rand".
 */
export type GeometryVerdictCode =
  | "ok"
  | "recrop_required"
  | "frame_mapping_failed"
  | "transform_contract_failed"
  | "face_not_detected"
  | "identity_ambiguous"
  | "wrong_identity"
  | "identity_reference_missing"
  | "source_geometry_drift"
  | "crop_not_viable";

/** Verdicts, die einen einmaligen Korrekturversuch erlauben statt terminal zu sein. */
export const RECOVERABLE_VERDICTS: ReadonlySet<GeometryVerdictCode> = new Set([
  "recrop_required",
  "source_geometry_drift",
]);

export interface PreclipObservation {
  /** Lokaler Preclip-Frameindex. */
  preclipFrame: number;
  faces: Array<{
    bbox: Rect;
    center: readonly [number, number];
    features: StableFeatures;
    mouth?: readonly [number, number];
  }>;
  /** Identitätskandidaten für genau diesen Frame. */
  candidates: readonly IdentityCandidate[];
}

export interface GeometryContractInput {
  crop: PlateCropRect;
  plateWidth: number;
  plateHeight: number;
  /** Real dekodierte Framezahl des ENCODIERTEN Preclips (ffprobe). */
  decodedFrameCount: number;
  /** Plate-Frame, an dem der Preclip beginnt. */
  preclipStartPlateFrame: number;
  fps: number;
  /** Geplante Gesichtsposition in PLATE-Pixeln (aus der Crop-Planung). */
  plannedFaceCenterPlate: readonly [number, number];
  /** Geplantes Mundfenster in PLATE-Pixeln. */
  plannedMouthRectPlate?: Rect;
  expectedCharacterId: string;
  referenceAssetId: string | null;
  observations: readonly PreclipObservation[];
  neighbourFacesPlate?: readonly Rect[];
  /** Bereits einmal recroppt? Dann ist ein weiterer Drift terminal. */
  recropAlreadyAttempted?: boolean;
}

export interface GeometryContractResult {
  ok: boolean;
  code: GeometryVerdictCode;
  reason?: string;
  version: string;
  identity: IdentityBinding | null;
  drift: ReturnType<typeof measureGeometryDrift> | null;
  transform: PersistedTransform;
  frames: FrameSpaceRecord[];
  roundtripMaxErrorPx: number | null;
  /** Bei `recrop_required`: der korrigierte Crop, genau ein Versuch. */
  suggestedCrop?: PlateCropRect;
  forensics: Record<string, unknown>;
}

export function evaluatePreclipGeometry(input: GeometryContractInput): GeometryContractResult {
  const transform = buildPreclipTransform(input.crop);
  const persisted = persistTransform(transform);

  const fail = (
    code: GeometryVerdictCode,
    reason: string,
    extra: Partial<GeometryContractResult> = {},
  ): GeometryContractResult => ({
    ok: false,
    code,
    reason,
    version: GEOMETRY_CONTRACT_VERSION,
    identity: null,
    drift: null,
    transform: persisted,
    frames: [],
    roundtripMaxErrorPx: null,
    forensics: { crop: input.crop, fingerprint: geometryFingerprint(transform) },
    ...extra,
  });

  // ── 1) Frame-Räume ──────────────────────────────────────────────────
  const frames: FrameSpaceRecord[] = [];
  for (const obs of input.observations) {
    const checked = checkPreclipFrame(obs.preclipFrame, input.decodedFrameCount);
    if (!checked.ok) return fail("frame_mapping_failed", checked.reason);
    frames.push(
      frameSpaceRecord({
        preclip: checked.frame,
        preclipStartPlateFrame: plateFrame(input.preclipStartPlateFrame),
        decodedFrameCount: input.decodedFrameCount,
        fps: input.fps,
      }),
    );
  }
  if (frames.length === 0) {
    return fail("face_not_detected", "no preclip frames were probed");
  }

  // ── 2) Geometrievertrag: Roundtrip (notwendig, nicht hinreichend) ────
  const corners: Array<readonly [number, number]> = [
    [input.crop.x, input.crop.y],
    [input.crop.x + input.crop.size, input.crop.y],
    [input.crop.x, input.crop.y + input.crop.size],
    [input.crop.x + input.crop.size, input.crop.y + input.crop.size],
    input.plannedFaceCenterPlate,
  ];
  const roundtrip = assertRoundtrip(transform, corners, ROUNDTRIP_TOLERANCE_PX);
  if (!roundtrip.ok) {
    return fail(
      "transform_contract_failed",
      `roundtrip error ${roundtrip.maxErrorPx.toFixed(3)}px exceeds ${ROUNDTRIP_TOLERANCE_PX}px — internal geometry bug, not a provider or content problem`,
      { roundtripMaxErrorPx: roundtrip.maxErrorPx },
    );
  }

  // ── 3) Identität ────────────────────────────────────────────────────
  // Über mehrere Frames aggregiert taucht dieselbe Person mehrfach auf. Die
  // Margin muss aber zwischen VERSCHIEDENEN Identitäten gemessen werden —
  // sonst wäre jeder Mehrfachframe automatisch "ambiguous". Pro Identität
  // zählt daher der beste Frame; Kandidaten ohne Identität bleiben einzeln,
  // weil sie echte Konkurrenten sein können.
  const bestPerIdentity = new Map<string, IdentityCandidate>();
  const anonymous: IdentityCandidate[] = [];
  for (const c of input.observations.flatMap((o) => [...o.candidates])) {
    if (!c.characterId) {
      anonymous.push(c);
      continue;
    }
    const prior = bestPerIdentity.get(c.characterId);
    if (!prior || c.score > prior.score) bestPerIdentity.set(c.characterId, c);
  }
  const allCandidates: IdentityCandidate[] = [...bestPerIdentity.values(), ...anonymous];
  const identity = bindPreclipIdentity({
    expectedCharacterId: input.expectedCharacterId,
    referenceAssetId: input.referenceAssetId,
    candidates: allCandidates,
  });

  if (!identity.ok) {
    return fail(identity.code as GeometryVerdictCode, identity.reason ?? identity.code, {
      identity,
      roundtripMaxErrorPx: roundtrip.maxErrorPx,
      frames,
    });
  }

  // ── 4) Drift über STABILE Merkmale, nie über den Mund ───────────────
  const projectedFaceCenter = plateToPreclip(transform, input.plannedFaceCenterPlate);
  const samples: DriftSample[] = [];
  for (const obs of input.observations) {
    const face = obs.faces[identity.faceIndex ?? 0] ?? obs.faces[0];
    if (!face) continue;
    samples.push({
      preclipFrame: obs.preclipFrame,
      projected: projectedFaceCenter,
      observed: stableAnchor(face.features),
    });
  }
  const drift = measureGeometryDrift(samples);

  const base = {
    version: GEOMETRY_CONTRACT_VERSION,
    identity,
    drift,
    transform: persisted,
    frames,
    roundtripMaxErrorPx: roundtrip.maxErrorPx,
    forensics: {
      crop: input.crop,
      fingerprint: geometryFingerprint(transform),
      projected_face_center_preclip: projectedFaceCenter,
      planned_face_center_plate: input.plannedFaceCenterPlate,
      drift_vector_preclip: drift.vector,
      drift_spread_px: drift.spreadPx,
      identity_score: identity.identity_score,
      identity_margin: identity.identity_margin,
      frame_records: frames,
    },
  };

  if (drift.magnitudePx >= DRIFT_SIGNIFICANT_PX && !drift.consistent) {
    // Fehlervektor schwankt stark über die Frames — hier darf NICHT blind
    // recroppt werden. Ursache ist dann ein zeitlicher Indexfehler oder ein
    // instabiler Track, kein konstanter Versatz.
    return {
      ...base,
      ok: false,
      code: "source_geometry_drift",
      reason:
        `geometry drift ${drift.magnitudePx.toFixed(1)}px with spread ${drift.spreadPx.toFixed(1)}px is not constant ` +
        `across ${drift.sampleCount} frames — refusing a blind recrop`,
    };
  }

  // ── 5) Safe-Region und minimaler Recrop ─────────────────────────────
  const observedFace = input.observations[0].faces[identity.faceIndex ?? 0] ?? input.observations[0].faces[0];
  const faceBoxPlate = preclipRectToPlate(input.crop, observedFace.bbox);
  const mouthPreclip = observedFace.mouth ?? [
    (observedFace.bbox[0] + observedFace.bbox[2]) / 2,
    observedFace.bbox[1] + (observedFace.bbox[3] - observedFace.bbox[1]) * 0.72,
  ];
  const faceWidthPreclip = Math.max(1, observedFace.bbox[2] - observedFace.bbox[0]);
  const halfMouth = Math.max(8, faceWidthPreclip * 0.28);
  const mouthRectPlate = preclipRectToPlate(input.crop, [
    mouthPreclip[0] - halfMouth,
    mouthPreclip[1] - halfMouth * 0.7,
    mouthPreclip[0] + halfMouth,
    mouthPreclip[1] + halfMouth * 0.7,
  ]);

  const recrop = recropToSafeRegion({
    crop: input.crop,
    plateWidth: input.plateWidth,
    plateHeight: input.plateHeight,
    faceBoxPlate,
    mouthRectPlate,
    neighbourFacesPlate: input.neighbourFacesPlate,
  });

  if (recrop.code === "already_viable") {
    return { ...base, ok: true, code: "ok" };
  }

  if (recrop.code === "crop_not_viable") {
    return { ...base, ok: false, code: "crop_not_viable", reason: recrop.reason };
  }

  if (input.recropAlreadyAttempted) {
    return {
      ...base,
      ok: false,
      code: "crop_not_viable",
      reason: `a corrected crop was already attempted and the mouth is still outside the safe region (${recrop.violations.join(", ") || "unstable"})`,
    };
  }

  return {
    ...base,
    ok: false,
    code: "recrop_required",
    reason:
      `source_geometry_drift of ${drift.magnitudePx.toFixed(1)}px moved the mouth out of the safe region — ` +
      `one deterministic recrop by [${recrop.shiftPx[0]}, ${recrop.shiftPx[1]}]px (growth ${recrop.grewBy.toFixed(2)}x)`,
    suggestedCrop: recrop.crop,
  };
}

/** Nur für Symmetrie beim Import — hält `preclipFrame` im Modulgraphen. */
export { preclipFrame };
