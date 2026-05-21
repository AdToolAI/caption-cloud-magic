/**
 * poll-dialog-shots — resumable poller + stitcher for the new dialog-based
 * shot pipeline. Called by:
 *  - pg_cron every 60s (sweeps all in-progress dialog_shots scenes)
 *  - Replicate webhook (after a single Hailuo prediction finishes)
 *  - UI auto-trigger (useTwoShotAutoTrigger)
 *  - compose-dialog-scene resume path
 *
 * Per shot lifecycle:
 *   pending → generating (Hailuo running)
 *           → generated (Hailuo done, plate_url set)
 *           → lipsyncing (Sync.so job queued, sync_job_id set)
 *           → ready (lipsync_url set)
 *           → failed
 *
 * When all shots are 'ready' and stitched_url is not set:
 *   ffmpeg concat all lipsync_url videos in order, overlay master WAV,
 *   upload to ai-videos bucket, set composer_scenes.clip_url +
 *   lip_sync_applied_at + lip_sync_status='done'.
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

async function sliceAudioWav(
  masterUrl: string,
  startSec: number,
  endSec: number,
  outPath: string,
): Promise<void> {
  const tmpIn = `${outPath}.in.wav`;
  const resp = await fetch(masterUrl);
  if (!resp.ok) throw new Error(`slice fetch master ${resp.status}`);
  await Deno.writeFile(tmpIn, new Uint8Array(await resp.arrayBuffer()));
  const ff = await new Deno.Command("ffmpeg", {
    args: [
      "-y",
      "-ss",
      String(startSec.toFixed(3)),
      "-to",
      String(endSec.toFixed(3)),
      "-i",
      tmpIn,
      "-c:a",
      "pcm_s16le",
      "-ar",
      "44100",
      "-ac",
      "1",
      outPath,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!ff.success) {
    const err = new TextDecoder().decode(ff.stderr).slice(0, 400);
    throw new Error(`ffmpeg slice failed: ${err}`);
  }
  try {
    await Deno.remove(tmpIn);
  } catch { /* ignore */ }
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
      } else if (
        pred.status === "failed" ||
        pred.status === "canceled"
      ) {
        shot.status = "failed";
        shot.error = `hailuo_${pred.status}: ${pred.error ?? "unknown"}`.slice(0, 300);
        mutated = true;
      }
    } catch (e) {
      // transient — leave generating
      console.warn(
        `[poll-dialog-shots] hailuo poll shot ${shot.idx} err`,
        (e as Error).message,
      );
    }
  }

  // ── Step 2: kick lipsync for generated shots ───────────────────────
  for (const shot of shots) {
    if (shot.status !== "generated") continue;
    if (!shot.plate_url) {
      shot.status = "failed";
      shot.error = "no_plate_url";
      mutated = true;
      continue;
    }
    try {
      // Slice master WAV for this turn
      const tmpDir = await Deno.makeTempDir();
      const slicePath = `${tmpDir}/slice.wav`;
      await sliceAudioWav(
        state.master_audio_url,
        shot.startSec,
        shot.endSec,
        slicePath,
      );
      const sliceBytes = await Deno.readFile(slicePath);
      const storagePath = `${userId}/dialog-shots/${sceneId}/shot-${shot.idx}-${Date.now()}.wav`;
      const sliceUrl = await uploadToStorage(
        supabase,
        "voiceover-audio",
        storagePath,
        sliceBytes,
        "audio/wav",
      );
      try {
        await Deno.remove(tmpDir, { recursive: true });
      } catch { /* ignore */ }

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
      } else if (
        ["FAILED", "REJECTED", "CANCELED"].includes(polled.status)
      ) {
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
  if (allReady && !state.stitched_url) newPipelineStatus = "stitching";
  else if (!anyActive && anyFailed) newPipelineStatus = "failed";
  else if (anyActive) newPipelineStatus = "generating";

  let newState: DialogShotsState = {
    ...state,
    shots,
    status: newPipelineStatus,
  };

  // ── Step 5: stitch when all shots are ready ────────────────────────
  if (allReady && !state.stitched_url) {
    try {
      const tmpDir = await Deno.makeTempDir();
      const localPaths: string[] = [];
      for (const shot of shots) {
        const r = await fetch(shot.lipsync_url!);
        if (!r.ok) throw new Error(`fetch shot ${shot.idx}: ${r.status}`);
        const p = `${tmpDir}/shot-${String(shot.idx).padStart(3, "0")}.mp4`;
        await Deno.writeFile(p, new Uint8Array(await r.arrayBuffer()));
        localPaths.push(p);
      }
      // Master audio
      const audioPath = `${tmpDir}/master.wav`;
      const ar = await fetch(state.master_audio_url);
      if (!ar.ok) throw new Error(`fetch master audio ${ar.status}`);
      await Deno.writeFile(audioPath, new Uint8Array(await ar.arrayBuffer()));

      // Concat list
      const listPath = `${tmpDir}/list.txt`;
      await Deno.writeTextFile(
        listPath,
        localPaths.map((p) => `file '${p}'`).join("\n"),
      );
      const concatPath = `${tmpDir}/concat.mp4`;
      const concat = await new Deno.Command("ffmpeg", {
        args: [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-an",
          concatPath,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!concat.success) {
        const err = new TextDecoder().decode(concat.stderr).slice(0, 400);
        throw new Error(`concat failed: ${err}`);
      }
      // Mux master audio
      const outPath = `${tmpDir}/final.mp4`;
      const mux = await new Deno.Command("ffmpeg", {
        args: [
          "-y",
          "-i",
          concatPath,
          "-i",
          audioPath,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-shortest",
          outPath,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!mux.success) {
        const err = new TextDecoder().decode(mux.stderr).slice(0, 400);
        throw new Error(`mux failed: ${err}`);
      }

      const outBytes = await Deno.readFile(outPath);
      const outStoragePath = `composer/${scene.project_id}/${sceneId}-dialog-${Date.now()}.mp4`;
      const finalUrl = await uploadToStorage(
        supabase,
        "ai-videos",
        outStoragePath,
        outBytes,
        "video/mp4",
      );
      try {
        await Deno.remove(tmpDir, { recursive: true });
      } catch { /* ignore */ }

      newState = {
        ...newState,
        stitched_url: finalUrl,
        stitched_at: new Date().toISOString(),
        status: "done",
      };
      mutated = true;

      // Update scene
      const nowIso = new Date().toISOString();
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          clip_url: finalUrl,
          lip_sync_source_clip_url:
            scene.lip_sync_source_clip_url || scene.clip_url || null,
          lip_sync_applied_at: nowIso,
          lip_sync_status: "done",
          twoshot_stage: "done",
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
      return { status: "done", mutated: true };
    } catch (e) {
      console.error(`[poll-dialog-shots] stitch error ${sceneId}`, e);
      newState = {
        ...newState,
        status: "failed",
        error: `stitch: ${(e as Error).message}`.slice(0, 400),
      };
      if (userId) newState = await refundIfNeeded(supabase, userId, newState);
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `dialog_stitch_failed: ${(e as Error).message.slice(0, 200)}`,
        })
        .eq("id", sceneId);
      return { status: "failed", mutated: true };
    }
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
        clip_error: `dialog_shots_failed: ${shots.find((s) => s.error)?.error ?? "unknown"}`.slice(0, 300),
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
    const url = new URL(req.url);
    sceneId = url.searchParams.get("scene_id");
    if (!sceneId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      sceneId = body?.scene_id ?? null;
    }
  } catch { /* ignore */ }

  try {
    if (sceneId) {
      const r = await processScene(supabase, replicate, syncKey, sceneId);
      return json({ ok: true, scene_id: sceneId, ...r });
    }
    // Sweep mode (cron, no scene id)
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
        results.push({ id: s.id, status: `error:${(e as Error).message.slice(0, 80)}` });
      }
    }
    return json({ ok: true, swept: results.length, results });
  } catch (e) {
    console.error("[poll-dialog-shots] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
