/**
 * resolveIdentityViaRekognition.ts (v274)
 *
 * Speaker ↔ Face identity resolution on the ANCHOR frame via AWS Rekognition.
 *
 * Why this exists
 * ---------------
 * Nano Banana / Gemini 3 Pro produce great anchor plates but their face
 * placement drifts slot-to-slot per attempt. Downstream picking then falls
 * back to "slot-order = script-order", which routes speaker audio onto the
 * wrong face when the composition rearranges (e.g. speaker 4 lands on
 * position 1). v274 replaces that geometric fallback with a deterministic
 * biometric match against the Cast & World portraits we already have.
 *
 * Pipeline
 * --------
 * 1) DetectFaces on the anchor → bounding boxes.
 * 2) For each character portrait: CompareFaces(source=portrait,
 *    target=anchor). Each match points at a bounding box in the anchor with
 *    a Similarity score (0..100).
 * 3) Match Compare-returned boxes back to the DetectFaces boxes by IoU so
 *    each entry in the score matrix references a real DetectFaces slot.
 * 4) Hungarian (brute-force, N ≤ 6 → ≤720 perms) picks the globally-optimal
 *    1:1 assignment. Similarity below MIN_SIMILARITY stays unassigned.
 *
 * NOTE: SigV4 signer + region resolution are duplicated from
 * `face-detect-mediapipe.ts` on purpose (that file does not export them and
 * we want the helper standalone / auditable).
 */

import { bytesToBase64, ImageEncodingCache } from "./image-encoding-cache.ts";
const DEFAULT_REKOGNITION_REGION = "eu-central-1";
const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
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

const REK_TIMEOUT_MS = 15_000;
/** Similarity threshold to accept a portrait→box match (Rekognition 0..100). */
const MIN_SIMILARITY = 55;
/** v276 — Two-pass: relaxed threshold retried against still-unresolved slots. */
const MIN_SIMILARITY_PASS2 = 45;
/** IoU threshold to link a CompareFaces box back to a DetectFaces slot. */
const BOX_IOU_LINK_MIN = 0.35;


// ── SigV4 helpers ───────────────────────────────────────────────────────
/**
 * V524-P0 — COMPILE-ONLY BufferSource normalisation.
 *
 * `Uint8Array<ArrayBufferLike>` is not assignable to `BufferSource` under
 * the current lib types, because `ArrayBufferLike` admits
 * `SharedArrayBuffer`. The two errors this produces are older than V524 and
 * caller-independent; they only became visible when
 * `compose-dialog-segments` began importing this module directly.
 *
 * This is the SAME helper `plateFaceSlotRouter.ts` already ships in
 * production, copied verbatim rather than re-invented. It hands WebCrypto
 * the identical bytes in a freshly allocated (definitely non-shared)
 * buffer: the digest input, the HMAC key material, the signature and the
 * request are byte-for-byte unchanged.
 */
function asBufferSource(bytes: Uint8Array): BufferSource {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy as unknown as BufferSource;
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", asBufferSource(bytes));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array
      ? asBufferSource(key)
      : key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
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
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("aws_credentials_missing");
  }
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(payloadJson);
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST", "/", "", canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/rekognition/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest),
  ].join("\n");
  const sigKey = await signingKey(AWS_SECRET_ACCESS_KEY, dateStamp, REGION, "rekognition");
  const sigBytes = await hmac(sigKey, stringToSign);
  const signature = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
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

interface RekBox { Left: number; Top: number; Width: number; Height: number }

interface DetectedFace {
  slot: number;
  /** Pixel-space [x1,y1,x2,y2] on the anchor. */
  bbox: [number, number, number, number];
  /** Normalized box straight from Rekognition (used for IoU linking). */
  norm: RekBox;
  confidence: number;
}

