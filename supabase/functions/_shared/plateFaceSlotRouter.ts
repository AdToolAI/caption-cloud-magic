/**
 * plateFaceSlotRouter.ts (v278)
 *
 * Deterministic speaker ↔ face routing on the rendered plate WITHOUT
 * biometric comparison. Uses the anchor face layout (positions + known
 * characterIds from v274) as ground truth, detects faces on the plate,
 * and matches plate faces to anchor faces via minimum-distance Hungarian
 * assignment (bijective).
 *
 * Why this eliminates the duplicate-face / silent-speaker bugs
 * ------------------------------------------------------------
 *  - No CompareFaces threshold to trip on profile / task-occluded shots.
 *  - Bijection → the same face cannot be assigned to two speakers.
 *  - Tasks that move characters around (phone, printer, laptop) shift
 *    positions but preserve relative ordering; Hungarian on 2-D distance
 *    tolerates ~30–40% displacement of plate width.
 *
 * NOTE: SigV4 signer is duplicated from resolveIdentityViaRekognition.ts
 * on purpose — that file explicitly wants to stay standalone. Keeping this
 * one standalone as well simplifies auditing.
 */

// FA-4 Face-Candidate Fix — Contract A (sanity before assignment) and
// Contract B (global bijective geometry assignment) live in a pure module.
import {
  assignAnchorsToCandidatesBijective,
  classifyRouterFailure,
  FACE_SIZE_REJECTIONS,
  filterPlausibleCandidates,
  PLATE_FACE_SANITY,
  type CandidateMeasurement,
  type RouterFailureClass,
} from "./plate-face-candidates.ts";


// ── AWS Rekognition config (duplicated for auditability) ────────────
const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
const DEFAULT_REKOGNITION_REGION = "eu-central-1";
function resolveRekognitionRegion(): string {
  const override = (Deno.env.get("REKOGNITION_REGION") ?? "").trim();
  if (override && AWS_REGION_PATTERN.test(override)) return override;
  const raw = (Deno.env.get("AWS_REGION") ?? "").trim();
  if (raw && AWS_REGION_PATTERN.test(raw)) return raw;
  return DEFAULT_REKOGNITION_REGION;
}
const REGION = resolveRekognitionRegion();
const HOST = `rekognition.${REGION}.amazonaws.com`;
const ENDPOINT = `https://${HOST}/`;
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const FETCH_TIMEOUT_MS = 12_000;
const REK_TIMEOUT_MS = 15_000;

function asBufferSource(bytes: Uint8Array): BufferSource {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy as unknown as BufferSource;
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", asBufferSource(bytes));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array
      ? asBufferSource(key)
      : key as BufferSource,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}
async function signingKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return await hmac(kService, "aws4_request");
}
async function signedRekognitionCall(target: string, payloadJson: string): Promise<Response> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error("aws_credentials_missing");
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(payloadJson);
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/rekognition/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
  const sigKey = await signingKey(AWS_SECRET_ACCESS_KEY, dateStamp, REGION, "rekognition");
  const sigBytes = await hmac(sigKey, stringToSign);
  const signature = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": amzDate,
      "X-Amz-Target": target,
      "Authorization": authorization,
    },
    body: payloadJson,
  });
}
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await withTimeout(fetch(url, { method: "GET" }), FETCH_TIMEOUT_MS, "img_fetch");
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ── Data shapes ─────────────────────────────────────────────────────

export interface AnchorFaceSlot {
  slotIndex: number;
  characterId: string;
  /** Normalized center on the ANCHOR image (0..1). */
  cx: number;
  cy: number;
  /** Normalized width/height on the ANCHOR image (0..1). */
  w: number;
  h: number;
}

export interface AnchorFaceLayout {
  version: "v278";
  anchorUrl: string;
  dims: { width: number; height: number };
  slots: AnchorFaceSlot[];
}

export interface RoutedPlateFace {
  /** Position index in row-major order among detected plate faces. */
  slot: number;
  /** Pixel-space [x1,y1,x2,y2] on the plate. */
  bbox: [number, number, number, number];
  /** Normalized center on the plate (0..1). */
  cx: number;
  cy: number;
  /** Character assigned by Hungarian; null if unassigned (extra face). */
  characterId: string | null;
  /** Euclidean distance in normalized coords to matched anchor slot. */
  distance: number | null;
  matchConfidence: number;
}

