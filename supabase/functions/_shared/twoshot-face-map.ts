/**
 * twoshot-face-map — shared face detection + character-identity resolution
 * for any Sync.so caller that needs to disambiguate which face each audio
 * segment should drive.
 *
 * Originally inlined inside `compose-twoshot-lipsync` (v4, 2-speaker only,
 * `side: "left"|"right"`); extracted here so `compose-dialog-segments`
 * (v5 Segments-API) can target the right face per segment.
 *
 * **Stage 3-Speaker (May 31 2026):** generalised from `side` (2 slots) to
 * `slotIndex` (N slots, 0..N-1, sorted by ascending x of the face center).
 * The `side` field remains as a derived backwards-compat alias so any
 * still-cached v5/v4 entry continues to work, and the legacy v4 inline
 * implementation in `compose-twoshot-lipsync` is untouched.
 *
 * Pipeline:
 *   1. Read cache from `audio_plan.twoshot.faceMap`. If complete (positions
 *      + identities) → migrate to slotIndex if needed, return.
 *   2. Resolve character_id → portrait_url via `brand_characters`.
 *   3. Ask Gemini Vision for face boxes on the scene anchor.
 *   4. Ask Gemini Vision to identity-match each box against the portraits
 *      (per-slot assignments).
 *   5. Persist back to `audio_plan.twoshot.faceMap` so retries are free.
 *
 * Returns null on any unrecoverable failure — callers fall back to a
 * heuristic split (left=spk0, right=spkN-1, evenly spaced in between).
 */

export type FaceSide = "left" | "center" | "right";

