/**
 * twoshot-face-map — shared face detection + character-identity resolution
 * for any Sync.so caller that needs to disambiguate which face each audio
 * segment should drive.
 *
 * Originally inlined inside `compose-twoshot-lipsync` (v4); extracted here
 * so `compose-dialog-segments` (v5 Segments-API) can target the right face
 * per segment instead of letting Sync.so pick whichever face it detects
 * first (which produced the "first character speaks the whole script"
 * regression — DB-confirmed on scene 386381bd…).
 *
 * Pipeline:
 *   1. Read cache from `audio_plan.twoshot.faceMap`. If complete (positions
 *      + identities) → return.
 *   2. Resolve character_id → portrait_url via `brand_characters` table.
 *   3. Ask Gemini Vision for face boxes on the scene anchor image.
 *   4. Ask Gemini Vision to identity-match each box against the portraits.
 *   5. Persist back to `audio_plan.twoshot.faceMap` so retries are free.
 *
 * Returns null on any unrecoverable failure — callers fall back to a
 * heuristic split (left half = speaker 0, right half = speaker 1).
 */

export interface FaceMapFace {
  side: "left" | "right";
  center: [number, number]; // pixel coords in anchor space
  bbox?: [number, number, number, number];
  normCenter?: [number, number]; // 0..1 normalized
  characterId?: string | null;
  matchConfidence?: number;
  matchSource?: "gemini-identity" | "gemini-inferred" | "unresolved";
}

export interface FaceMap {
  faces: FaceMapFace[];
  width: number;
  height: number;
  source: "cache" | "anchor" | "heuristic-fallback";
}

const DEFAULT_DIMS = { width: 1280, height: 720 };
const GEMINI_TIMEOUT_MS = 20_000;

