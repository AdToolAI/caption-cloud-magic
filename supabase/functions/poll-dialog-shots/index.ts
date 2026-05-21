/**
 * poll-dialog-shots — resumable poller for the dialog-based shot pipeline.
 *
 * Runtime constraints: Supabase Edge Runtime does NOT allow spawning
 * subprocesses (no `Deno.Command('ffmpeg')`). All audio slicing happens
 * in pure TypeScript on raw Int16 PCM / WAV samples. Final video
 * stitching is deferred to the existing render pipeline; this function
 * only orchestrates per-shot Hailuo + Sync.so jobs and writes their
 * outputs back to `composer_scenes.dialog_shots`.
 *
 * Per-shot lifecycle:
 *   pending → generating (Hailuo running)
 *           → generated  (Hailuo done, plate_url set)
 *           → lipsyncing (Sync.so job queued, sync_job_id set)
 *           → ready      (lipsync_url set)
 *           → failed
 *
 * When all shots are 'ready':
 *   - 1 shot   → that shot's lipsync_url becomes clip_url
 *   - N shots  → the existing source clip_url is kept (the original master
 *                two-shot plate already plays audio); shots[] is fully
 *                preserved for the Director's Cut / render pipeline to
 *                stitch the per-speaker lipsync clips later.
 *   In both cases lip_sync_status='done' so the UI stops spinning.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";

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

interface DialogShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  portrait_url: string | null;
  startSec: number;
  endSec: number;
  durSec: number;
  hailuo_target_sec: number;
  status:
    | "pending"
    | "generating"
    | "generated"
    | "lipsyncing"
    | "ready"
    | "failed";
  hailuo_prediction_id?: string;
  plate_url?: string;
  audio_slice_url?: string;
  sync_job_id?: string;
  lipsync_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}
interface DialogShotsState {
  version: 1;
  status: "generating" | "lipsyncing" | "stitching" | "done" | "failed";
  shots: DialogShot[];
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  stitched_url?: string | null;
  stitched_at?: string;
  error?: string;
}

// ── Pure-TS WAV helpers ─────────────────────────────────────────────────
// Decode → slice samples by time → re-encode as 16-bit PCM mono WAV.
// Mirrors the format produced by compose-twoshot-audio so Sync.so sees
// the exact same encoding it always has.

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
  let audioFormat = 1,
    channels = 1,
    sampleRate = SAMPLE_RATE,
    bitsPerSample = 16;
  let dataOff = -1,
    dataLen = 0;
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
  v.setUint32(0, 0x52494646, false); // "RIFF"
  v.setUint32(4, 36 + dataBytes, true);
  v.setUint32(8, 0x57415645, false); // "WAVE"
  v.setUint32(12, 0x666d7420, false); // "fmt "
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  v.setUint32(36, 0x64617461, false); // "data"
  v.setUint32(40, dataBytes, true);
  new Uint8Array(buf, 44).set(
    new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
  );
  return new Uint8Array(buf);
}

/** Pure-TS slice of a master WAV by time range. */
async function sliceMasterWavToBytes(
  masterUrl: string,
  startSec: number,
  endSec: number,
): Promise<Uint8Array> {
  const resp = await fetch(masterUrl);
  if (!resp.ok) throw new Error(`slice fetch master ${resp.status}`);
  const wavBytes = new Uint8Array(await resp.arrayBuffer());
  const samples = decodeWavToMonoSamples(wavBytes);
  const startSample = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const endSample = Math.min(samples.length, Math.ceil(endSec * SAMPLE_RATE));
  if (endSample <= startSample) {
    throw new Error(`empty slice ${startSec}-${endSec}s`);
  }
  const slice = samples.slice(startSample, endSample);
  return samplesToWav(slice);
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

async function startSyncJob(
  apiKey: string,
  videoUrl: string,
  audioUrl: string,
): Promise<string> {
  const payload = {
    model: LIPSYNC_MODEL,
    input: [
      { type: "video", url: videoUrl },
      { type: "audio", url: audioUrl },
    ],
    options: {
      output_format: "mp4",
      sync_mode: "cut_off",
      active_speaker_detection: { auto_detect: true },
      temperature: 0.85,
    },
  };
  const r = await fetch(`${SYNC_API_BASE}/generate`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`sync.so create ${r.status}: ${txt.slice(0, 300)}`);
  }
  const data = await r.json();
  return String(data.id);
}

