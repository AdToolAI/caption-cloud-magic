/**
 * poll-dialog-shots — Sequential Sync.so chain poller (v3 per-speaker).
 *
 * v3 design: ONE Sync.so lipsync-2-pro pass per CHARACTER (not per turn).
 * All of a speaker's turns are sent in a single pass as multi-window
 * `segments_secs`. With N distinct speakers this means N chained passes
 * instead of N turns chained, so each face is only animated once and
 * only the speaker's own video regions are re-encoded. Result: noticeably
 * sharper output, and no "weak 2nd-line" artefact from cumulative
 * re-encodes (the v2 bug).
 *
 *   pending → lipsyncing (sync_job_id set) → ready (output_url set)
 *                                          → failed
 *
 * `sync_mode='cut_off'` leaves frames outside `segments_secs` untouched,
 * so chaining N speaker-passes safely preserves earlier speakers' lip
 * animation. Audio is always the full master WAV (Sync.so aligns it to
 * absolute time inside each window).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
const LIPSYNC_MODEL = "lipsync-2-pro";
const SAMPLE_RATE = 44100;
/** Pre-roll/tail for segments_secs (Sync.so VAD onset + frame-grid rounding).
 *  Bumped from 0.12/0.08 (v2) → 0.18/0.12 for smoother short-window onsets.
 *  Hard-clamped to ½ of the gap to the nearest neighbour window so it can
 *  never bleed into another speaker's region. */
const SYNC_LEAD_IN_SEC = 0.18;
const SYNC_TAIL_SEC = 0.12;

interface DialogSpeakerShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  /** All windows for this speaker (time-ordered, disjoint). */
  windows: Array<[number, number]>;
  durSec: number;
  target_coords: [number, number] | null;
  temperature: number;
  status: "pending" | "lipsyncing" | "ready" | "failed";
  sync_job_id?: string;
  output_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface DialogShotsState {
  version: 3;
  status: "queued" | "lipsyncing" | "done" | "failed";
  shots: DialogSpeakerShot[];
  source_clip_url: string;
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  video_width: number;
  video_height: number;
  final_url?: string | null;
  finished_at?: string;
  error?: string;
}


// ── Pure-TS WAV slicing ─────────────────────────────────────────────────

function resampleLinear(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.round(input.length * ratio);
  const out = new Int16Array(outLen);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, last);
    const frac = srcPos - i0;
    const v = input[i0] * (1 - frac) + input[i1] * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  return out;
}

