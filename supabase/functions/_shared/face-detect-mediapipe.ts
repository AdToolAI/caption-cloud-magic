/**
 * face-detect-mediapipe.ts (v129.22.2) — Managed Face Detector adapter.
 *
 * v129.22.2: Default-Region auf eu-central-1 (Frankfurt) — gleiche Region wie
 * unser Remotion-Lambda-Stack. Vermeidet EU→US-Roundtrip und hält Frames in
 * der EU (GDPR-friendly). AWS_REGION="Global" (legacy S3/CloudFront) wird
 * weiterhin als ungültig erkannt und auf eu-central-1 gemappt.
 */

// Resolve a real AWS region for Rekognition. AWS_REGION in this workspace
// can contain non-region strings like "Global" — those would build an
// invalid host. Prefer an explicit REKOGNITION_REGION override, then a
// validated AWS_REGION, then eu-central-1 (Frankfurt — matches Lambda).
const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
const DEFAULT_REKOGNITION_REGION = "eu-central-1";
function resolveRekognitionRegion(): string {
  const override = (Deno.env.get("REKOGNITION_REGION") ?? "").trim();
  if (override && AWS_REGION_PATTERN.test(override)) return override;
  const raw = (Deno.env.get("AWS_REGION") ?? "").trim();
  if (raw && AWS_REGION_PATTERN.test(raw)) return raw;
  if (raw) {
    console.warn(
      `[face-detect/aws] AWS_REGION='${raw}' is not a valid Rekognition region — falling back to ${DEFAULT_REKOGNITION_REGION}. ` +
      `Set REKOGNITION_REGION to override.`,
    );
  }
  return DEFAULT_REKOGNITION_REGION;
}

const REKOGNITION_REGION_RESOLVED = resolveRekognitionRegion();
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";

const REKOGNITION_HOST = `rekognition.${REKOGNITION_REGION_RESOLVED}.amazonaws.com`;
const REKOGNITION_ENDPOINT = `https://${REKOGNITION_HOST}/`;
const REKOGNITION_TARGET = "RekognitionService.DetectFaces";

const FETCH_TIMEOUT_MS = 12_000;
const REK_TIMEOUT_MS = 15_000;
const MIN_CONFIDENCE = 80; // %

export interface MediaPipeFace {
  /** Pixel-space [x1, y1, x2, y2] within the source plate dimensions. */
  bbox: [number, number, number, number];
  /** Pixel-space [cx, cy]. */
  center: [number, number];
  /** 0..1 detector confidence. */
  confidence: number;
  /** Optional landmark dict — present when Rekognition returned them. */
  landmarks?: {
    leftEye?: [number, number];
    rightEye?: [number, number];
    nose?: [number, number];
    mouth?: [number, number];
  };
  /** Which frame index this detection came from. */
  frameSeen: number;
}

export interface MediaPipeDetectResult {
  ok: boolean;
  faces: MediaPipeFace[];
  framesScanned: number;
  /** Plate-pixel union of all face bboxes + 10% padding. null when no faces. */
  unionBbox: [number, number, number, number] | null;
  /** Provider tag — useful for forensics. */
  source: "aws_rekognition" | "error";
  ms: number;
  error?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

// ── AWS SigV4 helpers (no SDK — keeps Edge bundle small) ────────────────
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

async function signedRekognitionRequest(payloadJson: string): Promise<Response> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("aws_credentials_missing");
  }
  const amzDate = new Date()
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, ""); // 20260618T151230Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(payloadJson);

  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${REKOGNITION_HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${REKOGNITION_TARGET}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${REKOGNITION_REGION_RESOLVED}/rekognition/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const sigKey = await signingKey(AWS_SECRET_ACCESS_KEY, dateStamp, REKOGNITION_REGION_RESOLVED, "rekognition");
  const sigBytes = await hmac(sigKey, stringToSign);
  const signature = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return await fetch(REKOGNITION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": amzDate,
      "X-Amz-Target": REKOGNITION_TARGET,
      "Authorization": authorization,
    },
    body: payloadJson,
  });
}

interface RekFaceDetail {
  BoundingBox?: { Left: number; Top: number; Width: number; Height: number };
  Confidence?: number;
  Landmarks?: Array<{ Type: string; X: number; Y: number }>;
}