async function pollSyncJob(
  apiKey: string,
  jobId: string,
): Promise<{
  status: string;
  outputUrl?: string;
  error?: string;
}> {
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

async function processScene(
  supabase: ReturnType<typeof createClient>,
  replicate: Replicate,
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
  if (state.status === "done" || state.status === "failed")
    return { status: state.status, mutated: false };

  const { data: project } = await supabase
    .from("composer_projects")
    .select("user_id")
    .eq("id", scene.project_id)
    .single();
  const userId = project?.user_id;

  let mutated = false;
  const shots = [...state.shots];

  // ── Step 1: poll Hailuo predictions ────────────────────────────────
  for (const shot of shots) {
    if (shot.status !== "generating" || !shot.hailuo_prediction_id) continue;
    try {
      const pred = await replicate.predictions.get(shot.hailuo_prediction_id);
      if (pred.status === "succeeded") {
        let outUrl: string | null = null;
        const out = pred.output as any;
        if (typeof out === "string") outUrl = out;
        else if (Array.isArray(out) && out.length) outUrl = out[0];
        else if (out && typeof out === "object")
          outUrl = out.video ?? out.url ?? null;
        if (!outUrl) {
          shot.status = "failed";
          shot.error = "hailuo_no_output_url";
        } else {
          shot.plate_url = outUrl;
          shot.status = "generated";
        }
        mutated = true;
      } else if (pred.status === "failed" || pred.status === "canceled") {
        shot.status = "failed";
        shot.error = `hailuo_${pred.status}: ${pred.error ?? "unknown"}`.slice(0, 300);
        mutated = true;
      }
    } catch (e) {
      console.warn(
        `[poll-dialog-shots] hailuo poll shot ${shot.idx} err`,
        (e as Error).message,
      );
    }
  }

  // ── Step 2: slice audio (pure TS) + kick lipsync for generated shots ──
  for (const shot of shots) {
    if (shot.status !== "generated") continue;
    if (!shot.plate_url) {
      shot.status = "failed";
      shot.error = "no_plate_url";
      mutated = true;
      continue;
    }
    try {
      const sliceBytes = await sliceMasterWavToBytes(
        state.master_audio_url,
        shot.startSec,
        shot.endSec,
      );
      const storagePath = `${userId}/dialog-shots/${sceneId}/shot-${shot.idx}-${Date.now()}.wav`;
      const sliceUrl = await uploadToStorage(
        supabase,
        "voiceover-audio",
        storagePath,
        sliceBytes,
        "audio/wav",
      );

      const jobId = await startSyncJob(syncKey, shot.plate_url, sliceUrl);
      shot.audio_slice_url = sliceUrl;
      shot.sync_job_id = jobId;
      shot.status = "lipsyncing";
      mutated = true;
    } catch (e) {
      shot.status = "failed";
      shot.error = `lipsync_dispatch: ${(e as Error).message}`.slice(0, 300);
      mutated = true;
    }
  }

  // ── Step 3: poll lipsync jobs ──────────────────────────────────────
  for (const shot of shots) {
    if (shot.status !== "lipsyncing" || !shot.sync_job_id) continue;
    try {
      const polled = await pollSyncJob(syncKey, shot.sync_job_id);
      if (polled.status === "COMPLETED" && polled.outputUrl) {
        shot.lipsync_url = polled.outputUrl;
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
        `[poll-dialog-shots] sync poll shot ${shot.idx} err`,
        (e as Error).message,
      );
    }
  }

  // ── Step 4: determine pipeline status ──────────────────────────────
  const allReady = shots.every((s) => s.status === "ready");
  const anyFailed = shots.some((s) => s.status === "failed");
  const anyActive = shots.some((s) =>
    ["pending", "generating", "generated", "lipsyncing"].includes(s.status),
  );

  let newPipelineStatus: DialogShotsState["status"] = state.status;
  if (allReady) newPipelineStatus = "done";
  else if (!anyActive && anyFailed) newPipelineStatus = "failed";
  else if (anyActive) newPipelineStatus = "generating";

  let newState: DialogShotsState = {
    ...state,
    shots,
    status: newPipelineStatus,
  };

  // ── Step 5: finalise when all shots are ready (no ffmpeg available) ──
  // Edge Runtime cannot spawn subprocesses, so we cannot concat MP4s here.
  // - 1 shot   → the single lipsync_url IS the new clip_url.
  // - N shots  → keep the existing source clip_url (the master two-shot
  //              plate already plays its own audio). The Director's Cut
  //              renderer can use shots[] to assemble a per-speaker cut
  //              later. Either way we mark the scene as "done" so the UI
  //              stops spinning at 95%.
  if (allReady) {
    const nowIso = new Date().toISOString();
    const sourceClip = scene.lip_sync_source_clip_url || scene.clip_url || null;
    const newClipUrl =
      shots.length === 1 && shots[0].lipsync_url
        ? shots[0].lipsync_url
        : sourceClip;

    newState = {
      ...newState,
      stitched_url: newClipUrl,
      stitched_at: nowIso,
      status: "done",
    };

    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        clip_url: newClipUrl,
        lip_sync_source_clip_url: sourceClip,
        lip_sync_applied_at: nowIso,
        lip_sync_status: "done",
        twoshot_stage: "done",
        clip_error: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);
    return { status: "done", mutated: true };
  }

  // ── Step 6: handle terminal failure (refund + persist) ─────────────
  if (newPipelineStatus === "failed") {
    if (userId) newState = await refundIfNeeded(supabase, userId, newState);
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: `dialog_shots_failed: ${
          shots.find((s) => s.error)?.error ?? "unknown"
        }`.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
    return { status: "failed", mutated: true };
  }

  // ── Step 7: persist mid-flight state ───────────────────────────────
  if (mutated) {
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
  }
  return { status: newPipelineStatus, mutated };
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const replicateKey = Deno.env.get("REPLICATE_API_KEY") ?? "";
  const syncKey = Deno.env.get("SYNC_API_KEY") ?? "";
  if (!replicateKey || !syncKey)
    return json({ error: "missing provider keys" }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  const replicate = new Replicate({ auth: replicateKey });

  let sceneId: string | null = null;
  try {
    // Webhook from Replicate puts scene_id in the query string;
    // direct invocations send it in the JSON body.
    const url = new URL(req.url);
    sceneId = url.searchParams.get("scene_id");
    if (!sceneId) {
      const body = await req.json().catch(() => ({}));
      sceneId = body?.scene_id ? String(body.scene_id) : null;
    }
  } catch {
    /* ignore */
  }

  try {
    if (sceneId) {
      const r = await processScene(supabase, replicate, syncKey, sceneId);
      return json({ ok: true, scene_id: sceneId, ...r });
    }

    // Cron sweep: all in-progress dialog_shots scenes.
    const { data: scenes } = await supabase
      .from("composer_scenes")
      .select("id")
      .not("dialog_shots", "is", null)
      .is("lip_sync_applied_at", null)
      .in("lip_sync_status", ["running", "pending"])
      .limit(40);

    const results: Array<{ id: string; status: string }> = [];
    for (const s of scenes ?? []) {
      try {
        const r = await processScene(supabase, replicate, syncKey, s.id);
        results.push({ id: s.id, status: r.status });
      } catch (e) {
        results.push({ id: s.id, status: `err:${(e as Error).message}` });
      }
    }
    return json({ ok: true, swept: results.length, results });
  } catch (e) {
    console.error("[poll-dialog-shots] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