async function detectFacesOnAnchor(anchorBase64: string, imgW: number, imgH: number): Promise<DetectedFace[]> {
  const payload = JSON.stringify({ Image: { Bytes: anchorBase64 }, Attributes: ["DEFAULT"] });
  const res = await withTimeout(signedRekognitionCall("RekognitionService.DetectFaces", payload), REK_TIMEOUT_MS, "detect");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`detect_faces_http_${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const details = Array.isArray(json?.FaceDetails) ? json.FaceDetails : [];
  const raw: DetectedFace[] = [];
  for (const d of details) {
    if (!d?.BoundingBox) continue;
    const conf = Number(d.Confidence ?? 0);
    if (conf < 80) continue;
    const { Left, Top, Width, Height } = d.BoundingBox;
    const x1 = Math.max(0, Math.min(imgW, Math.round(Left * imgW)));
    const y1 = Math.max(0, Math.min(imgH, Math.round(Top * imgH)));
    const x2 = Math.max(0, Math.min(imgW, Math.round((Left + Width) * imgW)));
    const y2 = Math.max(0, Math.min(imgH, Math.round((Top + Height) * imgH)));
    if (x2 - x1 < 8 || y2 - y1 < 8) continue;
    raw.push({
      slot: 0,
      bbox: [x1, y1, x2, y2],
      norm: { Left, Top, Width, Height },
      confidence: conf / 100,
    });
  }
  // Row-major (top→bottom then left→right) — matches downstream slot ordering.
  raw.sort((a, b) => {
    const dy = (a.norm.Top + a.norm.Height / 2) - (b.norm.Top + b.norm.Height / 2);
    if (Math.abs(dy) > 0.1) return dy;
    return (a.norm.Left + a.norm.Width / 2) - (b.norm.Left + b.norm.Width / 2);
  });
  return raw.map((f, i) => ({ ...f, slot: i }));
}

function iou(a: RekBox, b: RekBox): number {
  const ax2 = a.Left + a.Width, ay2 = a.Top + a.Height;
  const bx2 = b.Left + b.Width, by2 = b.Top + b.Height;
  const ix1 = Math.max(a.Left, b.Left);
  const iy1 = Math.max(a.Top, b.Top);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.Width * a.Height + b.Width * b.Height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * V529 — the caller must be able to tell a failed CompareFaces call from a
 * successful one that simply matched nothing. Before, both returned an empty
 * map and both surfaced as `below_threshold`, which is what made generation
 * 27 undiagnosable.
 */
interface ComparePortraitResult { ok: boolean; scores: Map<number, number> }

async function compareOnePortrait(
  portraitBase64: string,
  anchorBase64: string,
  detected: DetectedFace[],
): Promise<ComparePortraitResult> {
  /** scores: Map<detectedSlot, similarity(0..100)>. */
  const out = new Map<number, number>();
  const payload = JSON.stringify({
    SourceImage: { Bytes: portraitBase64 },
    TargetImage: { Bytes: anchorBase64 },
    SimilarityThreshold: 0, // we filter later with MIN_SIMILARITY
    QualityFilter: "NONE",
  });
  let res: Response;
  try {
    res = await withTimeout(
      signedRekognitionCall("RekognitionService.CompareFaces", payload),
      REK_TIMEOUT_MS,
      "compare",
    );
  } catch (e) {
    console.warn(`[resolveIdentityViaRekognition] compare failed: ${(e as Error).message}`);
    return { ok: false, scores: out };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[resolveIdentityViaRekognition] compare ${res.status}: ${body.slice(0, 200)}`);
    return { ok: false, scores: out };
  }
  const json = await res.json().catch(() => ({}));
  const matches: Array<{ Face?: { BoundingBox?: RekBox }; Similarity?: number }> =
    Array.isArray(json?.FaceMatches) ? json.FaceMatches : [];
  for (const m of matches) {
    const bb = m?.Face?.BoundingBox;
    const sim = Number(m?.Similarity ?? 0);
    if (!bb || !Number.isFinite(sim)) continue;
    // Link this match to the closest DetectFaces slot by IoU.
    let bestSlot = -1;
    let bestIou = 0;
    for (const d of detected) {
      const v = iou(bb, d.norm);
      if (v > bestIou) { bestIou = v; bestSlot = d.slot; }
    }
    if (bestSlot < 0 || bestIou < BOX_IOU_LINK_MIN) continue;
    // Keep the highest similarity if the same slot is hit twice.
    const prev = out.get(bestSlot) ?? 0;
    if (sim > prev) out.set(bestSlot, sim);
  }
  return { ok: true, scores: out };
}