export interface PlateFaceSlotRouterResult {
  ok: boolean;
  method: "v278_hungarian_plate_router";
  dims: { width: number; height: number };
  faces: RoutedPlateFace[];
  /** speakerIdx (as string) → characterId. Only assigned speakers. */
  assignmentLock: Record<string, string>;
  resolvedCount: number;
  expectedCount: number;
  /** True when detected face count != anchor slot count → manual review. */
  countMismatch: boolean;
  maxDistance: number | null;
  reason?: string;
  /**
   * FA-4 P0 — failure classification. `contractual` = confirmed geometry
   * decision → integration MUST fail closed (no legacy face routing).
   * `infrastructure` = recoverable, legacy fallback contract unchanged.
   */
  failureClass?: RouterFailureClass;
  /** Faces returned by DetectFaces before sanity filtering. */
  detectedCount?: number;
  /** True when the DetectFaces call itself completed without error. */
  detectSucceeded?: boolean;
  /**
   * V507 — per-candidate size/shape measurements (px + ratios) so the
   * customer-facing reason and `preview_audit` do not depend on edge logs.
   */
  sanityMeasurements?: CandidateMeasurement[];
  /**
   * V507 — true when the ONLY thing that removed candidates was the face
   * size gate. Distinguishes "faces too small for lip-sync" from a real
   * geometric count mismatch.
   */
  faceSizeLimited?: boolean;
  /**
   * V527 — dimensions of the image bytes DetectFaces actually inspected.
   * Every pixel-space sanity measurement is expressed in this space.
   */
  detectionDims?: { width: number; height: number };
  /**
   * V527 — destination dimensions the accepted boxes are projected into
   * for downstream routing. Equal to `dims`.
   */
  projectionDims?: { width: number; height: number };
  /** V527 — which coordinate space the sanity gate was evaluated in. */
  sanitySpace?: "anchor_native";
  msTotal: number;
}


// ── Public helpers ──────────────────────────────────────────────────

/** Build the persistent anchor layout from v274 Rekognition result. */
export function buildAnchorLayoutFromV274(
  anchorUrl: string,
  dims: { width: number; height: number },
  v274Faces: Array<{
    slot: number;
    bbox: [number, number, number, number];
    characterId: string | null;
  }>,
  fallbackCharacterIds: string[] = [],
): AnchorFaceLayout {
  const slots: AnchorFaceSlot[] = [];
  for (const f of v274Faces) {
    if (!f?.bbox || dims.width <= 0 || dims.height <= 0) continue;
    const slotIndex = Number.isFinite(Number(f.slot)) ? Math.max(0, Math.round(Number(f.slot))) : slots.length;
    // v278.1 — Anchor-position-as-truth must not depend on biometric
    // Rekognition resolving every identity. The visual slot/order is already
    // known from the anchor composition prompt, so use the prompt/speaker order
    // as the primary character source and only fall back to v274's biometric
    // label for older call sites without explicit ordering.
    const characterId = fallbackCharacterIds[slotIndex] ?? f.characterId;
    if (!characterId) continue;
    const [x1, y1, x2, y2] = f.bbox;
    const w = (x2 - x1) / dims.width;
    const h = (y2 - y1) / dims.height;
    const cx = (x1 + (x2 - x1) / 2) / dims.width;
    const cy = (y1 + (y2 - y1) / 2) / dims.height;
    slots.push({ slotIndex, characterId, cx, cy, w, h });
  }
  return { version: "v278", anchorUrl, dims, slots };
}

/** Minimal PNG/JPEG dimension probe. */
function probeImageDims(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2;
      while (i < bytes.length - 8) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker >= 0xc0 && marker <= 0xc3) {
          const h = (bytes[i + 5] << 8) | bytes[i + 6];
          const w = (bytes[i + 7] << 8) | bytes[i + 8];
          return { width: w, height: h };
        }
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
        if (segLen < 2) return null;
        i += 2 + segLen;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * V527 — TWO DIMENSION AUTHORITIES.
 *
 * Generation 25 failed a four-face shot with `faces_too_small_for_lipsync`
 * at 38 px against a 40 px floor. The face was not too small: DetectFaces
 * had inspected the 704x1510 anchor still, and its normalized boxes were
 * being denormalized with the 656x1406 base-video dimensions before the
 * size gate ran. The same face measures ~40.8 px in the raster that was
 * actually looked at.
 *
 * The arithmetic was right; the object was wrong. So the two spaces are now
 * named and kept apart:
 *
 *   detectionDims  — the bytes DetectFaces inspected. ALL pixel-space
 *                    sanity is measured here, because that is the only
 *                    raster the measurement is a statement about.
 *   projectionDims — the destination the accepted boxes are re-expressed
 *                    in for downstream routing. A later, separate step.
 *
 * Returns null when the detection space cannot be established. The caller
 * fails closed rather than borrowing the projection dims, which would just
 * reinstate the same false assumption under a different name.
 */
