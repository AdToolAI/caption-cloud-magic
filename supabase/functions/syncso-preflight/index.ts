/**
 * syncso-preflight — v129.8
 *
 * Admin-only diagnostic: runs the 6 deterministic checks that cover
 * every known cause of Sync.so `generation_unknown_error`, WITHOUT
 * calling Sync.so /generate (no credits, no Wallet, no mutation).
 *
 * Checks:
 *   1. video_fetchable    — Range-GET 0-65535, Content-Type, Content-Length
 *   2. video_codec        — ftyp brand + first MP4 atom sanity
 *   3. audio_fetchable    — Range-GET 0-65535, Content-Type, Content-Length
 *   4. audio_format       — WAV/MP3/M4A header sniff + size sanity
 *   5. face_at_frame      — Gemini Vision face count on the video URL
 *   6. duration_match     — abs(video_duration - audio_duration) tolerance
 *
 * Body: { scene_id, pass_index? }
 * Output: { checks, verdict, first_blocker }
 *
 * Strictly read-only.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getGeminiApiKey(): string {
  return Deno.env.get("LOVABLE_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";
}

type Status = "pass" | "warn" | "fail" | "skip";

interface CheckResult {
  status: Status;
  note?: string;
  [k: string]: unknown;
}

const RANGE_HEAD = 65_535;
const ACCEPTED_VIDEO_BRANDS = new Set([
  "isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4A ",
]);

// ---------- Asset Range GET ----------
async function rangeFetch(url: string): Promise<{
  ok: boolean;
  http?: number;
  contentType?: string | null;
  contentLength?: number | null;
  bytes?: Uint8Array;
  acceptRanges?: string | null;
  error?: string;
}> {
  if (!url) return { ok: false, error: "empty_url" };
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { Range: `bytes=0-${RANGE_HEAD}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok && r.status !== 206 && r.status !== 200) {
      // consume body to avoid leak
      await r.arrayBuffer().catch(() => null);
      return {
        ok: false,
        http: r.status,
        contentType: r.headers.get("content-type"),
        contentLength: Number(r.headers.get("content-length") ?? 0) || null,
        error: `HTTP_${r.status}`,
      };
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    // Content-Range gives total when present, else content-length is partial
    const cr = r.headers.get("content-range"); // e.g. "bytes 0-65535/4823100"
    let total: number | null = Number(r.headers.get("content-length") ?? 0) || null;
    if (cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) total = Number(m[1]);
    }
    return {
      ok: true,
      http: r.status,
      contentType: r.headers.get("content-type"),
      contentLength: total,
      acceptRanges: r.headers.get("accept-ranges"),
      bytes: buf,
    };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

// ---------- MP4 ftyp + moov inspection ----------
function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function readAscii(b: Uint8Array, o: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i]);
  return s;
}

interface Mp4Info {
  ftyp_brand: string | null;
  compatible_brands: string[];
  has_moov_prefix: boolean;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  parse_error: string | null;
}

function parseMp4Head(b: Uint8Array): Mp4Info {
  const out: Mp4Info = {
    ftyp_brand: null,
    compatible_brands: [],
    has_moov_prefix: false,
    duration_s: null,
    width: null,
    height: null,
    parse_error: null,
  };
  try {
    if (b.length < 16) {
      out.parse_error = "buffer_too_small";
      return out;
    }
    let p = 0;
    while (p + 8 <= b.length) {
      const size = readU32(b, p);
      const type = readAscii(b, p + 4, 4);
      if (size < 8) break;
      if (type === "ftyp") {
        out.ftyp_brand = readAscii(b, p + 8, 4).trim();
        let q = p + 16;
        while (q + 4 <= Math.min(p + size, b.length)) {
          out.compatible_brands.push(readAscii(b, q, 4).trim());
          q += 4;
        }
      } else if (type === "moov") {
        out.has_moov_prefix = true;
        // Try parse mvhd for duration
        const moovEnd = Math.min(p + size, b.length);
        let q = p + 8;
        while (q + 8 <= moovEnd) {
          const s2 = readU32(b, q);
          const t2 = readAscii(b, q + 4, 4);
          if (s2 < 8) break;
          if (t2 === "mvhd" && q + 32 <= moovEnd) {
            const version = b[q + 8];
            const off = q + 12; // skip version+flags
            if (version === 0) {
              const timescale = readU32(b, off + 8);
              const duration = readU32(b, off + 12);
              if (timescale > 0) out.duration_s = duration / timescale;
            } else if (version === 1 && q + 44 <= moovEnd) {
              const timescale = readU32(b, off + 16);
              // 64-bit duration: take low 32 bits (sufficient for short clips)
              const duration = readU32(b, off + 24);
              if (timescale > 0) out.duration_s = duration / timescale;
            }
          }
          q += s2;
        }
      }
      p += size;
    }
  } catch (e) {
    out.parse_error = (e as Error)?.message ?? String(e);
  }
  return out;
}

// ---------- Audio sniff ----------
interface AudioInfo {
  format: "wav" | "mp3" | "m4a" | "ogg" | "webm" | "unknown";
  duration_s: number | null;
  bitrate_kbps: number | null;
  sniff_error: string | null;
}

function sniffAudio(b: Uint8Array, totalBytes: number | null): AudioInfo {
  const out: AudioInfo = { format: "unknown", duration_s: null, bitrate_kbps: null, sniff_error: null };
  if (b.length < 4) {
    out.sniff_error = "buffer_too_small";
    return out;
  }
  const h4 = readAscii(b, 0, 4);
  if (h4 === "RIFF" && b.length >= 44 && readAscii(b, 8, 4) === "WAVE") {
    out.format = "wav";
    // fmt chunk: bytesPerSec at offset 28 (PCM common case)
    const byteRate = b[28] | (b[29] << 8) | (b[30] << 16) | (b[31] << 24);
    if (byteRate > 0 && totalBytes) {
      // approximate: (totalBytes - 44 header) / byteRate
      out.duration_s = Math.max(0, (totalBytes - 44) / byteRate);
      out.bitrate_kbps = Math.round((byteRate * 8) / 1000);
    }
    return out;
  }
  // MP3: starts with ID3 tag or sync word 0xFF Ex/Fx
  if (h4.startsWith("ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) {
    out.format = "mp3";
    // Find first sync frame and parse bitrate
    let off = 0;
    if (h4.startsWith("ID3") && b.length >= 10) {
      const sz = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
      off = 10 + sz;
    }
    for (let i = off; i < Math.min(b.length - 4, off + 4096); i++) {
      if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
        const versionBits = (b[i + 1] >> 3) & 0x03;
        const bitrateIdx = (b[i + 2] >> 4) & 0x0f;
        // MPEG1 Layer III bitrate table (kbps)
        const v1l3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
        const v2l3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
        const table = versionBits === 0b11 ? v1l3 : v2l3;
        const br = table[bitrateIdx];
        if (br > 0) {
          out.bitrate_kbps = br;
          if (totalBytes) out.duration_s = Math.max(0, ((totalBytes - off) * 8) / (br * 1000));
        }
        break;
      }
    }
    return out;
  }
  if (h4 === "OggS") { out.format = "ogg"; return out; }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) { out.format = "webm"; return out; }
  // M4A: ftyp + brand contains M4A or mp42
  if (b.length >= 12 && readAscii(b, 4, 4) === "ftyp") {
    out.format = "m4a";
    return out;
  }
  out.sniff_error = "no_signature_match";
  return out;
}

// ---------- Face probe at frame ----------
async function probeFaceAtFrame(
  videoUrl: string,
  frameNumber: number | null,
  coord: [number, number] | null,
  wasInferred: boolean = false,
): Promise<CheckResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { status: "skip", note: "no_gemini_api_key", frame: frameNumber, coord, was_inferred: wasInferred };
  if (!videoUrl) return { status: "skip", note: "no_video_url", frame: frameNumber, coord, was_inferred: wasInferred };
  const question = coord && frameNumber != null
    ? `This is a short video clip. Around frame ${frameNumber} (≈${(frameNumber / 30).toFixed(2)}s), is there a single clearly visible human face near image coordinates x=${coord[0]}, y=${coord[1]}? Reply with EXACTLY one of: "yes_one_face_at_coord", "yes_but_not_at_coord", "multiple_faces", "no_face". No other text.`
    : `Count distinct human faces clearly visible in any frame of this short video clip. Reply with ONLY a single integer (0, 1, 2, ...). No words.`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: videoUrl } },
          ],
        }],
      }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      return { status: "skip", note: `gemini_http_${r.status}`, frame: frameNumber, coord, was_inferred: wasInferred, raw: body };
    }
    const txt: string = (body?.choices?.[0]?.message?.content ?? "").trim();
    if (coord && frameNumber != null) {
      const t = txt.toLowerCase();
      if (t.includes("yes_one_face_at_coord")) {
        return { status: "pass", verdict: "yes_one_face_at_coord", frame: frameNumber, coord, was_inferred: wasInferred };
      }
      if (t.includes("yes_but_not_at_coord")) {
        return { status: "fail", verdict: "yes_but_not_at_coord", frame: frameNumber, coord, was_inferred: wasInferred, note: "Face exists but not at the active_speaker_detection coordinate." };
      }
      if (t.includes("multiple_faces")) {
        return { status: "fail", verdict: "multiple_faces", frame: frameNumber, coord, was_inferred: wasInferred, note: "Multiple faces — Sync.so ASD with fixed coord may pick wrong subject." };
      }
      if (t.includes("no_face")) {
        return { status: "fail", verdict: "no_face", frame: frameNumber, coord, was_inferred: wasInferred, note: "No human face detected in the video — Sync.so cannot lipsync." };
      }
      return { status: "warn", verdict: "unparsed", frame: frameNumber, coord, was_inferred: wasInferred, raw_reply: txt.slice(0, 120) };
    } else {
      const m = txt.match(/\d+/);
      const n = m ? Number(m[0]) : null;
      if (n === 0) return { status: "fail", faces: 0, note: "No face in video.", was_inferred: wasInferred };
      if (n != null && n > 1) return { status: "warn", faces: n, note: `${n} faces — ambiguous for single-speaker lipsync.`, was_inferred: wasInferred };
      if (n === 1) return { status: "pass", faces: 1, was_inferred: wasInferred };
      return { status: "warn", faces: null, raw_reply: txt.slice(0, 120), was_inferred: wasInferred };
    }
  } catch (e) {
    return { status: "skip", note: `gemini_error_${(e as Error)?.message ?? String(e)}`, frame: frameNumber, coord, was_inferred: wasInferred };
  }
}

// ---------- Main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return json({ error: "unauthorized", detail: userErr?.message ?? null }, 401);
  }
  const userId = userData.user.id;

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const sceneId: string | undefined = body?.scene_id;
  const passIndex: number = Number.isInteger(body?.pass_index) ? body.pass_index : 0;
  if (!sceneId) return json({ error: "missing_scene_id" }, 400);

  // Resolve pass + dispatch (same chain as support-bundle)
  const { data: scene } = await admin
    .from("composer_scenes")
    .select("id, dialog_shots")
    .eq("id", sceneId)
    .maybeSingle();
  if (!scene) return json({ error: "scene_not_found" }, 404);
  const passes = scene.dialog_shots?.passes ?? [];
  const pass = passes[passIndex];
  if (!pass) return json({ error: "pass_not_found", available: passes.length }, 404);

  const providerJobId: string | null =
    pass.provider_job_id ?? pass.job_id ?? pass._v106_probe?.provider_job_id ?? null;
  let dispatch: any = null;
  if (providerJobId) {
    const { data: d } = await admin
      .from("syncso_dispatch_log")
      .select("*")
      .eq("job_id", providerJobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    dispatch = d;
  }

  const videoUrl: string =
    pass.payload_video_url ?? pass._v106_probe?.payload_video_url ?? dispatch?.video_url ?? pass.input_url ?? "";
  const audioUrl: string =
    pass.payload_audio_url ?? pass._v106_probe?.payload_audio_url ?? dispatch?.audio_url ?? pass.audio_url ?? "";

  // v129.9 — Also peek into dispatch.meta because the production write path
  // historically only stored ASD coords/frame inside meta.outbound_payload
  // and meta.v116_diag, leaving the top-level columns null. Without this
  // fallback the face probe SKIPped on every real failure.
  const meta: any = dispatch?.meta ?? {};
  const metaAsd: any = meta?.outbound_payload?.options?.active_speaker_detection ?? {};
  const metaV116: any = meta?.v116_diag ?? {};

  let frameNumber: number | null =
    dispatch?.frame_number
    ?? meta?.reference_frame_number
    ?? metaAsd?.frame_number
    ?? pass?.frame_number
    ?? pass?._v106_probe?.frame_number
    ?? null;
  let rawCoord =
    dispatch?.coords
    ?? metaAsd?.coordinates
    ?? metaV116?.coords_sent
    ?? meta?.coords
    ?? pass?.coords
    ?? pass?._v106_probe?.coords
    ?? null;
  let coord: [number, number] | null = null;
  if (Array.isArray(rawCoord) && rawCoord.length >= 2) coord = [Number(rawCoord[0]), Number(rawCoord[1])];

  // 1+2 video range + parse | 3+4 audio range — sequential video first so we
  // can infer frame/coord from parsed MP4 dims before running the face probe.
  const [vFetch, aFetch] = await Promise.all([
    rangeFetch(videoUrl),
    rangeFetch(audioUrl),
  ]);

  // v129.9 — Infer missing frame_number from parsed duration (mid-clip)
  // and missing coord from the preclip's output size (assume square center).
  let faceWasInferred = false;
  if ((frameNumber == null || coord == null) && vFetch.ok && vFetch.bytes) {
    const earlyInfo = parseMp4Head(vFetch.bytes);
    if (frameNumber == null && earlyInfo.duration_s != null) {
      frameNumber = Math.max(0, Math.floor(earlyInfo.duration_s * 30 / 2));
      faceWasInferred = true;
    }
    if (coord == null) {
      // Preclips are square; output size is encoded in meta.v116_diag.preclip_crop
      // when known. Fall back to a centered 256/256 (matches the legacy 512px
      // preclip canvas after the 720p safety floor — Gemini just needs a
      // ballpark for the spatial question).
      const outputSize: number | null =
        Number(metaV116?.preclip_crop?.outputSize)
        || Number(meta?.v1291_diag?.preclip_crop?.outputSize)
        || null;
      const c = outputSize && Number.isFinite(outputSize) ? Math.floor(outputSize / 2) : 256;
      coord = [c, c];
      faceWasInferred = true;
    }
  }

  const faceProbe = await probeFaceAtFrame(videoUrl, frameNumber, coord, faceWasInferred);

  // video_fetchable
  const video_fetchable: CheckResult = vFetch.ok
    ? {
        status: (vFetch.contentType ?? "").startsWith("video/") || vFetch.contentType === "application/octet-stream"
          ? "pass"
          : "warn",
        http: vFetch.http,
        content_type: vFetch.contentType,
        content_length: vFetch.contentLength,
        accept_ranges: vFetch.acceptRanges,
        note: (vFetch.contentType ?? "").startsWith("video/")
          ? undefined
          : `Content-Type '${vFetch.contentType ?? "unknown"}' is not video/* — Sync.so may refuse.`,
      }
    : { status: "fail", http: vFetch.http ?? null, error: vFetch.error, note: "Sync.so cannot fetch the video URL." };

  // video_codec
  let video_codec: CheckResult;
  if (!vFetch.ok || !vFetch.bytes) {
    video_codec = { status: "skip", note: "video not fetchable" };
  } else {
    const info = parseMp4Head(vFetch.bytes);
    const brand = info.ftyp_brand;
    const allBrands = [brand, ...info.compatible_brands].filter(Boolean) as string[];
    const accepted = allBrands.some((br) => ACCEPTED_VIDEO_BRANDS.has(br));
    video_codec = {
      status: brand == null ? "fail" : accepted ? "pass" : "warn",
      brand,
      compatible_brands: info.compatible_brands,
      moov_in_prefix: info.has_moov_prefix,
      duration_s: info.duration_s,
      parse_error: info.parse_error,
      note: brand == null
        ? "No ftyp box found in first 64 KB — not a standard MP4."
        : accepted ? undefined : `Brand '${brand}' is unusual — Sync.so prefers isom/mp42/iso5.`,
    };
  }

  // audio_fetchable
  const audio_fetchable: CheckResult = aFetch.ok
    ? {
        status: (aFetch.contentType ?? "").startsWith("audio/") || aFetch.contentType === "application/octet-stream"
          ? "pass"
          : "warn",
        http: aFetch.http,
        content_type: aFetch.contentType,
        content_length: aFetch.contentLength,
        accept_ranges: aFetch.acceptRanges,
        note: (aFetch.contentType ?? "").startsWith("audio/")
          ? undefined
          : `Content-Type '${aFetch.contentType ?? "unknown"}' is not audio/* — Supabase Storage often serves octet-stream for non-standard extensions.`,
      }
    : { status: "fail", http: aFetch.http ?? null, error: aFetch.error, note: "Sync.so cannot fetch the audio URL." };

  // audio_format
  let audio_format: CheckResult;
  let audioDurationS: number | null = null;
  if (!aFetch.ok || !aFetch.bytes) {
    audio_format = { status: "skip", note: "audio not fetchable" };
  } else {
    const info = sniffAudio(aFetch.bytes, aFetch.contentLength ?? null);
    audioDurationS = info.duration_s;
    let st: Status = "pass";
    let note: string | undefined;
    if (info.format === "unknown") { st = "fail"; note = info.sniff_error ?? "Unrecognized audio container."; }
    else if (info.duration_s != null && info.duration_s < 0.4) { st = "fail"; note = `Audio is only ${info.duration_s.toFixed(2)}s — Sync.so STT needs ≥0.4s.`; }
    else if (info.duration_s != null && info.duration_s < 1.0) { st = "warn"; note = `Audio is ${info.duration_s.toFixed(2)}s — short clips can confuse STT.`; }
    audio_format = {
      status: st,
      format: info.format,
      duration_s: info.duration_s,
      bitrate_kbps: info.bitrate_kbps,
      sniff_error: info.sniff_error,
      note,
    };
  }

  // duration_match
  let duration_match: CheckResult;
  const videoDurationS = (video_codec as any)?.duration_s ?? null;
  if (videoDurationS == null || audioDurationS == null) {
    duration_match = { status: "skip", video_s: videoDurationS, audio_s: audioDurationS, note: "Duration unknown for one or both assets." };
  } else {
    const delta = Math.abs(videoDurationS - audioDurationS);
    duration_match = {
      status: delta > 2.0 ? "fail" : delta > 0.5 ? "warn" : "pass",
      video_s: Number(videoDurationS.toFixed(2)),
      audio_s: Number(audioDurationS.toFixed(2)),
      delta_s: Number(delta.toFixed(2)),
      note: delta > 2.0
        ? `Delta ${delta.toFixed(2)}s is too large — Sync.so may abort.`
        : delta > 0.5
        ? `Delta ${delta.toFixed(2)}s is noticeable.`
        : undefined,
    };
  }

  const checks: Record<string, CheckResult> = {
    video_fetchable,
    video_codec,
    audio_fetchable,
    audio_format,
    face_at_frame: faceProbe,
    duration_match,
  };

  // Verdict — first failing check wins (priority order matters)
  const order = ["video_fetchable", "audio_fetchable", "audio_format", "video_codec", "face_at_frame", "duration_match"];
  let firstBlocker: string | null = null;
  let anyWarn = false;
  for (const k of order) {
    const s = checks[k]?.status;
    if (s === "fail" && !firstBlocker) firstBlocker = k;
    if (s === "warn") anyWarn = true;
  }
  const verdict: "pass" | "warn" | "fail" = firstBlocker ? "fail" : anyWarn ? "warn" : "pass";

  return json({
    scene_id: sceneId,
    pass_index: passIndex,
    provider_job_id: providerJobId,
    resolved: {
      video_url_present: !!videoUrl,
      audio_url_present: !!audioUrl,
      frame_number: frameNumber,
      coord,
    },
    checks,
    verdict,
    first_blocker: firstBlocker,
  });
});