/**
 * V529 — RECTANGULAR BIOMETRIC ASSIGNMENT.
 *
 * The previous brute-permutation Hungarian assumed at least as many detected
 * faces as characters. Generation 27 frame 428 detected ONE face for four
 * characters: the DFS could never reach `r === rows`, `bestPick` stayed null,
 * and the fallback returned the identity map [0,1,2,3] — columns 1..3 do not
 * exist, so `matrix[i][col]` was `undefined ?? 0` and three characters were
 * refused as if they had scored zero. Fail-closed at the registration level,
 * but not an assignment: the one real face was handed to character 0 by index
 * rather than by evidence.
 *
 * The fix is one unified search over PARTIAL injective maps, maximising
 * (cardinality, total score) lexicographically. A character may stay
 * unassigned; no face is shared; no column is fabricated.
 *
 * For cols >= rows this is provably the old behaviour: maximum cardinality is
 * then `rows`, so the search maximises total score over exactly the full
 * assignments the old DFS enumerated, in the same order, with the same strict
 * `>` so the same first maximum wins.
 */
export interface BiometricAssignment {
  /** assign[characterIndex] = detected face index, or -1 when unassigned. */
  assign: number[];
  /** How many characters received a face. */
  cardinality: number;
  /** True when another assignment achieved the same cardinality AND score. */
  tied: boolean;
  /**
   * V529-P0 — the exhaustive search did not finish inside the node budget.
   * Invariant: when this is true there are NO assigned edges. A solver that
   * ran out of room has proven nothing, and a heuristic stand-in would be
   * indistinguishable downstream from a proof.
   */
  budgetExceeded: boolean;
  /** Retained alias of `budgetExceeded` for the existing call sites. */
  degraded: boolean;
}

/** Search-node budget. Beyond it the deterministic greedy takes over. */
const ASSIGN_NODE_BUDGET = 200_000;

export function assignBiometricEdges(matrix: number[][]): BiometricAssignment {
  const rows = matrix.length;
  if (rows === 0) {
    return { assign: [], cardinality: 0, tied: false, budgetExceeded: false, degraded: false };
  }
  const cols = matrix[0]?.length ?? 0;
  if (cols === 0) {
    return {
      assign: new Array(rows).fill(-1),
      cardinality: 0,
      tied: false,
      budgetExceeded: false,
      degraded: false,
    };
  }

  const pick = new Array(rows).fill(-1);
  const used = new Array(cols).fill(false);
  let bestPick: number[] | null = null;
  let bestCard = -1;
  let bestScore = -Infinity;
  let tied = false;
  let nodes = 0;
  let exhausted = true;

  const dfs = (r: number, card: number, sum: number) => {
    if (++nodes > ASSIGN_NODE_BUDGET) { exhausted = false; return; }
    if (r === rows) {
      if (card > bestCard || (card === bestCard && sum > bestScore)) {
        bestCard = card; bestScore = sum; bestPick = pick.slice(); tied = false;
      } else if (card === bestCard && sum === bestScore) {
        tied = true;
      }
      return;
    }
    // Assigned branches first, ascending column — the historical order, so a
    // complete matrix still returns the exact same winner.
    for (let c = 0; c < cols; c++) {
      if (used[c]) continue;
      used[c] = true;
      pick[r] = c;
      dfs(r + 1, card + 1, sum + (matrix[r][c] ?? 0));
      used[c] = false;
    }
    // …then the possibility of leaving this character unmatched. Last, so it
    // can never outrank an assignment of equal cardinality.
    pick[r] = -1;
    dfs(r + 1, card, sum);
  };
  dfs(0, 0, 0);

  if (bestPick && exhausted) {
    return { assign: bestPick, cardinality: bestCard, tied, budgetExceeded: false, degraded: false };
  }

  // V529-P0 — FAIL CLOSED, NOT GREEDY.
  //
  // The first cut of V529 fell back to a deterministic greedy here. With
  // MAX_SPEAKERS frozen at 4 and no cap on how many faces the detector may
  // return, the budget is exceeded from 22 detected faces upward — a plate
  // with background people, posters or reflections reaches that. A greedy
  // pairing would then have become authoritative biometric evidence, and
  // downstream nothing could tell it apart from a proven one. Worse, the
  // pre-V529 solver had no budget at all and was still exact at that shape.
  //
  // So an exhausted search returns no edges. Every character stays
  // unassigned, the caller fails closed, and the reason says the solver ran
  // out of room rather than blaming the evidence.
  return {
    assign: new Array(rows).fill(-1),
    cardinality: 0,
    tied: false,
    budgetExceeded: true,
    degraded: true,
  };
}

export interface ResolvedIdentityFace {
  slot: number;
  bbox: [number, number, number, number];
  characterId: string | null;
  similarity: number | null;
}