/** Probe just the first ~256 KiB of a PNG/JPEG to read width/height. */
async function probeImageDims(
  url: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const resp = await fetch(url, {
      headers: { Range: "bytes=0-262143" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    // PNG: 8-byte sig + IHDR chunk → width@16, height@20
    if (
      buf.length > 24 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    ) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    // JPEG: scan SOF markers (0xFFC0..0xFFCF, skipping 0xFFC4/0xFFC8/0xFFCC)
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1];
        const isSof =
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        const segLen = (buf[i + 2] << 8) | buf[i + 3];
        if (isSof) {
          const h = (buf[i + 5] << 8) | buf[i + 6];
          const w = (buf[i + 7] << 8) | buf[i + 8];
          if (w > 0 && h > 0) return { width: w, height: h };
        }
        i += 2 + segLen;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function askGeminiForFaces(
  anchorUrl: string,
  lovableKey: string,
): Promise<{ faces: any[] } | null> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "You see a scene frame with one or two human faces. " +
                  "Return STRICT JSON only — no prose, no markdown fences. " +
                  "Schema: {\"faces\":[{\"side\":\"left\"|\"right\",\"center\":[nx,ny],\"bbox\":[nx1,ny1,nx2,ny2]}]}. " +
                  "Coordinates MUST be NORMALIZED 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
                  "'left' = the face whose center has the SMALLER normalized x. 'right' = the larger x. " +
                  "If only one face is visible, return one entry. If none, return empty faces array.",
              },
              { type: "image_url", image_url: { url: anchorUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return { faces: Array.isArray(parsed?.faces) ? parsed.faces : [] };
  } catch {
    return null;
  }
}

async function askGeminiForIdentityMatch(
  anchorUrl: string,
  characters: Array<{ characterId: string; portraitUrl: string }>,
  lovableKey: string,
): Promise<{ left?: string | null; right?: string | null; confidence?: number } | null> {
  if (!characters.length) return null;
  try {
    const ids = characters.map((c) => c.characterId);
    const content: any[] = [
      {
        type: "text",
        text:
          "The FIRST image is a scene with up to two visible people (one LEFT, one RIGHT). " +
          "The remaining images are reference portraits, in this order: " +
          ids.map((id, i) => `(${i + 1}) ${id}`).join(", ") + ". " +
          "Identify which reference portrait matches the LEFT person and which matches the RIGHT person by facial identity. " +
          "Return STRICT JSON only — no prose, no markdown fences. " +
          "Schema: {\"left\": \"<characterId or null>\", \"right\": \"<characterId or null>\", \"confidence\": <0..1>}. " +
          "Use ONLY ids from this list: " + ids.join(", ") + ". " +
          "Never assign the same id to both sides unless only one character was provided.",
      },
      { type: "image_url", image_url: { url: anchorUrl } },
      ...characters.map((c) => ({ type: "image_url", image_url: { url: c.portraitUrl } })),
    ];
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const allowed = new Set(ids.map((id) => id.toLowerCase()));
    const sanitize = (v: any): string | null => {
      const s = v ? String(v).toLowerCase().trim() : "";
      return s && allowed.has(s) ? s : null;
    };
    const left = sanitize(parsed?.left);
    const right = sanitize(parsed?.right);
    const c = Number(parsed?.confidence);
    return {
      left,
      right,
      confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : undefined,
    };
  } catch {
    return null;
  }
}

/** Resolve brand_characters.portrait_url for each character_id (slug). */
export async function resolveCharacterPortraits(
  supabase: any,
  userId: string,
  characterIds: Array<string | null | undefined>,
): Promise<Array<{ characterId: string; portraitUrl: string }>> {
  const uniq = Array.from(
    new Set(characterIds.map((s) => String(s ?? "").toLowerCase().trim()).filter(Boolean)),
  );
  if (!uniq.length) return [];
  try {
    const { data, error } = await supabase
      .from("brand_characters")
      .select("name, portrait_url, reference_image_url, user_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !Array.isArray(data)) return [];
    const out: Array<{ characterId: string; portraitUrl: string }> = [];
    for (const id of uniq) {
      const row = data.find((r: any) => {
        const slug = String(r?.name ?? "").toLowerCase().trim().replace(/\s+/g, "-");
        return slug === id;
      });
      if (!row) continue;
      const url = String(row.portrait_url || row.reference_image_url || "").trim();
      if (url) out.push({ characterId: id, portraitUrl: url });
    }
    return out;
  } catch {
    return [];
  }
}

function normalizeFaces(
  raw: { faces: any[] },
  realDims: { width: number; height: number },
): { faces: FaceMapFace[]; width: number; height: number } {
  const W = realDims.width;
  const H = realDims.height;
  const toPx = (n: number, axis: "x" | "y") => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    const isNorm = Math.abs(v) <= 1.5;
    const scaled = isNorm ? v * (axis === "x" ? W : H) : v;
    const max = axis === "x" ? W : H;
    return Math.round(Math.max(1, Math.min(max - 1, scaled)));
  };
  const valid = raw.faces
    .filter((f: any) => Array.isArray(f?.center) && f.center.length === 2)
    .map((f: any) => {
      const cx = toPx(f.center[0], "x");
      const cy = toPx(f.center[1], "y");
      const bb = Array.isArray(f.bbox) && f.bbox.length === 4
        ? [toPx(f.bbox[0], "x"), toPx(f.bbox[1], "y"), toPx(f.bbox[2], "x"), toPx(f.bbox[3], "y")] as [number, number, number, number]
        : undefined;
      return {
        center: [cx, cy] as [number, number],
        bbox: bb,
        normCenter: [Number(f.center[0]) || 0, Number(f.center[1]) || 0] as [number, number],
      };
    })
    .sort((a, b) => a.center[0] - b.center[0])
    .map((f, idx, arr) => ({
      ...f,
      side: (arr.length === 1 ? "left" : idx === 0 ? "left" : "right") as "left" | "right",
    }));
  return { faces: valid, width: W, height: H };
}

/**
 * Resolve (or build + cache) the face map for a Composer scene.
 *
 * @param anchorUrl - PNG/JPEG of the scene with all characters visible
 *                    (usually `reference_image_url` or `lock_reference_url`).
 * @param characters - Output of `resolveCharacterPortraits`. Pass `[]` to
 *                     skip identity match (face positions only).
 */
export async function resolveSceneFaceMap(args: {
  supabase: any;
  sceneId: string;
  anchorUrl: string | null | undefined;
  cachedFaceMap: any;
  lovableKey: string | undefined;
  characters: Array<{ characterId: string; portraitUrl: string }>;
}): Promise<FaceMap | null> {
  const { supabase, sceneId, anchorUrl, cachedFaceMap, lovableKey, characters } = args;

  const cacheLooksValid =
    cachedFaceMap &&
    Array.isArray(cachedFaceMap.faces) &&
    cachedFaceMap.faces.length >= 1 &&
    Number(cachedFaceMap.width) > 0 &&
    Number(cachedFaceMap.height) > 0;
  const needIdentities = characters.length >= 2;
  const cacheHasIdentities =
    cacheLooksValid &&
    cachedFaceMap.faces.every(
      (f: any) => typeof f?.characterId === "string" && f.characterId.length > 0,
    );
  if (cacheLooksValid && (!needIdentities || cacheHasIdentities)) {
    return { ...cachedFaceMap, source: "cache" } as FaceMap;
  }

  if (!lovableKey || !anchorUrl) return null;

  const dims = (await probeImageDims(anchorUrl)) ?? DEFAULT_DIMS;

  let norm: { faces: FaceMapFace[]; width: number; height: number };
  if (cacheLooksValid) {
    norm = {
      faces: cachedFaceMap.faces,
      width: Number(cachedFaceMap.width),
      height: Number(cachedFaceMap.height),
    };
  } else {
    const raw = await askGeminiForFaces(anchorUrl, lovableKey);
    if (!raw) return null;
    norm = normalizeFaces(raw, dims);
    if (norm.faces.length === 0) return null;
  }

  if (characters.length >= 2 && norm.faces.length >= 2) {
    const identity = await askGeminiForIdentityMatch(anchorUrl, characters, lovableKey);
    if (identity) {
      const { left, right, confidence } = identity;
      norm.faces = norm.faces.map((f) => {
        if (f.side === "left" && left) {
          return { ...f, characterId: left, matchConfidence: confidence ?? 0.9, matchSource: "gemini-identity" };
        }
        if (f.side === "right" && right) {
          return { ...f, characterId: right, matchConfidence: confidence ?? 0.9, matchSource: "gemini-identity" };
        }
        return { ...f, matchSource: "unresolved" as const };
      });
      // Infer leftover when exactly one side resolved + 2 candidates.
      const ids = characters.map((c) => c.characterId);
      const assigned = new Set(norm.faces.map((f) => f.characterId).filter(Boolean) as string[]);
      const missing = ids.filter((id) => !assigned.has(id));
      if (missing.length === 1) {
        norm.faces = norm.faces.map((f) =>
          f.characterId
            ? f
            : { ...f, characterId: missing[0], matchConfidence: 0.5, matchSource: "gemini-inferred" as const },
        );
      }
    }
  } else if (characters.length === 1 && norm.faces.length >= 1) {
    // Single character → first detected face is them.
    norm.faces = norm.faces.map((f, i) =>
      i === 0
        ? { ...f, characterId: characters[0].characterId, matchConfidence: 0.95, matchSource: "gemini-inferred" as const }
        : f,
    );
  }

  const result: FaceMap = { ...norm, source: "anchor" };
  try {
    const { data: row } = await supabase
      .from("composer_scenes")
      .select("audio_plan")
      .eq("id", sceneId)
      .single();
    const prevPlan = (row?.audio_plan ?? {}) as Record<string, unknown>;
    const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
    await supabase
      .from("composer_scenes")
      .update({
        audio_plan: {
          ...prevPlan,
          twoshot: {
            ...prevTwoshot,
            faceMap: {
              faces: result.faces,
              width: result.width,
              height: result.height,
              source: result.source,
            },
          },
        },
      })
      .eq("id", sceneId);
  } catch {
    /* cache write best-effort */
  }
  return result;
}

/**
 * Map a speaker (by character_id or pass index) to coordinates Sync.so can use.
 *
 * Returns null only when no face map and no fallback dims are available — the
 * caller should then omit per-segment coordinates entirely (and let Sync.so
 * auto-detect, which is at least no worse than what we send today).
 */
export function pickSpeakerCoordinates(args: {
  speakerIdx: number;
  characterId: string | null | undefined;
  faceMap: FaceMap | null;
  videoDims?: { width: number; height: number };
}): { coords: [number, number]; source: "identity" | "side" | "heuristic" } | null {
  const { speakerIdx, characterId, faceMap, videoDims } = args;
  const W = videoDims?.width ?? faceMap?.width ?? DEFAULT_DIMS.width;
  const H = videoDims?.height ?? faceMap?.height ?? DEFAULT_DIMS.height;

  // 1. Identity match (preferred, robust against L/R swap).
  if (characterId && faceMap?.faces?.length) {
    const wanted = String(characterId).toLowerCase();
    const hit = faceMap.faces.find(
      (f) => String(f.characterId ?? "").toLowerCase() === wanted,
    );
    if (hit?.center) {
      const scaleX = faceMap.width > 0 ? W / faceMap.width : 1;
      const scaleY = faceMap.height > 0 ? H / faceMap.height : 1;
      return {
        coords: [
          Math.round(hit.center[0] * scaleX),
          Math.round(hit.center[1] * scaleY),
        ],
        source: "identity",
      };
    }
  }

  // 2. Positional by side (speaker 0 = left, speaker 1 = right).
  if (faceMap?.faces?.length) {
    const wantSide: "left" | "right" = speakerIdx === 0 ? "left" : "right";
    const hit =
      faceMap.faces.find((f) => f.side === wantSide) ??
      faceMap.faces[Math.min(speakerIdx, faceMap.faces.length - 1)];
    if (hit?.center) {
      const scaleX = faceMap.width > 0 ? W / faceMap.width : 1;
      const scaleY = faceMap.height > 0 ? H / faceMap.height : 1;
      return {
        coords: [
          Math.round(hit.center[0] * scaleX),
          Math.round(hit.center[1] * scaleY),
        ],
        source: "side",
      };
    }
  }

  // 3. Pure heuristic — left-third / right-third of the frame.
  const x = speakerIdx === 0 ? Math.round(W * 0.3) : Math.round(W * 0.7);
  const y = Math.round(H * 0.5);
  return { coords: [x, y], source: "heuristic" };
}