function decodeWavToMonoSamples(wav: Uint8Array): Int16Array {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) {
    throw new Error("Not a RIFF/WAVE file");
  }
  let off = 12;
  let audioFormat = 1, channels = 1, sampleRate = SAMPLE_RATE, bitsPerSample = 16;
  let dataOff = -1, dataLen = 0;
  while (off + 8 <= wav.byteLength) {
    const id = dv.getUint32(off, false);
    const size = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) {
      audioFormat = dv.getUint16(off + 8, true);
      channels = dv.getUint16(off + 10, true);
      sampleRate = dv.getUint32(off + 12, true);
      bitsPerSample = dv.getUint16(off + 22, true);
    } else if (id === 0x64617461) {
      dataOff = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size & 1);
  }
  if (dataOff < 0) throw new Error("WAV missing data chunk");
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV: format=${audioFormat} bits=${bitsPerSample}`);
  }
  const raw = wav.subarray(dataOff, dataOff + dataLen);
  const aligned = new Uint8Array(raw.byteLength - (raw.byteLength % 2));
  aligned.set(raw.subarray(0, aligned.byteLength));
  let samples = new Int16Array(aligned.buffer);
  if (channels > 1) {
    const monoLen = Math.floor(samples.length / channels);
    const mono = new Int16Array(monoLen);
    for (let i = 0; i < monoLen; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += samples[i * channels + c];
      mono[i] = Math.max(-32768, Math.min(32767, Math.round(sum / channels)));
    }
    samples = mono;
  }
  if (sampleRate !== SAMPLE_RATE) samples = resampleLinear(samples, sampleRate, SAMPLE_RATE);
  return samples;
}

function samplesToWav(samples: Int16Array): Uint8Array {
  const dataBytes = samples.byteLength;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  v.setUint32(0, 0x52494646, false);
  v.setUint32(4, 36 + dataBytes, true);
  v.setUint32(8, 0x57415645, false);
  v.setUint32(12, 0x666d7420, false);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  v.setUint32(36, 0x64617461, false);
  v.setUint32(40, dataBytes, true);
  new Uint8Array(buf, 44).set(
    new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
  );
  return new Uint8Array(buf);
}

/** Cache master WAV samples across all turns in one invocation. */
const masterSampleCache = new Map<string, Int16Array>();

async function getMasterSamples(masterUrl: string): Promise<Int16Array> {
  const cached = masterSampleCache.get(masterUrl);
  if (cached) return cached;
  const resp = await fetch(masterUrl);
  if (!resp.ok) throw new Error(`fetch master wav ${resp.status}`);
  const wavBytes = new Uint8Array(await resp.arrayBuffer());
  const samples = decodeWavToMonoSamples(wavBytes);
  masterSampleCache.set(masterUrl, samples);
  return samples;
}

async function sliceWavBytes(
  masterUrl: string,
  startSec: number,
  endSec: number,
): Promise<Uint8Array> {
  const samples = await getMasterSamples(masterUrl);
  const startSample = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const endSample = Math.min(samples.length, Math.ceil(endSec * SAMPLE_RATE));
  if (endSample <= startSample) {
    throw new Error(`empty slice ${startSec}-${endSec}s`);
  }
  return samplesToWav(samples.slice(startSample, endSample));
}

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return pub.publicUrl;
}

// ── Sync.so wrappers ────────────────────────────────────────────────────

/** Expand a turn window with pre-roll/tail, clamped to neighbouring turn
 *  boundaries (never bleed into another speaker's window). */
function expandWindow(
  shot: DialogTurnShot,
  allShots: DialogTurnShot[],
): [number, number] {
  const prev = allShots
    .filter((s) => s.idx < shot.idx)
    .reduce<number>((max, s) => Math.max(max, s.endSec), 0);
  const nextStart = allShots
    .filter((s) => s.idx > shot.idx)
    .reduce<number>((min, s) => Math.min(min, s.startSec), Number.POSITIVE_INFINITY);
  const maxLeadIn = Math.min(SYNC_LEAD_IN_SEC, Math.max(0, (shot.startSec - prev) / 2));
  const maxTail =
    Number.isFinite(nextStart)
      ? Math.min(SYNC_TAIL_SEC, Math.max(0, (nextStart - shot.endSec) / 2))
      : SYNC_TAIL_SEC;
  return [
    Math.max(0, shot.startSec - maxLeadIn),
    shot.endSec + maxTail,
  ];
}

async function startSyncTurnJob(
  apiKey: string,
  videoUrl: string,
  audioUrl: string,
  segment: [number, number],
  coords: [number, number] | null,
  temperature: number,
): Promise<string> {
  const options: Record<string, unknown> = {
    output_format: "mp4",
    sync_mode: "cut_off",
    temperature,
  };
  if (coords) {
    options.active_speaker_detection = {
      auto_detect: false,
      frame_number: 0,
      coordinates: coords,
    };
  } else {
    options.active_speaker_detection = { auto_detect: true };
  }
  const payload: Record<string, unknown> = {
    model: LIPSYNC_MODEL,
    input: [
      { type: "video", url: videoUrl, segments_secs: [segment] },
      { type: "audio", url: audioUrl },
    ],
    options,
  };
  let r = await fetch(`${SYNC_API_BASE}/generate`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    // Fallback: retry without segments_secs if Sync.so rejects the window.
    if (
      r.status === 400 &&
      /segments? configuration is invalid|only supported for video inputs|invalid.+segment/i.test(txt)
    ) {
      console.warn(
        `[poll-dialog-shots] segments rejected, retry without window: ${txt.slice(0, 200)}`,
      );
      const fallback = { ...payload };
      (fallback.input as any[])[0] = { type: "video", url: videoUrl };
      r = await fetch(`${SYNC_API_BASE}/generate`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(fallback),
      });
      if (!r.ok) {
        const t2 = await r.text().catch(() => "");
        throw new Error(`sync.so create ${r.status}: ${t2.slice(0, 300)}`);
      }
    } else {
      throw new Error(`sync.so create ${r.status}: ${txt.slice(0, 300)}`);
    }
  }
  const data = await r.json();
  return String(data.id);
}

async function pollSyncJob(
  apiKey: string,
  jobId: string,
): Promise<{ status: string; outputUrl?: string; error?: string }> {
  const r = await fetch(`${SYNC_API_BASE}/generate/${jobId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    return { status: "FAILED", error: `poll ${r.status}: ${txt.slice(0, 200)}` };
  }
  const data = await r.json();
  return {
    status: String(data.status ?? "UNKNOWN"),
    outputUrl: data.outputUrl ?? data.output_url ?? undefined,
    error: data.error ?? undefined,
  };
}