export interface FaceMapFace {
  /** 0..N-1, sorted by ascending x. Authoritative slot identifier. */
  slotIndex: number;
  /** Human-readable label (`left`, `center-1`, `center-2`, …, `right`). */
  slotLabel?: string;
  /** Backwards-compat alias derived from slotIndex when N≤2. */
  side?: FaceSide;
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

/** Derive a friendly slot label given the slot index and total slot count. */
function labelForSlot(slotIndex: number, total: number): string {
  if (total <= 1) return "solo";
  if (slotIndex === 0) return "left";
  if (slotIndex === total - 1) return "right";
  if (total === 3) return "center";
  return `center-${slotIndex}`;
}

/** Derive the legacy `side` field for N≤2 (kept for backwards compat). */
function sideForSlot(slotIndex: number, total: number): FaceSide | undefined {
  if (total <= 1) return "left";
  if (total === 2) return slotIndex === 0 ? "left" : "right";
  // For N≥3 the binary side concept is meaningless — leave undefined.
  return undefined;
}

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

/**
 * Probe an MP4 for its visual width/height by walking the ISO BMFF box tree
 * until we hit the first `tkhd` whose matrix-resolved (width, height) fields
 * are non-zero (= a visual track). Pure TypeScript, no ffmpeg dependency.
 *
 * Reads up to ~768 KiB. Returns null if the file isn't MP4 or the moov box
 * sits past the read window — callers fall back to DEFAULT_DIMS.
 */
export async function probeMp4Dims(
  url: string,
): Promise<{ width: number; height: number } | null> {
  // Phase A: head-range (works for fast-start MP4s with `moov` near the top).
  // Phase B: tail-range (Hailuo/Replicate often place `moov` at end of file).
  // If both fail callers fall back to default dims — same behaviour as before.
  const tkhdParse = (buf: Uint8Array): { width: number; height: number } | null => {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const readBoxSize = (off: number) => {
      if (off + 8 > buf.length) return null;
      const size = dv.getUint32(off);
      const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
      return { size, type, headerLen: size === 1 ? 16 : 8 };
    };
    const parseTkhd = (off: number, size: number): { w: number; h: number } | null => {
      if (size < 84) return null;
      const version = buf[off];
      const dynLen = version === 1 ? 32 : 20;
      const widthOff = off + 4 + dynLen + 8 + 8 + 36;
      if (widthOff + 8 > off + size) return null;
      const w = dv.getUint32(widthOff) / 65536;
      const h = dv.getUint32(widthOff + 4) / 65536;
      if (w > 0 && h > 0) return { w: Math.round(w), h: Math.round(h) };
      return null;
    };
    let bestDims: { w: number; h: number } | null = null;
    const visit = (start: number, end: number) => {
      let i = start;
      while (i + 8 <= end) {
        const box = readBoxSize(i);
        if (!box || box.size < 8 || i + box.size > end + 8) break;
        const childStart = i + box.headerLen;
        const childEnd = i + box.size;
        if (box.type === "moov" || box.type === "trak" || box.type === "mdia") {
          visit(childStart, Math.min(childEnd, buf.length));
        } else if (box.type === "tkhd") {
          const dims = parseTkhd(childStart, box.size - box.headerLen);
          if (dims && (!bestDims || dims.w * dims.h > bestDims.w * bestDims.h)) {
            bestDims = dims;
          }
        }
        i += box.size;
      }
    };
    visit(0, buf.length);
    if (bestDims) return { width: bestDims.w, height: bestDims.h };
    return null;
  };

  let phaseAStatus = "skipped";
  let phaseBStatus = "skipped";

  // Phase A — head range
  try {
    const resp = await fetch(url, {
      headers: { Range: "bytes=0-786431" },
      signal: AbortSignal.timeout(6_000),
    });
    phaseAStatus = `http_${resp.status}`;
    if (resp.ok || resp.status === 206) {
      const buf = new Uint8Array(await resp.arrayBuffer());
      const dims = tkhdParse(buf);
      if (dims) {
        console.log(
          `[twoshot-face-map] probe-result url=${url.slice(0, 80)} phaseA=${phaseAStatus}+hit phaseB=skipped dims=${dims.width}x${dims.height}`,
        );
        return dims;
      }
      phaseAStatus = `${phaseAStatus}+nomoov`;
    }
  } catch (e) {
    phaseAStatus = `error:${(e as Error)?.message?.slice(0, 40) ?? "unknown"}`;
  }

  // Phase B — tail range (last 512 KiB) for files with moov at the end
  try {
    const resp = await fetch(url, {
      headers: { Range: "bytes=-524288" },
      signal: AbortSignal.timeout(6_000),
    });
    phaseBStatus = `http_${resp.status}`;
    if (resp.ok || resp.status === 206) {
      const buf = new Uint8Array(await resp.arrayBuffer());
      const dims = tkhdParse(buf);
      if (dims) {
        console.log(
          `[twoshot-face-map] probe-result url=${url.slice(0, 80)} phaseA=${phaseAStatus} phaseB=${phaseBStatus}+hit dims=${dims.width}x${dims.height}`,
        );
        return dims;
      }
      phaseBStatus = `${phaseBStatus}+nomoov`;
    }
  } catch (e) {
    phaseBStatus = `error:${(e as Error)?.message?.slice(0, 40) ?? "unknown"}`;
  }

  // Phase C — signature scan fallback. Both box-walker phases failed (often
  // because the tail-range starts mid-box and the walker only descends from
  // offset 0). Scan the already-fetched tail buffer for the literal `tkhd`
  // 4-byte signature and read width/height relative to that offset. This is
  // the same defensive scan the legacy v4 pipeline uses.
  let phaseCStatus = "skipped";
  try {
    const resp = await fetch(url, {
      headers: { Range: "bytes=-1048575" },
      signal: AbortSignal.timeout(6_000),
    });
    phaseCStatus = `http_${resp.status}`;
    if (resp.ok || resp.status === 206) {
      const buf = new Uint8Array(await resp.arrayBuffer());
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const readU32 = (i: number) => dv.getUint32(i);
      const maxScan = Math.max(0, buf.length - 100);
      let best: { width: number; height: number } | null = null;
      for (let i = 0; i < maxScan; i++) {
        if (buf[i] !== 0x74 || buf[i + 1] !== 0x6b || buf[i + 2] !== 0x68 || buf[i + 3] !== 0x64) continue;
        // `tkhd` payload follows immediately after the 4-byte type marker.
        // version byte at i+4; width/height at offset 80 (v0) or 92 (v1)
        // from the start of `tkhd` data which is `i+4`. Each is fixed-point
        // 16.16 — divide by 65536. We try both layouts.
        for (const dyn of [20, 32]) {
          const widthOff = i + 4 + dyn + 8 + 8 + 36;
          if (widthOff + 8 > buf.length) continue;
          const w = readU32(widthOff) / 65536;
          const h = readU32(widthOff + 4) / 65536;
          if (w > 0 && h > 0 && w < 10000 && h < 10000) {
            const dims = { width: Math.round(w), height: Math.round(h) };
            if (!best || dims.width * dims.height > best.width * best.height) {
              best = dims;
            }
          }
        }
      }
      if (best) {
        console.log(
          `[twoshot-face-map] probe-result url=${url.slice(0, 80)} phaseA=${phaseAStatus} phaseB=${phaseBStatus} phaseC=${phaseCStatus}+sigscan dims=${best.width}x${best.height}`,
        );
        return best;
      }
      phaseCStatus = `${phaseCStatus}+notkhd`;
    }
  } catch (e) {
    phaseCStatus = `error:${(e as Error)?.message?.slice(0, 40) ?? "unknown"}`;
  }

  // Phase D — sample-entry scan. Some MP4 muxers (notably Hailuo) write a
  // `tkhd` with width=height=0 (transform-matrix only) and put the real
  // visual size in the AVC/HEVC visual sample entry inside `stsd`. Scan the
  // already-fetched tail for `avc1`/`avc3`/`hvc1`/`hev1` FourCCs and read
  // width@+32, height@+34 (uint16, big-endian) inside the sample entry.
  let phaseDStatus = "skipped";
  try {
    const resp = await fetch(url, {
      headers: { Range: "bytes=-1048575" },
      signal: AbortSignal.timeout(6_000),
    });
    phaseDStatus = `http_${resp.status}`;
    if (resp.ok || resp.status === 206) {
      const buf = new Uint8Array(await resp.arrayBuffer());
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const codecs = ["avc1", "avc3", "hvc1", "hev1", "vp09", "av01"];
      let best: { width: number; height: number } | null = null;
      const maxScan = Math.max(0, buf.length - 40);
      for (let i = 0; i < maxScan; i++) {
        const fourcc = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
        if (!codecs.includes(fourcc)) continue;
        // Visual sample entry layout: 6 reserved + 2 data_ref_index + 16 pre-defined/reserved + 2 width + 2 height
        // So width is at fourcc_offset + 4 (skip fourcc) + 24 = +28? Actually fourcc IS at the
        // start of the entry body (after entry size). Width is at +32 from entry-size start,
        // i.e. +28 from fourcc start. Try both common offsets.
        for (const off of [24, 28, 32]) {
          if (i + off + 4 > buf.length) continue;
          const w = dv.getUint16(i + off, false);
          const h = dv.getUint16(i + off + 2, false);
          if (w >= 64 && h >= 64 && w <= 8192 && h <= 8192) {
            const dims = { width: w, height: h };
            if (!best || dims.width * dims.height > best.width * best.height) {
              best = dims;
            }
          }
        }
      }
      if (best) {
        console.log(
          `[twoshot-face-map] probe-result url=${url.slice(0, 80)} phaseA=${phaseAStatus} phaseB=${phaseBStatus} phaseC=${phaseCStatus} phaseD=${phaseDStatus}+sampleentry dims=${best.width}x${best.height}`,
        );
        return best;
      }
      phaseDStatus = `${phaseDStatus}+nosampleentry`;
    }
  } catch (e) {
    phaseDStatus = `error:${(e as Error)?.message?.slice(0, 40) ?? "unknown"}`;
  }

  console.log(
    `[twoshot-face-map] probe-result url=${url.slice(0, 80)} phaseA=${phaseAStatus} phaseB=${phaseBStatus} phaseC=${phaseCStatus} phaseD=${phaseDStatus} dims=null`,
  );
  return null;
}


async function askGeminiForFaces(
  anchorUrl: string,
  expectedCount: number,
  lovableKey: string,
): Promise<{ faces: any[] } | null> {
  try {
    const want = Math.max(1, Math.min(8, expectedCount || 2));
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
                  `You see a scene frame that should contain about ${want} human face(s). ` +
                  "Return STRICT JSON only — no prose, no markdown fences. " +
                  "Schema: {\"faces\":[{\"slot\":<int>,\"center\":[nx,ny],\"bbox\":[nx1,ny1,nx2,ny2]}]}. " +
                  "Coordinates MUST be NORMALIZED 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
                  "'slot' is the index after sorting all visible faces by ascending normalized x (left-most face = slot 0, right-most face = slot N-1). " +
                  "Return EVERY visible human face. If none, return empty faces array.",
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

interface IdentityAssignment {
  slot: number;
  characterId: string | null;
}

async function askGeminiForIdentityMatch(
  anchorUrl: string,
  characters: Array<{ characterId: string; portraitUrl: string }>,
  totalSlots: number,
  lovableKey: string,
): Promise<{ assignments: IdentityAssignment[]; confidence?: number } | null> {
  if (!characters.length || totalSlots < 2) return null;
  try {
    const ids = characters.map((c) => c.characterId);
    const content: any[] = [
      {
        type: "text",
        text:
          `The FIRST image is a scene with up to ${totalSlots} visible people. ` +
          "Slots are numbered 0..N-1 after sorting faces left-to-right by ascending horizontal position " +
          "(slot 0 = LEFT-MOST face, slot " + (totalSlots - 1) + " = RIGHT-MOST face). " +
          "The remaining images are reference portraits, in this order: " +
          ids.map((id, i) => `(${i + 1}) ${id}`).join(", ") + ". " +
          "For EACH slot in the scene, identify which reference portrait matches by facial identity. " +
          "Return STRICT JSON only — no prose, no markdown fences. " +
          "Schema: {\"assignments\":[{\"slot\":<int>,\"characterId\":\"<id or null>\"}],\"confidence\":<0..1>}. " +
          "Use ONLY ids from this list: " + ids.join(", ") + ". " +
          "Never assign the same id to two different slots. " +
          "If a slot's identity is uncertain, use null for that characterId.",
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
    const sanitizeId = (v: any): string | null => {
      const s = v ? String(v).toLowerCase().trim() : "";
      return s && allowed.has(s) ? s : null;
    };
    const assignments: IdentityAssignment[] = [];
    const seen = new Set<string>();
    // Preferred new schema.
    if (Array.isArray(parsed?.assignments)) {
      for (const a of parsed.assignments) {
        const slot = Number(a?.slot);
        if (!Number.isFinite(slot) || slot < 0 || slot >= totalSlots) continue;
        const cid = sanitizeId(a?.characterId);
        if (cid && seen.has(cid)) {
          assignments.push({ slot, characterId: null });
        } else {
          if (cid) seen.add(cid);
          assignments.push({ slot, characterId: cid });
        }
      }
    } else {
      // Backwards-compat: old `{left, right}` schema (2-speaker only).
      const left = sanitizeId(parsed?.left);
      const right = sanitizeId(parsed?.right);
      if (left) {
        seen.add(left);
        assignments.push({ slot: 0, characterId: left });
      }
      if (right && right !== left) {
        seen.add(right);
        assignments.push({ slot: 1, characterId: right });
      }
    }
    const c = Number(parsed?.confidence);
    return {
      assignments,
      confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve brand_characters.portrait_url for each character_id.
 *
 * v184 — accepts every id shape the composer uses:
 *   - `brand_characters.id` (UUID)
 *   - `lib:<uuid>` / `catalog:<uuid>` / `preset:<uuid>` prefixed UUIDs
 *   - `outfit:<lookId>` (resolved via `avatar_outfit_looks.avatar_id`)
 *   - legacy lowercase name-slug (kept for back-compat with older scenes)
 *
 * The returned `characterId` is always the CANONICAL id we received (so the
 * caller can look it up again), while `portraitUrl` is the resolved image.
 */
export async function resolveCharacterPortraits(
  supabase: any,
  userId: string,
  characterIds: Array<string | null | undefined>,
): Promise<Array<{ characterId: string; portraitUrl: string }>> {
  const uniqRaw = Array.from(
    new Set(
      characterIds
        .map((s) => String(s ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (!uniqRaw.length) return [];

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const stripPrefix = (id: string): string => id.replace(/^(lib|catalog|preset):/i, "").trim();

  // Classify each id.
  type Entry = {
    raw: string;
    kind: "uuid" | "outfit" | "slug";
    key: string; // uuid for uuid/outfit, slug for slug
  };
  const entries: Entry[] = uniqRaw.map((raw) => {
    if (/^outfit:/i.test(raw)) {
      return { raw, kind: "outfit", key: raw.slice("outfit:".length).trim() };
    }
    const stripped = stripPrefix(raw);
    if (uuidRe.test(stripped)) {
      return { raw, kind: "uuid", key: stripped.toLowerCase() };
    }
    return { raw, kind: "slug", key: raw.toLowerCase().replace(/\s+/g, "-") };
  });

  const uuidTargets = new Set<string>();
  entries.forEach((e) => {
    if (e.kind === "uuid") uuidTargets.add(e.key);
  });

  // Resolve outfit lookIds → avatar UUIDs first, so we can query by uuid.
  const outfitEntries = entries.filter((e) => e.kind === "outfit");
  const outfitLookToAvatar = new Map<string, string>();
  if (outfitEntries.length > 0) {
    try {
      const lookIds = outfitEntries.map((e) => e.key);
      const { data: looks } = await supabase
        .from("avatar_outfit_looks")
        .select("id, avatar_id")
        .in("id", lookIds);
      if (Array.isArray(looks)) {
        for (const row of looks) {
          const lookId = String((row as any)?.id ?? "").toLowerCase();
          const avatarId = String((row as any)?.avatar_id ?? "").toLowerCase();
          if (lookId && avatarId && uuidRe.test(avatarId)) {
            outfitLookToAvatar.set(lookId, avatarId);
            uuidTargets.add(avatarId);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    // Load all candidate rows in a single query. We fetch by id (uuid) AND
    // by user_id so slug-fallback still works for legacy scenes.
    const { data, error } = await supabase
      .from("brand_characters")
      .select("id, name, portrait_url, reference_image_url, user_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !Array.isArray(data)) return [];

    const byUuid = new Map<string, any>();
    const bySlug = new Map<string, any>();
    for (const row of data) {
      const rid = String((row as any)?.id ?? "").toLowerCase();
      if (rid) byUuid.set(rid, row);
      const slug = String((row as any)?.name ?? "").toLowerCase().trim().replace(/\s+/g, "-");
      if (slug && !bySlug.has(slug)) bySlug.set(slug, row);
    }

    const out: Array<{ characterId: string; portraitUrl: string }> = [];
    for (const e of entries) {
      let row: any | undefined;
      if (e.kind === "uuid") {
        row = byUuid.get(e.key);
      } else if (e.kind === "outfit") {
        const avatarUuid = outfitLookToAvatar.get(e.key);
        if (avatarUuid) row = byUuid.get(avatarUuid);
      } else {
        row = bySlug.get(e.key);
      }
      if (!row) continue;
      const url = String(row.portrait_url || row.reference_image_url || "").trim();
      if (url) out.push({ characterId: e.raw, portraitUrl: url });
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
    .sort((a, b) => a.center[0] - b.center[0]);
  const total = valid.length;
  const faces: FaceMapFace[] = valid.map((f, idx) => ({
    ...f,
    slotIndex: idx,
    slotLabel: labelForSlot(idx, total),
    side: sideForSlot(idx, total),
  }));
  return { faces, width: W, height: H };
}

/**
 * Lazy-migrate a cached face map from the legacy `side` schema (2 slots)
 * to the new `slotIndex` schema, so already-paid v5/v4 caches keep working.
 */
function migrateCachedFaces(cached: any): FaceMapFace[] | null {
  if (!Array.isArray(cached?.faces)) return null;
  const faces = cached.faces.filter((f: any) => f && Array.isArray(f.center));
  if (!faces.length) return null;
  // Already migrated.
  if (faces.every((f: any) => Number.isFinite(f.slotIndex))) {
    return faces as FaceMapFace[];
  }
  // Legacy: sort by x then derive slotIndex.
  const sorted = [...faces].sort(
    (a: any, b: any) => Number(a.center?.[0] ?? 0) - Number(b.center?.[0] ?? 0),
  );
  const total = sorted.length;
  return sorted.map((f: any, idx: number) => ({
    ...f,
    slotIndex: idx,
    slotLabel: labelForSlot(idx, total),
    side: sideForSlot(idx, total),
  }));
}

/**
 * Resolve (or build + cache) the face map for a Composer scene.
 *
 * @param anchorUrl - PNG/JPEG of the scene with all characters visible
 *                    (usually `reference_image_url` or `lock_reference_url`).
 * @param characters - Output of `resolveCharacterPortraits`. Pass `[]` to
 *                     skip identity match (face positions only).
 * @param expectedFaceCount - Hint for Gemini face detection (defaults to
 *                            characters.length). When N≥3, we pass this so
 *                            the prompt knows how many slots to expect.
 */
export async function resolveSceneFaceMap(args: {
  supabase: any;
  sceneId: string;
  anchorUrl: string | null | undefined;
  cachedFaceMap: any;
  lovableKey: string | undefined;
  characters: Array<{ characterId: string; portraitUrl: string }>;
  expectedFaceCount?: number;
}): Promise<FaceMap | null> {
  const { supabase, sceneId, anchorUrl, cachedFaceMap, lovableKey, characters } = args;
  const expected = Math.max(1, args.expectedFaceCount ?? characters.length ?? 2);

  // Cache validation + lazy migration.
  let migratedCache: FaceMapFace[] | null = null;
  if (cachedFaceMap) {
    migratedCache = migrateCachedFaces(cachedFaceMap);
  }
  const cacheLooksValid =
    !!migratedCache &&
    migratedCache.length >= 1 &&
    Number(cachedFaceMap.width) > 0 &&
    Number(cachedFaceMap.height) > 0;
  const needIdentities = characters.length >= 2;
  const cacheHasIdentities =
    cacheLooksValid &&
    migratedCache!.every(
      (f) => typeof f?.characterId === "string" && f.characterId.length > 0,
    );
  // Also require that we have at least as many cached faces as we now expect
  // (N-speaker cast added → recompose).
  const cacheCountSufficient =
    cacheLooksValid && migratedCache!.length >= Math.min(expected, characters.length || 1);
  if (cacheLooksValid && cacheCountSufficient && (!needIdentities || cacheHasIdentities)) {
    return {
      faces: migratedCache!,
      width: Number(cachedFaceMap.width),
      height: Number(cachedFaceMap.height),
      source: "cache",
    };
  }

  if (!lovableKey || !anchorUrl) return null;

  const dims = (await probeImageDims(anchorUrl)) ?? DEFAULT_DIMS;

  let norm: { faces: FaceMapFace[]; width: number; height: number };
  if (cacheLooksValid) {
    norm = {
      faces: migratedCache!,
      width: Number(cachedFaceMap.width),
      height: Number(cachedFaceMap.height),
    };
  } else {
    const raw = await askGeminiForFaces(anchorUrl, expected, lovableKey);
    if (!raw) return null;
    norm = normalizeFaces(raw, dims);
    if (norm.faces.length === 0) return null;
  }

  if (characters.length >= 2 && norm.faces.length >= 2) {
    const identity = await askGeminiForIdentityMatch(
      anchorUrl,
      characters,
      norm.faces.length,
      lovableKey,
    );
    if (identity) {
      const confidence = identity.confidence ?? 0.9;
      const slotToId = new Map<number, string>();
      for (const a of identity.assignments) {
        if (a.characterId) slotToId.set(a.slot, a.characterId);
      }
      norm.faces = norm.faces.map((f) => {
        const cid = slotToId.get(f.slotIndex);
        if (cid) {
          return {
            ...f,
            characterId: cid,
            matchConfidence: confidence,
            matchSource: "gemini-identity" as const,
          };
        }
        return { ...f, matchSource: "unresolved" as const };
      });
      // Infer leftover when exactly one slot is missing and exactly one
      // candidate character remains unassigned.
      const ids = characters.map((c) => c.characterId);
      const assigned = new Set(
        norm.faces.map((f) => f.characterId).filter(Boolean) as string[],
      );
      const missingIds = ids.filter((id) => !assigned.has(id));
      const missingSlots = norm.faces.filter((f) => !f.characterId);
      if (missingIds.length === 1 && missingSlots.length === 1) {
        const fillId = missingIds[0];
        norm.faces = norm.faces.map((f) =>
          f.characterId
            ? f
            : {
                ...f,
                characterId: fillId,
                matchConfidence: 0.5,
                matchSource: "gemini-inferred" as const,
              },
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
 *
 * Resolution priority:
 *   1. Identity match by `characterId` → exact face (robust to slot swap).
 *   2. Positional by `slotIndex === speakerIdx` (preserves left-to-right cast
 *      ordering when identity match was unreliable).
 *   3. Heuristic — evenly spaced along the horizontal midline.
 */
export function pickSpeakerCoordinates(args: {
  speakerIdx: number;
  characterId: string | null | undefined;
  faceMap: FaceMap | null;
  videoDims?: { width: number; height: number };
  /** Total speakers in the scene — used for the heuristic spacing fallback. */
  totalSpeakers?: number;
}): { coords: [number, number]; source: "identity" | "slot" | "heuristic" } | null {
  const { speakerIdx, characterId, faceMap, videoDims } = args;
  const W = videoDims?.width ?? faceMap?.width ?? DEFAULT_DIMS.width;
  const H = videoDims?.height ?? faceMap?.height ?? DEFAULT_DIMS.height;

  const scale = (
    p: [number, number],
    srcW: number,
    srcH: number,
  ): [number, number] => {
    const sx = srcW > 0 ? W / srcW : 1;
    const sy = srcH > 0 ? H / srcH : 1;
    return [Math.round(p[0] * sx), Math.round(p[1] * sy)];
  };

  // 1. Identity match (preferred, robust against L/R swap).
  if (characterId && faceMap?.faces?.length) {
    const wanted = String(characterId).toLowerCase();
    const hit = faceMap.faces.find(
      (f) => String(f.characterId ?? "").toLowerCase() === wanted,
    );
    if (hit?.center) {
      return {
        coords: scale(hit.center, faceMap.width, faceMap.height),
        source: "identity",
      };
    }
  }

  // 2. Positional by slotIndex (speaker N → face in slot N, sorted L→R).
  if (faceMap?.faces?.length) {
    const hit =
      faceMap.faces.find((f) => f.slotIndex === speakerIdx) ??
      faceMap.faces[Math.min(speakerIdx, faceMap.faces.length - 1)];
    if (hit?.center) {
      return {
        coords: scale(hit.center, faceMap.width, faceMap.height),
        source: "slot",
      };
    }
  }

  // 3. Heuristic — evenly spaced along the horizontal midline.
  const total = Math.max(
    args.totalSpeakers ?? 0,
    speakerIdx + 1,
    faceMap?.faces?.length ?? 0,
    2,
  );
  // Map slot index → x position: spread between 20% and 80% of the frame.
  const t = total === 1 ? 0.5 : 0.2 + (0.6 * speakerIdx) / (total - 1);
  const x = Math.round(W * t);
  const y = Math.round(H * 0.5);
  return { coords: [x, y], source: "heuristic" };
}
