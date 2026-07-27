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
/** Similarity threshold to accept a portrait→box match (Rekognition 0..100). */
const MIN_SIMILARITY = 55;
/** v276 — Two-pass: relaxed threshold retried against still-unresolved slots. */
const MIN_SIMILARITY_PASS2 = 45;
/** IoU threshold to link a CompareFaces box back to a DetectFaces slot. */
const BOX_IOU_LINK_MIN = 0.35;


// ── SigV4 helpers ───────────────────────────────────────────────────────
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
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

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await withTimeout(fetch(url, { method: "GET" }), FETCH_TIMEOUT_MS, "img_fetch");
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  } catch { return null; }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
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

async function detectFacesOnAnchor(anchorBytes: Uint8Array, imgW: number, imgH: number): Promise<DetectedFace[]> {
  const payload = JSON.stringify({ Image: { Bytes: bytesToBase64(anchorBytes) }, Attributes: ["DEFAULT"] });
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

async function compareOnePortrait(
  portraitBytes: Uint8Array,
  anchorBytes: Uint8Array,
  detected: DetectedFace[],
): Promise<Map<number, number>> {
  /** Returns Map<detectedSlot, similarity(0..100)>. */
  const out = new Map<number, number>();
  const payload = JSON.stringify({
    SourceImage: { Bytes: bytesToBase64(portraitBytes) },
    TargetImage: { Bytes: bytesToBase64(anchorBytes) },
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
    return out;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[resolveIdentityViaRekognition] compare ${res.status}: ${body.slice(0, 200)}`);
    return out;
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
  return out;
}

/** Hungarian by brute permutation (N ≤ 6 → ≤720 perms). */
function optimalAssignment(matrix: number[][]): number[] {
  const rows = matrix.length;
  if (rows === 0) return [];
  const cols = matrix[0]?.length ?? 0;
  const pick = new Array(rows).fill(-1);
  let bestPick: number[] | null = null;
  let bestScore = -Infinity;
  const used = new Array(cols).fill(false);
  const dfs = (r: number, sum: number) => {
    if (r === rows) {
      if (sum > bestScore) { bestScore = sum; bestPick = pick.slice(); }
      return;
    }
    for (let c = 0; c < cols; c++) {
      if (used[c]) continue;
      used[c] = true;
      pick[r] = c;
      dfs(r + 1, sum + (matrix[r][c] ?? 0));
      used[c] = false;
    }
  };
  dfs(0, 0);
  return bestPick ?? pick.map((_, i) => i);
}

export interface ResolvedIdentityFace {
  slot: number;
  bbox: [number, number, number, number];
  characterId: string | null;
  similarity: number | null;
}

export interface RekognitionIdentityResult {
  ok: boolean;
  method: "aws-rekognition-anchor-v274";
  dims: { width: number; height: number };
  faces: ResolvedIdentityFace[];
  /** speakerIdx (as string) → characterId. Only assigned speakers are listed. */
  assignmentLock: Record<string, string>;
  resolvedCount: number;
  expectedCount: number;
  minSimilarity: number | null;
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

  const anchorBytes = await fetchImageBytes(params.anchorUrl);
  if (!anchorBytes) {
    return { ...empty, reason: "anchor_fetch_failed", msTotal: Date.now() - t0 };
  }
  const probed = await probeImageDims(anchorBytes);
  const W = params.anchorWidth ?? probed?.width ?? 1024;
  const H = params.anchorHeight ?? probed?.height ?? 1024;

  let detected: DetectedFace[];
  try {
    detected = await detectFacesOnAnchor(anchorBytes, W, H);
  } catch (e) {
    return { ...empty, dims: { width: W, height: H }, reason: `detect_failed:${(e as Error).message}`, msTotal: Date.now() - t0 };
  }
  if (detected.length === 0) {
    return { ...empty, dims: { width: W, height: H }, reason: "detect_zero_faces", msTotal: Date.now() - t0 };
  }

  // Fetch portraits in parallel.
  const portraitBytesArr = await Promise.all(
    params.characters.map((c) => fetchImageBytes(c.portraitUrl)),
  );

  // Score matrix: rows=characters, cols=detected slots.
  const scoreMatrix: number[][] = [];
  for (let i = 0; i < params.characters.length; i++) {
    const pb = portraitBytesArr[i];
    if (!pb) { scoreMatrix.push(new Array(detected.length).fill(0)); continue; }
    const simMap = await compareOnePortrait(pb, anchorBytes, detected);
    scoreMatrix.push(detected.map((d) => simMap.get(d.slot) ?? 0));
  }

  const pick = optimalAssignment(scoreMatrix);

  const faces: ResolvedIdentityFace[] = detected.map((d) => ({
    slot: d.slot,
    bbox: d.bbox,
    characterId: null,
    similarity: null,
  }));
  const assignmentLock: Record<string, string> = {};
  let minSim: number | null = null;
  let resolved = 0;
  params.characters.forEach((c, i) => {
    const col = pick[i];
    if (col == null || col < 0) return;
    const sim = scoreMatrix[i][col] ?? 0;
    if (sim < MIN_SIMILARITY) return;
    faces[col].characterId = c.characterId;
    faces[col].similarity = sim;
    assignmentLock[String(c.speakerIdx)] = c.characterId;
    resolved++;
    if (minSim === null || sim < minSim) minSim = sim;
  });

  const msTotal = Date.now() - t0;
  console.log(
    `[resolveIdentityViaRekognition] v274 anchor=${params.anchorUrl.slice(-80)} ` +
    `detected=${detected.length} chars=${params.characters.length} ` +
    `resolved=${resolved}/${params.characters.length} minSim=${minSim ?? "-"} ms=${msTotal}`,
  );
  return {
    ok: true,
    method: "aws-rekognition-anchor-v274",
    dims: { width: W, height: H },
    faces,
    assignmentLock,
    resolvedCount: resolved,
    expectedCount: params.characters.length,
    minSimilarity: minSim,
    msTotal,
  };
}