/**
 * V529 — one bounded row per REQUESTED character, so an unresolved identity
 * says why. Generation 27 left Sarah and Kay unresolved on all three sampled
 * frames and nothing persisted could separate a portrait that never loaded
 * from a CompareFaces call that failed from a face that was never detected
 * from a genuinely low score. Those four need different fixes.
 */
export type IdentityUnresolvedReason =
  | "accepted"
  | "portrait_load_failed"
  | "compare_failed"
  | "no_faces_detected"
  | "below_threshold"
  | "ambiguous"
  /**
   * V529-P0 — the assignment search could not be completed within its node
   * budget. A solver-capacity failure, never a statement about the faces or
   * the portraits: neither `below_threshold` nor `compare_failed` would be
   * true here.
   */
  | "assignment_budget_exceeded";

export interface CharacterIdentityDiagnostic {
  characterId: string;
  portraitLoaded: boolean;
  compareAttempted: boolean;
  compareOk: boolean;
  /** Best score this character reached against ANY detected face. */
  bestSimilarity: number | null;
  bestFaceIndex: number | null;
  accepted: boolean;
  acceptedFaceIndex: number | null;
  acceptedSimilarity: number | null;
  reason: IdentityUnresolvedReason;
}

export interface RekognitionIdentityResult {
  ok: boolean;
  method: "aws-rekognition-anchor-v274" | "aws-rekognition-anchor-v274-twopass";
  dims: { width: number; height: number };
  faces: ResolvedIdentityFace[];
  /** speakerIdx (as string) → characterId. Only assigned speakers are listed. */
  assignmentLock: Record<string, string>;
  resolvedCount: number;
  expectedCount: number;
  minSimilarity: number | null;
  /** V529 — bounded, one entry per requested character. Never a score row. */
  characterDiagnostics?: CharacterIdentityDiagnostic[];
  /** V529 — how many faces the detector actually found. */
  detectedCount?: number;
  reason?: string;
  msTotal: number;
}

