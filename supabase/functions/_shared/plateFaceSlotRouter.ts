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
    const x1 = Math.max(0, Math.min(dims.width, Math.round(Left * dims.width)));
    const y1 = Math.max(0, Math.min(dims.height, Math.round(Top * dims.height)));
    const x2 = Math.max(0, Math.min(dims.width, Math.round((Left + Width) * dims.width)));
    const y2 = Math.max(0, Math.min(dims.height, Math.round((Top + Height) * dims.height)));
    if (x2 - x1 < 8 || y2 - y1 < 8) continue;
    raw.push({
      norm: { Left, Top, Width, Height },
      bbox: [x1, y1, x2, y2],
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

/** Hungarian (brute permutation) — minimizes sum of costs. N ≤ 6 → ≤720 perms. */
function optimalAssignmentMin(cost: number[][]): number[] {
  const rows = cost.length;
  if (rows === 0) return [];
  const cols = cost[0]?.length ?? 0;
  const pick = new Array(rows).fill(-1);
  let bestPick: number[] | null = null;
  let bestScore = Infinity;
  const used = new Array(cols).fill(false);
  const dfs = (r: number, sum: number) => {
    if (sum >= bestScore) return; // prune
    if (r === rows) {
      if (sum < bestScore) { bestScore = sum; bestPick = pick.slice(); }
      return;
    }
    for (let c = 0; c < cols; c++) {
      if (used[c]) continue;
      used[c] = true;
      pick[r] = c;
      dfs(r + 1, sum + (cost[r][c] ?? 0));
      used[c] = false;
    }
  };
  dfs(0, 0);
  return bestPick ?? pick.map((_, i) => i);
}

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
  const emptyResult = (reason: string): PlateFaceSlotRouterResult => ({
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
    msTotal: Date.now() - t0,
  });

  if (!plateUrl || !anchorLayout?.slots?.length) return emptyResult("empty_input");
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return emptyResult("aws_credentials_missing");

  const bytes = await fetchImageBytes(plateUrl);
  if (!bytes) return emptyResult("plate_fetch_failed");

  const dims = params.plateDims ?? probeImageDims(bytes) ?? { width: 1920, height: 1080 };

  let detected: Awaited<ReturnType<typeof detectFacesOnBytes>>;
  try {
    detected = await detectFacesOnBytes(bytes, dims);
  } catch (e) {
    return { ...emptyResult(`detect_failed:${(e as Error).message}`), dims };
  }

  const anchorSlots = [...anchorLayout.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const rows = anchorSlots.length;
  const cols = detected.length;

  if (rows === 0 || cols === 0) {
    return {
      ...emptyResult("no_faces_detected"),
      dims,
      faces: detected.map((d) => ({
        slot: d.slot, bbox: d.bbox, cx: d.cx, cy: d.cy,
        characterId: null, distance: null, matchConfidence: 0,
      })),
      countMismatch: rows !== cols,
    };
  }

  // Build square NxN distance matrix (pad with high cost for missing side).
  const N = Math.max(rows, cols);
  const HIGH = 10;
  const cost: number[][] = [];
  for (let r = 0; r < N; r++) {
    const row: number[] = [];
    for (let c = 0; c < N; c++) {
      if (r >= rows || c >= cols) { row.push(HIGH); continue; }
      const a = anchorSlots[r];
      const p = detected[c];
      const dx = a.cx - p.cx;
      const dy = a.cy - p.cy;
      row.push(Math.sqrt(dx * dx + dy * dy));
    }
    cost.push(row);
  }

  const assign = optimalAssignmentMin(cost); // assign[anchorRow] = plateCol
  const faces: RoutedPlateFace[] = detected.map((d) => ({
    slot: d.slot, bbox: d.bbox, cx: d.cx, cy: d.cy,
    characterId: null, distance: null, matchConfidence: 0,
  }));
  const assignmentLock: Record<string, string> = {};
  let resolved = 0;
  let maxDist = 0;

  for (let r = 0; r < rows; r++) {
    const c = assign[r];
    if (c === undefined || c < 0 || c >= cols) continue;
    const anchor = anchorSlots[r];
    const plate = faces[c];
    if (!plate) continue;
    const dist = cost[r][c];
    plate.characterId = anchor.characterId;
    plate.distance = dist;
    // Confidence: 1.0 at distance 0, 0 at distance 0.5 (half image diagonal-ish).
    plate.matchConfidence = Math.max(0, Math.min(1, 1 - dist / 0.5));
    assignmentLock[String(anchor.slotIndex)] = anchor.characterId;
    resolved++;
    if (dist > maxDist) maxDist = dist;
  }

  // v278.3 — Extra faces are not a failure. Office/task scenes can contain
  // reflections, background people, or poster faces. Hungarian assignment is
  // already bijective, so the only hard count mismatch is "too few faces".
  const countMismatch = cols < rows;
  return {
    ok: resolved >= rows && !countMismatch,
    method: "v278_hungarian_plate_router",
    dims,
    faces,
    assignmentLock,
    resolvedCount: resolved,
    expectedCount: rows,
    countMismatch,
    maxDistance: maxDist,
    reason: countMismatch
      ? `count_mismatch:anchor=${rows}/plate=${cols}`
      : undefined,
    msTotal: Date.now() - t0,
  };
}