export interface DimensionAuthority {
  detectionDims: { width: number; height: number };
  projectionDims: { width: number; height: number };
}

export function resolveDimensionAuthority(
  detectionDims: { width: number; height: number } | null | undefined,
  projectionDims?: { width: number; height: number } | null,
): DimensionAuthority | null {
  const usable = (d: { width: number; height: number } | null | undefined) =>
    !!d && Number.isFinite(d.width) && Number.isFinite(d.height) &&
    d.width > 0 && d.height > 0;
  if (!usable(detectionDims)) return null;
  const det = { width: detectionDims!.width, height: detectionDims!.height };
  return {
    detectionDims: det,
    // No projection target supplied → the detection raster IS the
    // destination. Never the other way round.
    projectionDims: usable(projectionDims)
      ? { width: projectionDims!.width, height: projectionDims!.height }
      : det,
  };
}

/**
 * V527 — the one denormalization formula, so detection space and projection
 * space cannot drift apart by being written twice. Unchanged arithmetic.
 */
export function denormalizeFaceBox(
  norm: { Left: number; Top: number; Width: number; Height: number },
  dims: { width: number; height: number },
): [number, number, number, number] {
  const { Left, Top, Width, Height } = norm;
  const x1 = Math.max(0, Math.min(dims.width, Math.round(Left * dims.width)));
  const y1 = Math.max(0, Math.min(dims.height, Math.round(Top * dims.height)));
  const x2 = Math.max(0, Math.min(dims.width, Math.round((Left + Width) * dims.width)));
  const y2 = Math.max(0, Math.min(dims.height, Math.round((Top + Height) * dims.height)));
  return [x1, y1, x2, y2];
}

