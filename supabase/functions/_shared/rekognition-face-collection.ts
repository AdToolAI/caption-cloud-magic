/**
 * rekognition-face-collection.ts (v349)
 * =====================================
 * Deterministic "which face belongs to which Cast & World character" lookup.
 *
 * Why this replaces CompareFaces
 * ------------------------------
 * The previous path (v274/v276) ran `CompareFaces(portrait → plate)` once per
 * character and ranked the resulting similarities with a Hungarian solver.
 * That is a *threshold* decision: two visually similar siblings routinely land
 * on the same slot, and the observed score matrix was flat (all 0.93), i.e.
 * carried no discriminative signal at all. Result: speaker 1's audio animated
 * speaker 2's face.
 *
 * A Rekognition Face Collection turns this into a *lookup*:
 *   1. Each character portrait is indexed ONCE via `IndexFaces` with
 *      `ExternalImageId = <brand_character_id>` → a stable `FaceId`.
 *   2. For a rendered frame we call `IndexFaces` on the frame itself. AWS
 *      returns one `FaceRecord` per detected face, each with its own
 *      `FaceId` AND `BoundingBox`.
 *   3. `SearchFaces(FaceId=<frame face>)` inside the same collection returns
 *      the nearest indexed neighbours — the portraits — with their
 *      `ExternalImageId`. That is the character id, biometrically matched,
 *      with no cropping and no per-pair threshold ranking.
 *   4. The temporary frame faces are deleted again via `DeleteFaces`.
 *
 * Two AWS calls per frame plus one search per detected face — cheaper than the
 * N CompareFaces calls it replaces, and the box↔character link comes straight
 * from AWS instead of being re-derived by IoU.
 */

import { probeImageDims, normToPixels, isPlausibleFaceBox } from "./rek-image-space.ts";


const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/;
const DEFAULT_REKOGNITION_REGION = "eu-central-1";

function resolveRegion(): string {
  const override = (Deno.env.get("REKOGNITION_REGION") ?? "").trim();
  if (override && AWS_REGION_PATTERN.test(override)) return override;
  const raw = (Deno.env.get("AWS_REGION") ?? "").trim();
  if (raw && AWS_REGION_PATTERN.test(raw)) return raw;
  return DEFAULT_REKOGNITION_REGION;
}

const REGION = resolveRegion();
const HOST = `rekognition.${REGION}.amazonaws.com`;
const ENDPOINT = `https://${HOST}/`;
const ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";

const CALL_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 12_000;

/** Minimum Rekognition similarity (0..100) to accept a frame face → portrait. */
export const COLLECTION_MATCH_MIN = 80;
/**
 * Minimum gap between the best and the second-best character for a frame face.
 * Siblings score high against each other; without a margin the "best" match is
 * a coin flip. Below this the face is reported as ambiguous, never guessed.
 */
export const COLLECTION_MARGIN_MIN = 4;

export const FACE_COLLECTION_TAG = "v349-rekognition-face-collection";

// ────────────────────────── SigV4 ──────────────────────────

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

async function signingKey(secret: string, dateStamp: string) {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, "rekognition");
  return await hmac(kService, "aws4_request");
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