async function probeImageDims(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  // Minimal JPEG/PNG SOF/IHDR sniffer. Falls back to null; caller can supply.
  try {
    // PNG: IHDR at offset 16, big-endian W/H.
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    // JPEG: scan SOF0..SOF3.
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
 * Resolve speaker ↔ face on the anchor via AWS Rekognition.
 *
 * The result is intentionally shaped to be assignable both to
 * `audio_plan.twoshot.plate_identity_anchor` (for later inspection / UI) and,
 * via `assignmentLock`, to the dispatcher's `dialog_shots.plate_identity.assignmentLock`.
 */
export async function resolveIdentityViaRekognition(params: {
  anchorUrl: string;
  characters: Array<{ characterId: string; portraitUrl: string; speakerIdx: number }>;
  /** Optional hint if caller already knows anchor dims. */
  anchorWidth?: number;
  anchorHeight?: number;
}): Promise<RekognitionIdentityResult> {
  const t0 = Date.now();
  const empty: RekognitionIdentityResult = {
    ok: false,
    method: "aws-rekognition-anchor-v274",
    dims: { width: params.anchorWidth ?? 0, height: params.anchorHeight ?? 0 },
    faces: [],
    assignmentLock: {},
    resolvedCount: 0,
    expectedCount: params.characters.length,
    minSimilarity: null,
    reason: undefined,
    msTotal: 0,
  };

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return { ...empty, reason: "aws_credentials_missing", msTotal: Date.now() - t0 };
  }
  if (!params.anchorUrl || params.characters.length === 0) {
    return { ...empty, reason: "empty_input", msTotal: Date.now() - t0 };
  }

  const cache = new ImageEncodingCache();

  const anchorCached = await cache.load(params.anchorUrl);
  if (!anchorCached) {
    return { ...empty, reason: "anchor_fetch_failed", msTotal: Date.now() - t0 };
  }
  const probed = await probeImageDims(anchorCached.bytes);
  const W = params.anchorWidth ?? probed?.width ?? 1024;
  const H = params.anchorHeight ?? probed?.height ?? 1024;

  let detected: DetectedFace[];
  try {
    detected = await detectFacesOnAnchor(anchorCached.base64, W, H);
  } catch (e) {
    return { ...empty, dims: { width: W, height: H }, reason: `detect_failed:${(e as Error).message}`, msTotal: Date.now() - t0 };
  }
  if (detected.length === 0) {
    return {
      ...empty,
      dims: { width: W, height: H },
      reason: "detect_zero_faces",
      detectedCount: 0,
      // V529 — say so per character rather than letting the caller guess.
      characterDiagnostics: params.characters.map((c) => ({
        characterId: c.characterId,
        portraitLoaded: false,
        compareAttempted: false,
        compareOk: false,
        bestSimilarity: null,
        bestFaceIndex: null,
        accepted: false,
        acceptedFaceIndex: null,
        acceptedSimilarity: null,
        reason: "no_faces_detected" as const,
      })),
      msTotal: Date.now() - t0,
    };
  }

  // Fetch portraits in parallel through the same cache.
  const portraitCachedArr = await Promise.all(
    params.characters.map((c) => cache.load(c.portraitUrl)),
  );

  // Score matrix: rows=characters, cols=detected slots.
  // V529 — the two failure modes that used to vanish into a zero row are now
  // recorded as they happen. The scores themselves are unchanged.
  const scoreMatrix: number[][] = [];
  const portraitLoaded: boolean[] = [];
  const compareAttempted: boolean[] = [];
  const compareOk: boolean[] = [];
  for (let i = 0; i < params.characters.length; i++) {
    const pc = portraitCachedArr[i];
    if (!pc) {
      portraitLoaded.push(false); compareAttempted.push(false); compareOk.push(false);
      scoreMatrix.push(new Array(detected.length).fill(0));
      continue;
    }
    portraitLoaded.push(true); compareAttempted.push(true);
    const cmp = await compareOnePortrait(pc.base64, anchorCached.base64, detected);
    compareOk.push(cmp.ok);
    scoreMatrix.push(detected.map((d) => cmp.scores.get(d.slot) ?? 0));
  }

  // V529 — a partial injective assignment, so fewer faces than characters is
  // a smaller answer rather than a wrong one.
  const assignment = assignBiometricEdges(scoreMatrix);

  // V529-P0 — an exhausted solver has proven nothing, so nothing is claimed.
  // No accepted edge, no assignmentLock, no face carrying a characterId: the
  // caller sees the same fail-closed shape it already handles for every other
  // resolver failure, with a reason that names the solver rather than the
  // evidence. The per-character rows keep the scores that WERE measured;
  // ownership is the only thing withheld, because ownership is the part that
  // was not proven.
  if (assignment.budgetExceeded) {
    return {
      ...empty,
      dims: { width: W, height: H },
      reason: "assignment_budget_exceeded",
      detectedCount: detected.length,
      characterDiagnostics: params.characters.map((c, i) => {
        const row = scoreMatrix[i] ?? [];
        let bestFaceIndex: number | null = null;
        let bestSimilarity: number | null = null;
        for (let j = 0; j < row.length; j++) {
          if (bestSimilarity === null || row[j] > bestSimilarity) {
            bestSimilarity = row[j];
            bestFaceIndex = j;
          }
        }
        return {
          characterId: c.characterId,
          portraitLoaded: portraitLoaded[i] ?? false,
          compareAttempted: compareAttempted[i] ?? false,
          compareOk: compareOk[i] ?? false,
          bestSimilarity,
          bestFaceIndex,
          accepted: false,
          acceptedFaceIndex: null,
          acceptedSimilarity: null,
          reason: "assignment_budget_exceeded" as const,
        };
      }),
      msTotal: Date.now() - t0,
    };
  }
  const pick = assignment.assign;

  const faces: ResolvedIdentityFace[] = detected.map((d) => ({
    slot: d.slot,
    bbox: d.bbox,
    characterId: null,
    similarity: null,
  }));
  const assignmentLock: Record<string, string> = {};
  let minSim: number | null = null;
  let resolved = 0;
  const unresolvedIdx: number[] = [];
  params.characters.forEach((c, i) => {
    const col = pick[i];
    if (col == null || col < 0) { unresolvedIdx.push(i); return; }
    const sim = scoreMatrix[i][col] ?? 0;
    if (sim < MIN_SIMILARITY) { unresolvedIdx.push(i); return; }
    faces[col].characterId = c.characterId;
    faces[col].similarity = sim;
    assignmentLock[String(c.speakerIdx)] = c.characterId;
    resolved++;
    if (minSim === null || sim < minSim) minSim = sim;
  });

  // v276 — Pass 2: relax threshold for characters not yet matched against
  // detected slots that are still unclaimed. Best-first greedy over remaining.
  let pass2Hits = 0;
  if (unresolvedIdx.length > 0) {
    const claimedSlots = new Set<number>();
    for (const face of faces) {
      if (face.characterId) claimedSlots.add(face.slot);
    }
    type Cand = { charIdx: number; slot: number; sim: number };
    const cands: Cand[] = [];
    for (const i of unresolvedIdx) {
      for (let s = 0; s < detected.length; s++) {
        if (claimedSlots.has(s)) continue;
        const sim = scoreMatrix[i][s] ?? 0;
        if (sim >= MIN_SIMILARITY_PASS2 && sim < MIN_SIMILARITY) {
          cands.push({ charIdx: i, slot: s, sim });
        }
      }
    }
    cands.sort((a, b) => b.sim - a.sim);
    const usedChars = new Set<number>();
    for (const cand of cands) {
      if (usedChars.has(cand.charIdx) || claimedSlots.has(cand.slot)) continue;
      const c = params.characters[cand.charIdx];
      faces[cand.slot].characterId = c.characterId;
      faces[cand.slot].similarity = cand.sim;
      assignmentLock[String(c.speakerIdx)] = c.characterId;
      claimedSlots.add(cand.slot);
      usedChars.add(cand.charIdx);
      resolved++;
      pass2Hits++;
      if (minSim === null || cand.sim < minSim) minSim = cand.sim;
    }
  }

  // ── V529 — bounded per-character diagnostics ──────────────────────
  const acceptedBy = new Map<number, { faceIndex: number; similarity: number }>();
  params.characters.forEach((c, i) => {
    const slot = faces.findIndex((f) => f.characterId === c.characterId);
    if (slot >= 0 && faces[slot].similarity != null) {
      acceptedBy.set(i, { faceIndex: slot, similarity: Number(faces[slot].similarity) });
    }
  });
  const characterDiagnostics: CharacterIdentityDiagnostic[] = params.characters.map((c, i) => {
    const row = scoreMatrix[i] ?? [];
    let bestFaceIndex: number | null = null;
    let bestSimilarity: number | null = null;
    for (let j = 0; j < row.length; j++) {
      if (bestSimilarity === null || row[j] > bestSimilarity) { bestSimilarity = row[j]; bestFaceIndex = j; }
    }
    const acc = acceptedBy.get(i) ?? null;
    // The order matters: a portrait that never loaded is not a low score, and
    // a CompareFaces call that failed is not a low score either. Calling
    // either of them `below_threshold` is what hid generation 27.
    const reason: IdentityUnresolvedReason = acc
      ? "accepted"
      : !portraitLoaded[i]
      ? "portrait_load_failed"
      : compareAttempted[i] && !compareOk[i]
      ? "compare_failed"
      : assignment.tied && (bestSimilarity ?? 0) >= MIN_SIMILARITY_PASS2
      ? "ambiguous"
      : "below_threshold";
    return {
      characterId: c.characterId,
      portraitLoaded: portraitLoaded[i] ?? false,
      compareAttempted: compareAttempted[i] ?? false,
      compareOk: compareOk[i] ?? false,
      bestSimilarity,
      bestFaceIndex,
      accepted: !!acc,
      acceptedFaceIndex: acc?.faceIndex ?? null,
      acceptedSimilarity: acc?.similarity ?? null,
      reason,
    };
  });

  const method: RekognitionIdentityResult["method"] =
    pass2Hits > 0 ? "aws-rekognition-anchor-v274-twopass" : "aws-rekognition-anchor-v274";
  const msTotal = Date.now() - t0;
  console.log(
    `[resolveIdentityViaRekognition] v276 anchor=${params.anchorUrl.slice(-80)} ` +
    `detected=${detected.length} chars=${params.characters.length} ` +
    `resolved=${resolved}/${params.characters.length} pass2=${pass2Hits} minSim=${minSim ?? "-"} ` +
    `v529_card=${assignment.cardinality} tied=${assignment.tied ? 1 : 0} ` +
    `degraded=${assignment.degraded ? 1 : 0} ` +
    `unresolved=${characterDiagnostics.filter((d) => !d.accepted).map((d) => `${d.characterId.slice(0, 8)}:${d.reason}:${d.bestSimilarity ?? "-"}`).join(",") || "-"} ` +
    `ms=${msTotal}`,
  );
  return {
    ok: true,
    method,
    dims: { width: W, height: H },
    faces,
    assignmentLock,
    resolvedCount: resolved,
    expectedCount: params.characters.length,
    minSimilarity: minSim,
    characterDiagnostics,
    detectedCount: detected.length,
    msTotal,
  };
}