async function detectFacesOnBytes(
  bytes: Uint8Array,
  dims: { width: number; height: number },
): Promise<Array<{ slot: number; norm: { Left: number; Top: number; Width: number; Height: number }; bbox: [number, number, number, number]; cx: number; cy: number; confidence: number }>> {
  const payload = JSON.stringify({ Image: { Bytes: bytesToBase64(bytes) }, Attributes: ["DEFAULT"] });
  const res = await withTimeout(signedRekognitionCall("RekognitionService.DetectFaces", payload), REK_TIMEOUT_MS, "detect");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`detect_faces_http_${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const details = Array.isArray(json?.FaceDetails) ? json.FaceDetails : [];
  const raw: Array<{ norm: { Left: number; Top: number; Width: number; Height: number }; bbox: [number, number, number, number]; cx: number; cy: number; confidence: number }> = [];
  for (const d of details) {
    if (!d?.BoundingBox) continue;
    const conf = Number(d.Confidence ?? 0);
    if (conf < 80) continue;
    const { Left, Top, Width, Height } = d.BoundingBox;
    // V527 — `dims` is the DETECTION raster. The 8 px noise floor and the
    // pixel bbox are both statements about the image that was inspected.
    const bbox = denormalizeFaceBox({ Left, Top, Width, Height }, dims);
    const [x1, y1, x2, y2] = bbox;
    if (x2 - x1 < 8 || y2 - y1 < 8) continue;
    raw.push({
      norm: { Left, Top, Width, Height },
      bbox,
      cx: Left + Width / 2,
      cy: Top + Height / 2,
      confidence: conf / 100,
    });
  }
  raw.sort((a, b) => {
    const dy = a.cy - b.cy;
    if (Math.abs(dy) > 0.1) return dy;
    return a.cx - b.cx;
  });
  return raw.map((f, i) => ({ ...f, slot: i }));
}

// FA-4 — the previous local brute-force Hungarian (`optimalAssignmentMin`) was
// replaced by the pure, unit-tested `assignAnchorsToCandidatesBijective`
// (see _shared/plate-face-candidates.ts). It runs on sanity-filtered
// candidates only and fails closed on exact equal-cost ambiguity.


/**
 * Route plate faces to anchor slots by minimum-distance bijection.
 *
 * @param plateUrl  URL of the rendered plate first-frame (or any keyframe).
 * @param anchorLayout  Persistent layout captured after the anchor render.
 * @param plateDims  Optional; will be probed from the fetched image otherwise.
 */
export async function routePlateFacesToAnchor(params: {
  plateUrl: string;
  anchorLayout: AnchorFaceLayout;
  plateDims?: { width: number; height: number };
}): Promise<PlateFaceSlotRouterResult> {
  const t0 = Date.now();
  const { plateUrl, anchorLayout } = params;
  const emptyResult = (
    reason: string,
    ctx?: { detectSucceeded?: boolean; detectedCount?: number },
  ): PlateFaceSlotRouterResult => {
    const detectSucceeded = ctx?.detectSucceeded ?? false;
    const detectedCount = ctx?.detectedCount ?? 0;
    return {
      ok: false,
      method: "v278_hungarian_plate_router",
      dims: params.plateDims ?? { width: 0, height: 0 },
      faces: [],
      assignmentLock: {},
      resolvedCount: 0,
      expectedCount: anchorLayout.slots.length,
      countMismatch: false,
      maxDistance: null,
      reason,
      detectSucceeded,
      detectedCount,
      failureClass: classifyRouterFailure({
        reason,
        detectSucceeded,
        detectedCount,
        expectedCount: anchorLayout.slots.length,
      }),
      msTotal: Date.now() - t0,
    };
  };

  if (!plateUrl || !anchorLayout?.slots?.length) return emptyResult("empty_input");
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return emptyResult("aws_credentials_missing");

  const bytes = await fetchImageBytes(plateUrl);
  if (!bytes) return emptyResult("plate_fetch_failed");

  // V527 — establish the detection space from the bytes themselves. The
  // caller's `plateDims` describes the destination, not what was looked at,
  // so it can no longer stand in for the measurement space; the old
  // 1920x1080 default is gone for the same reason.
  const authority = resolveDimensionAuthority(probeImageDims(bytes), params.plateDims);
  if (!authority) {
    return emptyResult("anchor_detection_dims_unavailable");
  }
  const detectionDims = authority.detectionDims;
  const dims = authority.projectionDims;

  let detected: Awaited<ReturnType<typeof detectFacesOnBytes>>;
  try {
    detected = await detectFacesOnBytes(bytes, detectionDims);
  } catch (e) {
    return { ...emptyResult(`detect_failed:${(e as Error).message}`), dims, detectionDims, projectionDims: dims };
  }

  const anchorSlots = [...anchorLayout.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const rows = anchorSlots.length;

  // V527 — downstream still receives plate-space boxes. Projecting from the
  // normalized box (not from the detection pixels) keeps this bit-identical
  // to the pre-V527 output and avoids a second rounding.
  const faces: RoutedPlateFace[] = detected.map((d) => ({
    slot: d.slot, bbox: denormalizeFaceBox(d.norm, dims), cx: d.cx, cy: d.cy,
    characterId: null, distance: null, matchConfidence: 0,
  }));

  if (rows === 0 || detected.length === 0) {
    // DetectFaces itself succeeded here — the classifier decides whether this
    // is a confirmed geometry statement (anchors exist, 0 faces) or a
    // recoverable precondition gap (no anchor slots).
    return {
      ...emptyResult("no_faces_detected", {
        detectSucceeded: true,
        detectedCount: detected.length,
      }),
      dims,
      detectionDims,
      projectionDims: dims,
      faces,
      countMismatch: rows !== detected.length,
    };
  }


  // ── Contract A — candidate sanity BEFORE any assignment ────────────
  // V527 — measured against the raster DetectFaces inspected. `d.bbox` is
  // detection-native by construction; pairing it with `detectionDims` is the
  // whole fix. Every metric in the block travels together: shortSidePx, the
  // areaRatio denominator and the in-raster tolerance all now refer to one
  // and the same image.
  const { plausible, rejected, measurements } = filterPlausibleCandidates(
    detected.map((d, i) => ({ index: i, bbox: d.bbox, cx: d.cx, cy: d.cy })),
    detectionDims,
  );
  for (const r of rejected) {
    const f = faces[r.index];
    if (f) (f as any).sanityRejected = r.reason;
  }
  // V507 — was the candidate loss caused ONLY by the face size gate?
  const faceSizeLimited =
    rejected.length > 0 &&
    rejected.every((r) => FACE_SIZE_REJECTIONS.includes(r.reason));
  console.log(
    `[plateFaceSlotRouter] fa4_candidate_sanity detected=${detected.length} ` +
    `plausible=${plausible.length} rejected=${rejected.length} ` +
    `reasons=${JSON.stringify(rejected)} ` +
    `v507_face_size_limited=${faceSizeLimited ? 1 : 0} ` +
    `min_short_side_px=${PLATE_FACE_SANITY.minFaceShortSidePx} ` +
    `sanity_space=anchor_native ` +
    `detection_dims=${detectionDims.width}x${detectionDims.height} ` +
    `projection_dims=${dims.width}x${dims.height} ` +
    `plate=${dims.width}x${dims.height} measurements=${JSON.stringify(measurements)}`,
  );

  // ── Contract B — global bijective geometry assignment ──────────────
  const assignment = assignAnchorsToCandidatesBijective(
    anchorSlots.map((a) => ({ cx: a.cx, cy: a.cy })),
    plausible.map((p) => ({ cx: p.cx, cy: p.cy })),
  );

  if (!assignment.ok) {
    const countMismatch = assignment.reason === "count_mismatch";
    // V507 — name the real cause instead of the downstream symptom.
    const bare =
      countMismatch && faceSizeLimited && plausible.length < rows
        ? "faces_too_small_for_lipsync"
        : assignment.reason;
    const reason = `fa4_fail_closed:${bare}:anchor=${rows}/plausible=${plausible.length}/detected=${detected.length}`;
    return {
      ok: false,
      method: "v278_hungarian_plate_router",
      dims,
      faces,
      assignmentLock: {},
      resolvedCount: 0,
      expectedCount: rows,
      countMismatch,
      maxDistance: null,
      reason,
      detectSucceeded: true,
      detectedCount: detected.length,
      sanityMeasurements: measurements,
      faceSizeLimited,
      detectionDims,
      projectionDims: dims,
      sanitySpace: "anchor_native",
      failureClass: classifyRouterFailure({
        reason,
        detectSucceeded: true,
        detectedCount: detected.length,
        expectedCount: rows,
      }),
      msTotal: Date.now() - t0,
    };
  }



  const assignmentLock: Record<string, string> = {};
  let resolved = 0;
  for (let r = 0; r < rows; r++) {
    const cand = plausible[assignment.assign[r]];
    if (!cand) continue;
    const anchor = anchorSlots[r];
    const plate = faces[cand.index];
    if (!plate) continue;
    const dist = assignment.distances[r];
    plate.characterId = anchor.characterId;
    plate.distance = dist;
    // Telemetry only — never a gate, never a tie-break (Contract B).
    plate.matchConfidence = Math.max(0, Math.min(1, 1 - dist / 0.5));
    assignmentLock[String(anchor.slotIndex)] = anchor.characterId;
    resolved++;
  }

  // v278.3 — Extra faces are not a failure. Office/task scenes can contain
  // reflections, background people, or poster faces. The assignment is
  // bijective, so the only hard count mismatch is "too few plausible faces".
  return {
    ok: resolved === rows,
    method: "v278_hungarian_plate_router",
    dims,
    faces,
    assignmentLock,
    resolvedCount: resolved,
    expectedCount: rows,
    countMismatch: false,
    maxDistance: assignment.maxDistance,
    reason: resolved === rows ? undefined : "incomplete_bijection",
    detectSucceeded: true,
    detectedCount: detected.length,
    detectionDims,
    projectionDims: dims,
    sanitySpace: "anchor_native",
    failureClass: resolved === rows
      ? undefined
      : classifyRouterFailure({
        reason: "incomplete_bijection",
        detectSucceeded: true,
        detectedCount: detected.length,
        expectedCount: rows,
      }),
    msTotal: Date.now() - t0,
  };
}