async function callRekognition(
  imageBytes: Uint8Array,
  frameIndex: number,
  imgW: number,
  imgH: number,
): Promise<MediaPipeFace[]> {
  // Rekognition wants base64 in JSON. btoa requires binary string.
  let bin = "";
  for (let i = 0; i < imageBytes.length; i++) {
    bin += String.fromCharCode(imageBytes[i]);
  }
  const b64 = btoa(bin);
  const payload = JSON.stringify({
    Image: { Bytes: b64 },
    Attributes: ["DEFAULT"],
  });

  let res: Response;
  try {
    res = await withTimeout(signedRekognitionRequest(payload), REK_TIMEOUT_MS, "rekognition");
  } catch (e) {
    console.warn(`[face-detect/aws] rekognition request failed frame=${frameIndex}: ${(e as Error).message}`);
    return [];
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[face-detect/aws] rekognition ${res.status} frame=${frameIndex}: ${body.slice(0, 400)}`);
    return [];
  }

  let json: { FaceDetails?: RekFaceDetail[] };
  try {
    json = await res.json();
  } catch (e) {
    console.warn(`[face-detect/aws] rekognition JSON parse failed frame=${frameIndex}: ${(e as Error).message}`);
    return [];
  }

  const details = Array.isArray(json.FaceDetails) ? json.FaceDetails : [];
  const out: MediaPipeFace[] = [];
  for (const d of details) {
    if (!d.BoundingBox) continue;
    const conf = Number(d.Confidence ?? 0);
    if (conf < MIN_CONFIDENCE) continue;
    const { Left, Top, Width, Height } = d.BoundingBox;
    let x1 = Math.round(Left * imgW);
    let y1 = Math.round(Top * imgH);
    let x2 = Math.round((Left + Width) * imgW);
    let y2 = Math.round((Top + Height) * imgH);
    x1 = Math.max(0, Math.min(imgW, x1));
    y1 = Math.max(0, Math.min(imgH, y1));
    x2 = Math.max(0, Math.min(imgW, x2));
    y2 = Math.max(0, Math.min(imgH, y2));
    if (x2 - x1 < 8 || y2 - y1 < 8) continue;

    const lm: MediaPipeFace["landmarks"] = {};
    // v158 — Mouth-Landmark Auswahl deterministisch: bevorzuge `mouthDown`
    // (Lippen-Mittelpunkt unten), sonst Centroid aus mouthLeft+mouthRight,
    // sonst einzelnes Mouth-Landmark. AWS-API-Reihenfolge ist nicht garantiert,
    // und "first-wins" landete in Produktion oft auf mouthLeft/Right → seitlich
    // versetzter Sync.so-Anker → Animorph an der Lippenecke.
    let mouthDown: [number, number] | null = null;
    let mouthLeft: [number, number] | null = null;
    let mouthRight: [number, number] | null = null;
    if (Array.isArray(d.Landmarks)) {
      for (const l of d.Landmarks) {
        const px: [number, number] = [
          Math.round(l.X * imgW),
          Math.round(l.Y * imgH),
        ];
        if (l.Type === "eyeLeft") lm.leftEye = px;
        else if (l.Type === "eyeRight") lm.rightEye = px;
        else if (l.Type === "nose") lm.nose = px;
        else if (l.Type === "mouthDown") mouthDown = px;
        else if (l.Type === "mouthLeft") mouthLeft = px;
        else if (l.Type === "mouthRight") mouthRight = px;
      }
    }
    if (mouthDown) {
      lm.mouth = mouthDown;
    } else if (mouthLeft && mouthRight) {
      lm.mouth = [
        Math.round((mouthLeft[0] + mouthRight[0]) / 2),
        Math.round((mouthLeft[1] + mouthRight[1]) / 2),
      ];
    } else if (mouthLeft || mouthRight) {
      lm.mouth = (mouthLeft ?? mouthRight)!;
    }

    out.push({
      bbox: [x1, y1, x2, y2],
      center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
      confidence: Math.max(0, Math.min(1, conf / 100)),
      landmarks: Object.keys(lm).length ? lm : undefined,
      frameSeen: frameIndex,
    });
  }
  return out;
}

/**
 * v158 — Decode actual pixel dimensions from PNG/JPEG bytes.
 *
 * Why: AWS Rekognition returns BoundingBox coords normalized to the SUBMITTED
 * image's pixel space. The previous code multiplied them by `plateWidth /
 * plateHeight`, silently assuming the anchor image and the rendered Hailuo
 * plate share identical pixel dims. In production they often don't (anchor
 * 1024×1024 portrait vs 1376×768 plate). The aspect-ratio mismatch placed
 * every face and every mouth landmark at the wrong Y in plate space →
 * animorph on every speaker. We now decode the real anchor dims, use them
 * for the Rekognition coord-multiplication, then linearly re-scale into
 * plate-space per-axis.
 */
function decodeImageDims(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR with width/height as big-endian uint32.
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }
  // JPEG: FF D8, then scan markers for SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11 / SOF13..SOF15.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] !== 0xff) { i++; continue; }
      while (i < bytes.length && bytes[i] === 0xff) i++;
      const marker = bytes[i]; i++;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (i + 7 > bytes.length) return null;
        const h = (bytes[i + 3] << 8) | bytes[i + 4];
        const w = (bytes[i + 5] << 8) | bytes[i + 6];
        if (w > 0 && h > 0) return { width: w, height: h };
        return null;
      }
      const segLen = (bytes[i] << 8) | bytes[i + 1];
      if (segLen < 2) return null;
      i += segLen;
    }
  }
  return null;
}

/** Fetch a remote image (https URL) into bytes for Rekognition. */
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await withTimeout(
      fetch(url, { method: "GET" }),
      FETCH_TIMEOUT_MS,
      "frame_fetch",
    );
    if (!r.ok) {
      console.warn(`[face-detect/aws] frame fetch ${r.status} url=${url.slice(0, 120)}`);
      return null;
    }
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    console.warn(`[face-detect/aws] frame fetch failed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Detect faces on a plate frame using AWS Rekognition.
 *
 * Function name preserved for backwards compatibility — under the hood it
 * is no longer MediaPipe; it is AWS Rekognition DetectFaces.
 *
 * Required: `prebuiltFrameUrls` (one or more https JPEG URLs uploaded by
 * the caller). If absent or empty we return an explicit error so the
 * caller can fall through to Gemini Vision — we do NOT attempt server-side
 * frame extraction (every option we tried in Deno Edge runtime was
 * unreliable).
 */
export async function detectFacesMediaPipe(opts: {
  videoUrl: string;            // unused now, kept for signature compat
  plateWidth: number;
  plateHeight: number;
  durationSec: number;         // unused now, kept for signature compat
  frameTimestamps?: number[];  // unused now, kept for signature compat
  prebuiltFrameUrls?: string[];
}): Promise<MediaPipeDetectResult> {
  const t0 = Date.now();

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.warn("[face-detect/aws] AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing — detector disabled");
    return {
      ok: false, faces: [], framesScanned: 0, unionBbox: null,
      source: "error", ms: 0, error: "aws_credentials_missing",
    };
  }

  const W = Math.max(1, opts.plateWidth);
  const H = Math.max(1, opts.plateHeight);

  const urls = (opts.prebuiltFrameUrls ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"));

  if (urls.length === 0) {
    return {
      ok: false, faces: [], framesScanned: 0, unionBbox: null,
      source: "error", ms: Date.now() - t0,
      error: "no_prebuilt_frame_url",
    };
  }

  console.log(
    `[face-detect/aws] v129.22.1 rekognition primary plate=${W}x${H} ` +
    `region=${REKOGNITION_REGION_RESOLVED} frames=${urls.length}`,
  );

  // Fetch all frames in parallel, then call Rekognition in parallel.
  const frames = await Promise.all(urls.map((url) => fetchImageBytes(url)));
  const validFrames = frames
    .map((bytes, i) => (bytes ? { bytes, i } : null))
    .filter((v): v is { bytes: Uint8Array; i: number } => v !== null);

  if (validFrames.length === 0) {
    return {
      ok: false, faces: [], framesScanned: 0, unionBbox: null,
      source: "error", ms: Date.now() - t0,
      error: "frame_fetch_failed_all",
    };
  }

  const perFrameResults = await Promise.all(
    validFrames.map(async (f) => {
      // v158 — Decode the SUBMITTED image's own pixel dims; use those for the
      // AWS-coord-multiplication, then linearly re-scale into plate space.
      // Eliminates the aspect-ratio-mismatch animorph (anchor 1:1 vs plate 16:9).
      const dims = decodeImageDims(f.bytes);
      const iw = dims?.width && dims.width > 0 ? dims.width : W;
      const ih = dims?.height && dims.height > 0 ? dims.height : H;
      const detected = await callRekognition(f.bytes, f.i, iw, ih);
      if (dims && (iw !== W || ih !== H)) {
        const sx = W / iw;
        const sy = H / ih;
        const aspectAnchor = iw / ih;
        const aspectPlate = W / H;
        const aspectMismatch = Math.abs(aspectAnchor - aspectPlate) / aspectPlate;
        if (aspectMismatch > 0.02) {
          console.warn(
            `[face-detect/aws] v158_anchor_plate_aspect_mismatch anchor=${iw}x${ih} ` +
            `plate=${W}x${H} mismatch=${(aspectMismatch * 100).toFixed(1)}% — per-axis scale ` +
            `sx=${sx.toFixed(3)} sy=${sy.toFixed(3)} (mouth/face Y may drift; consider re-anchoring at plate aspect)`,
          );
        } else {
          console.log(
            `[face-detect/aws] v158_anchor_dim_scale anchor=${iw}x${ih} plate=${W}x${H} sx=${sx.toFixed(3)} sy=${sy.toFixed(3)}`,
          );
        }
        return detected.map((face) => {
          const lm = face.landmarks ? { ...face.landmarks } : undefined;
          const scalePt = (p?: [number, number]): [number, number] | undefined =>
            p ? [Math.round(p[0] * sx), Math.round(p[1] * sy)] : undefined;
          if (lm) {
            lm.leftEye = scalePt(lm.leftEye);
            lm.rightEye = scalePt(lm.rightEye);
            lm.nose = scalePt(lm.nose);
            lm.mouth = scalePt(lm.mouth);
          }
          const sx1 = Math.max(0, Math.min(W, Math.round(face.bbox[0] * sx)));
          const sy1 = Math.max(0, Math.min(H, Math.round(face.bbox[1] * sy)));
          const sx2 = Math.max(0, Math.min(W, Math.round(face.bbox[2] * sx)));
          const sy2 = Math.max(0, Math.min(H, Math.round(face.bbox[3] * sy)));
          return {
            ...face,
            bbox: [sx1, sy1, sx2, sy2] as [number, number, number, number],
            center: [Math.round((sx1 + sx2) / 2), Math.round((sy1 + sy2) / 2)] as [number, number],
            landmarks: lm,
          };
        });
      }
      return detected;
    }),
  );
  const allFaces = perFrameResults.flat();

  if (allFaces.length === 0) {
    return {
      ok: false, faces: [], framesScanned: validFrames.length, unionBbox: null,
      source: "error", ms: Date.now() - t0,
      error: "rekognition_zero_faces",
    };
  }

  // Cluster faces across frames by center distance (same person seen in
  // 2 frames -> 1 cluster; identical to v129.21 behaviour).
  const PAIR_RADIUS_PX = Math.max(40, Math.min(W, H) * 0.08);
  const clusters: MediaPipeFace[][] = [];
  for (const f of allFaces) {
    let placed = false;
    for (const c of clusters) {
      const rep = c[0];
      const dx = rep.center[0] - f.center[0];
      const dy = rep.center[1] - f.center[1];
      if (Math.hypot(dx, dy) <= PAIR_RADIUS_PX) { c.push(f); placed = true; break; }
    }
    if (!placed) clusters.push([f]);
  }

  const mergedFaces: MediaPipeFace[] = clusters.map((cluster) => {
    const xs1 = cluster.map((f) => f.bbox[0]);
    const ys1 = cluster.map((f) => f.bbox[1]);
    const xs2 = cluster.map((f) => f.bbox[2]);
    const ys2 = cluster.map((f) => f.bbox[3]);
    const ux1 = Math.min(...xs1);
    const uy1 = Math.min(...ys1);
    const ux2 = Math.max(...xs2);
    const uy2 = Math.max(...ys2);
    // v157 — Cluster-Pad auf 0. Bei v156 Anchor-First wird genau 1 Frame an
    // AWS gesendet; ein Cluster enthält damit max. 1 Detection → die +10 %
    // brachten nur Pixel-Bleed in Hals/Schulter. Tight-Sizing übernimmt jetzt
    // der Geometry-Gate in plate-face-detect.ts (v157).
    const padX = 0;
    const padY = 0;
    const x1 = Math.max(0, ux1 - padX);
    const y1 = Math.max(0, uy1 - padY);
    const x2 = Math.min(W, ux2 + padX);
    const y2 = Math.min(H, uy2 + padY);
    const cxs = [...cluster].map((f) => f.center[0]).sort((a, b) => a - b);
    const cys = [...cluster].map((f) => f.center[1]).sort((a, b) => a - b);
    const medianCx = cxs[Math.floor(cxs.length / 2)];
    const medianCy = cys[Math.floor(cys.length / 2)];
    const avgConf = cluster.reduce((s, f) => s + f.confidence, 0) / cluster.length;
    // Prefer landmarks from the highest-confidence detection in the cluster.
    const best = [...cluster].sort((a, b) => b.confidence - a.confidence)[0];
    return {
      bbox: [x1, y1, x2, y2] as [number, number, number, number],
      center: [medianCx, medianCy] as [number, number],
      confidence: avgConf,
      landmarks: best.landmarks,
      frameSeen: cluster[0].frameSeen,
    };
  });

  mergedFaces.sort((a, b) => a.center[0] - b.center[0]);

  const ux1 = Math.min(...mergedFaces.map((f) => f.bbox[0]));
  const uy1 = Math.min(...mergedFaces.map((f) => f.bbox[1]));
  const ux2 = Math.max(...mergedFaces.map((f) => f.bbox[2]));
  const uy2 = Math.max(...mergedFaces.map((f) => f.bbox[3]));

  const ms = Date.now() - t0;
  console.log(
    `[face-detect/aws] rekognition ok plate=${W}x${H} frames=${validFrames.length} ` +
    `raw=${allFaces.length} merged=${mergedFaces.length} ms=${ms}`,
  );
  return {
    ok: true,
    faces: mergedFaces,
    framesScanned: validFrames.length,
    unionBbox: [ux1, uy1, ux2, uy2],
    source: "aws_rekognition",
    ms,
  };
}