async function refundIfNeeded(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  state: DialogShotsState,
): Promise<DialogShotsState> {
  if (state.refunded || !state.cost_credits) return state;
  try {
    const { data: w } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();
    if (w) {
      await supabase
        .from("wallets")
        .update({
          balance: Number(w.balance ?? 0) + state.cost_credits,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  } catch (e) {
    console.warn("[poll-dialog-shots] refund failed", (e as Error).message);
  }
  return { ...state, refunded: true };
}

// ── Per-scene processor ─────────────────────────────────────────────────

async function processScene(
  supabase: ReturnType<typeof createClient>,
  syncKey: string,
  sceneId: string,
): Promise<{ status: string; mutated: boolean }> {
  const { data: scene } = await supabase
    .from("composer_scenes")
    .select(
      "id, project_id, dialog_shots, lip_sync_applied_at, clip_url, lip_sync_source_clip_url",
    )
    .eq("id", sceneId)
    .single();
  if (!scene) return { status: "not_found", mutated: false };
  if (scene.lip_sync_applied_at) return { status: "already_done", mutated: false };

  const state = (scene.dialog_shots ?? null) as DialogShotsState | null;
  if (!state) return { status: "no_state", mutated: false };
  if (state.version !== 2) {
    // Legacy v1 (Hailuo-per-turn) state — ignore; user must reset via UI.
    return { status: "legacy_v1_ignored", mutated: false };
  }
  if (state.status === "done" || state.status === "failed") {
    return { status: state.status, mutated: false };
  }

  const { data: project } = await supabase
    .from("composer_projects")
    .select("user_id")
    .eq("id", scene.project_id)
    .single();
  const userId = project?.user_id;

  const shots = state.shots.map((s) => ({ ...s }));
  let mutated = false;
  let newState: DialogShotsState = { ...state, shots };

  // Determine the current "active" turn (the one we're processing this tick).
  // Strict sequential: only ONE turn is in-flight at a time.
  const activeIdx = shots.findIndex((s) => s.status === "lipsyncing");
  const nextPendingIdx = shots.findIndex((s) => s.status === "pending");

  // ── Step 1: poll the active turn ────────────────────────────────────
  if (activeIdx >= 0) {
    const shot = shots[activeIdx];
    if (shot.sync_job_id) {
      try {
        const polled = await pollSyncJob(syncKey, shot.sync_job_id);
        if (polled.status === "COMPLETED" && polled.outputUrl) {
          shot.output_url = polled.outputUrl;
          shot.status = "ready";
          shot.completed_at = new Date().toISOString();
          mutated = true;
        } else if (["FAILED", "REJECTED", "CANCELED"].includes(polled.status)) {
          shot.status = "failed";
          shot.error = `sync_${polled.status}: ${polled.error ?? "unknown"}`.slice(0, 300);
          mutated = true;
        }
      } catch (e) {
        console.warn(
          `[poll-dialog-shots] turn ${shot.idx} poll error`,
          (e as Error).message,
        );
      }
    }
  }

  // ── Step 2: dispatch next pending turn IF no other turn is in-flight ──
  const stillActive = shots.some((s) => s.status === "lipsyncing");
  const anyFailed = shots.some((s) => s.status === "failed");

  if (!stillActive && !anyFailed) {
    const dispatchIdx = shots.findIndex((s) => s.status === "pending");
    if (dispatchIdx >= 0) {
      const shot = shots[dispatchIdx];
      // Video input: the previous turn's output_url, OR the original source plate
      // if this is turn 0.
      const prevReady = shots
        .filter((s) => s.idx < shot.idx && s.status === "ready" && s.output_url)
        .pop();
      const videoInput = prevReady?.output_url ?? state.source_clip_url;
      try {
        // IMPORTANT: send the FULL master WAV to Sync.so on every turn —
        // do NOT slice. Sync.so aligns audio to the `segments_secs` video
        // window by absolute time; a sliced WAV starts at 0s and would
        // desync from a window at e.g. 2.7s. Full master WAV + tight
        // per-turn video window = stable per-speaker lipsync (Two-Shot policy).
        const window = expandWindow(shot, shots);
        const jobId = await startSyncTurnJob(
          syncKey,
          videoInput,
          state.master_audio_url,
          window,
          shot.target_coords,
          shot.temperature,
        );
        shot.sync_job_id = jobId;
        shot.status = "lipsyncing";
        shot.started_at = new Date().toISOString();
        mutated = true;
        console.log(
          `[poll-dialog-shots] dispatched turn ${shot.idx} (${shot.speaker_name}) job=${jobId} window=[${window[0].toFixed(2)},${window[1].toFixed(2)}] coords=${JSON.stringify(shot.target_coords)} temp=${shot.temperature}`,
        );
      } catch (e) {
        shot.status = "failed";
        shot.error = `dispatch: ${(e as Error).message}`.slice(0, 300);
        mutated = true;
      }
    }
  }

  // ── Step 3: determine pipeline status ──────────────────────────────
  const allReady = shots.every((s) => s.status === "ready");
  const hasFailure = shots.some((s) => s.status === "failed");
  const hasActive = shots.some((s) => s.status === "lipsyncing");

  let pipelineStatus: DialogShotsState["status"] = state.status;
  if (allReady) pipelineStatus = "done";
  else if (hasFailure && !hasActive) pipelineStatus = "failed";
  else if (hasActive || nextPendingIdx >= 0) pipelineStatus = "lipsyncing";

  newState = { ...newState, shots, status: pipelineStatus };

  // ── Step 4: finalise on success ────────────────────────────────────
  if (allReady) {
    const lastUrl = shots[shots.length - 1]?.output_url ?? state.source_clip_url;
    const nowIso = new Date().toISOString();
    newState = { ...newState, final_url: lastUrl, finished_at: nowIso, status: "done" };
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        clip_url: lastUrl,
        lip_sync_source_clip_url: state.source_clip_url,
        lip_sync_applied_at: nowIso,
        lip_sync_status: "done",
        twoshot_stage: "done",
        clip_error: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);
    return { status: "done", mutated: true };
  }

  // ── Step 5: terminal failure → refund + persist ─────────────────────
  if (pipelineStatus === "failed") {
    if (userId) newState = await refundIfNeeded(supabase, userId, newState);
    const firstErr = shots.find((s) => s.error)?.error ?? "unknown";
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: `dialog_shots_failed: ${firstErr}`.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
    return { status: "failed", mutated: true };
  }

  // ── Step 6: mid-flight persist ─────────────────────────────────────
  if (mutated) {
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
  }

  return { status: pipelineStatus, mutated };
}

// ── HTTP entry ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Match the legacy pipelines: the configured secret is `SYNC_API_KEY`.
    // Keep alternate names as fallback so future renames don't break us.
    const syncKey =
      Deno.env.get("SYNC_API_KEY") ??
      Deno.env.get("SYNC_SO_API_KEY") ??
      Deno.env.get("SYNCSO_API_KEY");
    if (!syncKey) {
      return json(
        {
          error: "missing_sync_key",
          checked: ["SYNC_API_KEY", "SYNC_SO_API_KEY", "SYNCSO_API_KEY"],
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Accept scene_id from POST body OR ?scene_id query param.
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty body OK (pg_cron tick)
    }
    const url = new URL(req.url);
    const querySceneId = url.searchParams.get("scene_id");
    const targetSceneId = (body?.scene_id as string) ?? querySceneId ?? null;

    let sceneIds: string[] = [];
    if (targetSceneId) {
      sceneIds = [targetSceneId];
    } else {
      // pg_cron sweep: find all scenes with active v2 dialog chains
      const { data: rows } = await supabase
        .from("composer_scenes")
        .select("id, dialog_shots")
        .eq("lip_sync_status", "running");
      sceneIds = (rows ?? [])
        .filter(
          (r: any) =>
            r?.dialog_shots?.version === 2 &&
            ["queued", "lipsyncing"].includes(String(r.dialog_shots?.status)),
        )
        .map((r: any) => r.id);
    }

    if (sceneIds.length === 0) {
      return json({ ok: true, processed: 0 });
    }

    const results: any[] = [];
    for (const id of sceneIds) {
      try {
        const r = await processScene(supabase, syncKey, id);
        results.push({ scene_id: id, ...r });
      } catch (e) {
        console.error(`[poll-dialog-shots] scene ${id} crashed`, e);
        results.push({ scene_id: id, error: (e as Error).message });
      }
    }

    return json({ ok: true, processed: sceneIds.length, results });
  } catch (e) {
    console.error("[poll-dialog-shots] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