/** Raw signed Rekognition call. Throws on transport failure, never on HTTP 4xx. */
async function rekCall(target: string, payload: unknown): Promise<Response> {
  if (!ACCESS_KEY || !SECRET_KEY) throw new Error("aws_credentials_missing");
  const body = JSON.stringify(payload);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${REGION}/rekognition/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const sigBytes = await hmac(await signingKey(SECRET_KEY, dateStamp), stringToSign);
  const signature = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return await withTimeout(
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Date": amzDate,
        "X-Amz-Target": target,
        "Authorization":
          `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    }),
    CALL_TIMEOUT_MS,
    target.split(".").pop() ?? "rek",
  );
}

async function rekJson(target: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await rekCall(target, payload);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let type = "";
    try { type = String((JSON.parse(text) as { __type?: string })?.__type ?? ""); } catch { /* ignore */ }
    const err = new Error(`${target.split(".").pop()}_http_${res.status}:${type || text.slice(0, 160)}`);
    (err as Error & { awsType?: string }).awsType = type;
    throw err;
  }
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

// ────────────────────────── helpers ──────────────────────────

export function collectionIdForUser(userId: string): string {
  // Rekognition collection ids allow [a-zA-Z0-9_.\-]+ up to 255 chars.
  return `castworld-${String(userId).replace(/[^a-zA-Z0-9]/g, "")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await withTimeout(fetch(url), FETCH_TIMEOUT_MS, "img_fetch");
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  return (await sha256Hex(bytes)).slice(0, 32);
}

/** True when Rekognition can be used at all. */
export function faceCollectionAvailable(): boolean {
  return !!(ACCESS_KEY && SECRET_KEY);
}

// ────────────────────────── collection lifecycle ──────────────────────────

/** Idempotent. Returns true when the collection exists after the call. */
export async function ensureCollection(collectionId: string): Promise<boolean> {
  try {
    await rekJson("RekognitionService.CreateCollection", { CollectionId: collectionId });
    return true;
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/ResourceAlreadyExists/i.test(msg)) return true;
    console.warn(`[face-collection] createCollection ${collectionId} failed: ${msg}`);
    return false;
  }
}

export interface IndexPortraitResult {
  ok: boolean;
  faceIds: string[];
  portraitHash: string | null;
  reason?: string;
}

/**
 * Indexes ONE character portrait into the collection under
 * `ExternalImageId = characterId`. Existing faces for that character are
 * removed first so a re-index never leaves a stale biometric behind.
 */
export async function indexCharacterPortrait(params: {
  collectionId: string;
  characterId: string;
  portraitUrl: string;
  previousFaceIds?: string[];
}): Promise<IndexPortraitResult> {
  const { collectionId, characterId, portraitUrl } = params;
  const bytes = await fetchBytes(portraitUrl);
  if (!bytes) return { ok: false, faceIds: [], portraitHash: null, reason: "portrait_fetch_failed" };

  if (params.previousFaceIds?.length) {
    await deleteFaces(collectionId, params.previousFaceIds).catch(() => undefined);
  }

  try {
    const json = await rekJson("RekognitionService.IndexFaces", {
      CollectionId: collectionId,
      Image: { Bytes: bytesToBase64(bytes) },
      ExternalImageId: characterId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
      DetectionAttributes: [],
    });
    const records = Array.isArray(json.FaceRecords) ? json.FaceRecords : [];
    const faceIds = records
      .map((r) => String((r as { Face?: { FaceId?: string } })?.Face?.FaceId ?? ""))
      .filter(Boolean);
    if (faceIds.length === 0) {
      return { ok: false, faceIds: [], portraitHash: null, reason: "no_indexable_face_in_portrait" };
    }
    return { ok: true, faceIds, portraitHash: await hashBytes(bytes) };
  } catch (e) {
    return { ok: false, faceIds: [], portraitHash: null, reason: (e as Error).message };
  }
}

export async function deleteFaces(collectionId: string, faceIds: string[]): Promise<void> {
  if (!faceIds.length) return;
  await rekJson("RekognitionService.DeleteFaces", { CollectionId: collectionId, FaceIds: faceIds });
}

// ────────────────────────── frame identification ──────────────────────────

export interface IdentifiedFace {
  /** Row-major slot index (top→bottom, then left→right). */
  slot: number;
  /**
   * Pixel-space [x1,y1,x2,y2] — IM RAUM DES TATSÄCHLICH GESENDETEN BILDES
   * (siehe `IdentifyFrameResult.sourceDims`). v361: das ist NICHT
   * automatisch der Plate-Raum. Wer Plate-Pixel braucht, projiziert
   * `normBbox` explizit über `projectNormBox`.
   */
  bbox: [number, number, number, number];
  /** v361 — normalisierte Box [l,t,r,b] in 0..1 des gesendeten Bildes. */
  normBbox: [number, number, number, number];
  /** Normalised centre [x,y] in 0..1. */
  normCenter: [number, number];
  characterId: string | null;
  similarity: number | null;
  /** Gap to the runner-up character; null when there was none. */
  margin: number | null;
  ambiguous: boolean;
}

export interface IdentifyFrameResult {
  ok: boolean;
  method: typeof FACE_COLLECTION_TAG;
  faces: IdentifiedFace[];
  /** characterId → face (only unambiguous, bijective assignments). */
  byCharacter: Record<string, IdentifiedFace>;
  detectedCount: number;
  resolvedCount: number;
  /** characterIds that appeared as the best match for more than one face. */
  duplicateCharacterIds: string[];
  /** v361 — Raum, in dem `bbox` gilt. */
  sourceDims: { width: number; height: number };
  /** v361 — kamen die Dimensionen aus den Bildbytes oder vom Aufrufer? */
  dimsSource: "probed" | "caller";
  reason?: string;
  msTotal: number;
}

/**
 * Identifies every face in a frame against the collection.
 *
 * `knownCharacterIds` scopes the search: matches to characters that are not
 * part of this scene are ignored instead of stealing a slot.
 *
 * v361 — `frameWidth`/`frameHeight` sind nur noch ein FALLBACK. Die
 * Detektionsdimensionen werden aus den Bildbytes gelesen, weil Rekognition
 * relativ zum gesendeten Bild normalisiert. Alles andere erzeugt
 * systematisch verschobene Boxen (Szene 89c5e01c, 01.08.2026).
 */
export async function identifyFacesInFrame(params: {
  collectionId: string;
  imageUrl?: string;
  imageBytes?: Uint8Array;
  /** Fallback-Dimensionen, falls die Bytes nicht sondierbar sind. */
  frameWidth?: number;
  frameHeight?: number;
  knownCharacterIds: string[];
  maxFaces?: number;
}): Promise<IdentifyFrameResult> {
  const t0 = Date.now();
  const base: IdentifyFrameResult = {
    ok: false,
    method: FACE_COLLECTION_TAG,
    faces: [],
    byCharacter: {},
    detectedCount: 0,
    resolvedCount: 0,
    duplicateCharacterIds: [],
    sourceDims: {
      width: Math.max(1, Math.round(params.frameWidth ?? 0)),
      height: Math.max(1, Math.round(params.frameHeight ?? 0)),
    },
    dimsSource: "caller",
    msTotal: 0,
  };
  if (!faceCollectionAvailable()) {
    return { ...base, reason: "aws_credentials_missing", msTotal: Date.now() - t0 };
  }

  const bytes = params.imageBytes ?? (params.imageUrl ? await fetchBytes(params.imageUrl) : null);
  if (!bytes) return { ...base, reason: "frame_fetch_failed", msTotal: Date.now() - t0 };

  // v361 — Koordinatenvertrag: Detektionsraum = Raum der gesendeten Bytes.
  const probed = probeImageDims(bytes);
  const dimsSource: "probed" | "caller" = probed ? "probed" : "caller";
  const W = Math.max(1, Math.round(probed?.width ?? params.frameWidth ?? 1024));
  const H = Math.max(1, Math.round(probed?.height ?? params.frameHeight ?? 1024));
  if (
    probed &&
    Number.isFinite(Number(params.frameWidth)) &&
    Number(params.frameWidth) > 0 &&
    (Math.abs(probed.width - Number(params.frameWidth)) > 2 ||
      Math.abs(probed.height - Number(params.frameHeight)) > 2)
  ) {
    console.warn(
      `[face-collection] v361_dims_mismatch caller=${params.frameWidth}x${params.frameHeight} ` +
      `probed=${probed.width}x${probed.height} — using probed (Rekognition normalises to the sent image)`,
    );
  }
  base.sourceDims = { width: W, height: H };
  base.dimsSource = dimsSource;
  const known = new Set(params.knownCharacterIds.filter(Boolean));

  // 1) Index the frame's faces temporarily — this yields FaceId + BoundingBox
  //    in one call, so the box↔identity link comes from AWS itself.
  const tempExternalId = `probe-${crypto.randomUUID()}`;
  let records: Array<{ Face?: { FaceId?: string; BoundingBox?: Record<string, number>; Confidence?: number } }> = [];
  try {
    const json = await rekJson("RekognitionService.IndexFaces", {
      CollectionId: params.collectionId,
      Image: { Bytes: bytesToBase64(bytes) },
      ExternalImageId: tempExternalId,
      MaxFaces: Math.max(1, Math.min(10, params.maxFaces ?? 8)),
      QualityFilter: "NONE",
      DetectionAttributes: [],
    });
    records = Array.isArray(json.FaceRecords) ? json.FaceRecords as typeof records : [];
  } catch (e) {
    return { ...base, reason: `index_frame_failed:${(e as Error).message}`, msTotal: Date.now() - t0 };
  }

  const tempFaceIds = records
    .map((r) => String(r?.Face?.FaceId ?? ""))
    .filter(Boolean);

  try {
    const entries = records
      .map((r) => {
        const bb = r?.Face?.BoundingBox;
        const faceId = String(r?.Face?.FaceId ?? "");
        if (!bb || !faceId) return null;
        const left = Number(bb.Left ?? 0);
        const top = Number(bb.Top ?? 0);
        const width = Number(bb.Width ?? 0);
        const height = Number(bb.Height ?? 0);
        if (!(width > 0 && height > 0)) return null;
        return { faceId, left, top, width, height };
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
      // Row-major ordering, matching the rest of the pipeline.
      .sort((a, b) => {
        const dy = (a.top + a.height / 2) - (b.top + b.height / 2);
        if (Math.abs(dy) > 0.1) return dy;
        return (a.left + a.width / 2) - (b.left + b.width / 2);
      });

    // 2) One SearchFaces per detected face — nearest indexed portraits.
    const searched = await Promise.all(entries.map(async (e) => {
      try {
        const json = await rekJson("RekognitionService.SearchFaces", {
          CollectionId: params.collectionId,
          FaceId: e.faceId,
          FaceMatchThreshold: Math.max(0, COLLECTION_MATCH_MIN - 20),
          MaxFaces: 5,
        });
        const matches = Array.isArray(json.FaceMatches) ? json.FaceMatches : [];
        const scored: Array<{ characterId: string; similarity: number }> = [];
        for (const m of matches) {
          const rec = m as { Similarity?: number; Face?: { ExternalImageId?: string } };
          const ext = String(rec?.Face?.ExternalImageId ?? "");
          const sim = Number(rec?.Similarity ?? 0);
          if (!ext || !known.has(ext) || !Number.isFinite(sim)) continue;
          const prev = scored.find((s) => s.characterId === ext);
          if (prev) { prev.similarity = Math.max(prev.similarity, sim); continue; }
          scored.push({ characterId: ext, similarity: sim });
        }
        scored.sort((a, b) => b.similarity - a.similarity);
        return scored;
      } catch (err) {
        console.warn(`[face-collection] searchFaces failed: ${(err as Error).message}`);
        return [] as Array<{ characterId: string; similarity: number }>;
      }
    }));

    const faces: IdentifiedFace[] = entries.map((e, i) => {
      const normBbox: [number, number, number, number] = [
        e.left,
        e.top,
        e.left + e.width,
        e.top + e.height,
      ];
      const [x1, y1, x2, y2] = normToPixels(normBbox, { width: W, height: H });
      const scored = searched[i];
      const best = scored[0] ?? null;
      const second = scored[1] ?? null;
      const margin = best && second ? Number((best.similarity - second.similarity).toFixed(2)) : null;
      const strong = !!best && best.similarity >= COLLECTION_MATCH_MIN;
      const clear = margin === null || margin >= COLLECTION_MARGIN_MIN;
      return {
        slot: i,
        bbox: [x1, y1, x2, y2] as [number, number, number, number],
        normBbox: normBbox.map((v) => Number(v.toFixed(5))) as [number, number, number, number],
        normCenter: [
          Number((e.left + e.width / 2).toFixed(4)),
          Number((e.top + e.height / 2).toFixed(4)),
        ] as [number, number],
        characterId: strong && clear ? best!.characterId : null,
        similarity: best ? Number(best.similarity.toFixed(2)) : null,
        margin,
        ambiguous: !!best && (!strong || !clear),
      };
    })
      // v361 — physikalisch unmögliche Boxen verwerfen. Eine 22x13-px-Box auf
      // einer 1928-px-Plate ist keine Fehldetektion, sondern das Symptom
      // einer kaputten Rücktransformation. Sie darf nie einen Crop steuern.
      .filter((f) => {
        const plausible = isPlausibleFaceBox(f.bbox, { width: W, height: H });
        if (!plausible) {
          console.warn(
            `[face-collection] v361_implausible_box_dropped bbox=[${f.bbox.join(",")}] ` +
            `space=${W}x${H} char=${f.characterId ?? "-"}`,
          );
        }
        return plausible;
      })
      .map((f, i) => ({ ...f, slot: i }));

    // 3) Bijection guard: a character may own at most one face. When the same
    //    character wins two faces (the "character rendered twice" case) the
    //    weaker one is dropped and the collision is reported — the caller
    //    turns that into a re-render, never into a guess.
    const bestByChar = new Map<string, IdentifiedFace>();
    const duplicates = new Set<string>();
    for (const f of faces) {
      if (!f.characterId) continue;
      const prev = bestByChar.get(f.characterId);
      if (!prev) { bestByChar.set(f.characterId, f); continue; }
      duplicates.add(f.characterId);
      const loser = (f.similarity ?? 0) > (prev.similarity ?? 0) ? prev : f;
      const winner = loser === prev ? f : prev;
      bestByChar.set(f.characterId, winner);
      loser.characterId = null;
      loser.ambiguous = true;
    }

    const byCharacter: Record<string, IdentifiedFace> = {};
    for (const [cid, face] of bestByChar) byCharacter[cid] = face;

    return {
      ok: true,
      method: FACE_COLLECTION_TAG,
      faces,
      byCharacter,
      detectedCount: faces.length,
      resolvedCount: bestByChar.size,
      duplicateCharacterIds: [...duplicates],
      sourceDims: { width: W, height: H },
      dimsSource,
      msTotal: Date.now() - t0,
    };
  } finally {
    // Never leave probe faces behind — they would pollute later searches.
    if (tempFaceIds.length) {
      await deleteFaces(params.collectionId, tempFaceIds).catch((e) =>
        console.warn(`[face-collection] temp cleanup failed: ${(e as Error).message}`)
      );
    }
  }
}
