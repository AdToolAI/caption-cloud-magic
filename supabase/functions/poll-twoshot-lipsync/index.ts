import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { appendTwoshotDiag } from "../_shared/twoshotDiagnostics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Format a single `[start,end]` window OR multi-window `[[a,b],[c,d]]` array
 * into a human-readable diagnostic string. Crash-safe for both shapes.
 */
function formatSegments(
  seg: [number, number] | Array<[number, number]> | null | undefined,
): string {
  if (!seg) return "[]";
  const arr: Array<[number, number]> = Array.isArray(seg[0])
    ? (seg as Array<[number, number]>)
    : [seg as [number, number]];
  return (
    "[" +
    arr
      .map(([a, b]) => `${Number(a).toFixed(2)}-${Number(b).toFixed(2)}s`)
      .join(", ") +
    "]"
  );
}

/** Normalize stored audioSegmentSecs (single or multi) for retry/fallback. */
function normalizeSegmentField(
  s: unknown,
): [number, number] | Array<[number, number]> | null {
  if (!s || !Array.isArray(s) || s.length === 0) return null;
  if (Array.isArray((s as any[])[0])) {
    return (s as Array<[number, number]>).filter(
      (w) => Array.isArray(w) && w.length === 2 && Number.isFinite(Number(w[0])) && Number.isFinite(Number(w[1])) && Number(w[1]) > Number(w[0]),
    );
  }
  const a = Number((s as any[])[0]);
  const b = Number((s as any[])[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return [a, b];
}


type FaceMap = {
  faces?: Array<{
    side?: "left" | "right";
    center?: [number, number];
    bbox?: [number, number, number, number];
    normCenter?: [number, number];
    /** Set by compose-twoshot-lipsync via Gemini identity-match. */
    characterId?: string | null;
    matchConfidence?: number;
    matchSource?: "gemini-identity" | "gemini-inferred" | "unresolved";
  }>;
  width?: number;
  height?: number;
};


async function probeMp4Dims(url: string | null | undefined): Promise<{ width: number; height: number } | null> {
  if (!url) return null;
  try {
    // Bounded probe only. Full MP4 downloads + byte-by-byte string conversion
    // can exceed Edge CPU limits on generated clips.
    const resp = await fetch(url, {
      headers: { Range: "bytes=0-1048575" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const readU32 = (i: number) => ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
    const maxScan = Math.min(buf.length - 32, 1_048_576);
    for (let i = 0; i < maxScan; i++) {
      if (buf[i] !== 0x74 || buf[i + 1] !== 0x6b || buf[i + 2] !== 0x68 || buf[i + 3] !== 0x64) continue;
      const version = buf[Math.max(0, i + 4)];
      const base = i + (version === 1 ? 96 : 84);
      if (base + 7 >= buf.length) continue;
      const width = readU32(base) / 65536;
      const height = readU32(base + 4) / 65536;
      if (width > 0 && height > 0 && width < 10000 && height < 10000) return { width: Math.round(width), height: Math.round(height) };
    }
    return null;
  } catch {
    return null;
  }
}

function pickTargetCoordinates(
  passIndex: number,

  faceMap: FaceMap | null | undefined,
  videoDims?: { width: number; height: number } | null,
  speakerContext?: { characterId?: string | null } | null,
): { coords: [number, number]; side: "left" | "right"; source: "gemini" | "heuristic"; mappingSource: "identity_match" | "pass_order"; matchConfidence?: number; faceCenter?: [number, number]; bbox?: [number, number, number, number]; anchorDims?: { width: number; height: number }; videoDims?: { width: number; height: number } } {
  const charId = speakerContext?.characterId ? String(speakerContext.characterId).toLowerCase() : "";
  let mappingSource: "identity_match" | "pass_order" = "pass_order";
  let side: "left" | "right" = passIndex === 0 ? "left" : "right";
  const faces = Array.isArray(faceMap?.faces) ? faceMap!.faces! : [];
  let match: typeof faces[number] | undefined;
  let matchConfidence: number | undefined;

  // Primary: identity match (set upstream by compose-twoshot-lipsync).
  if (charId && faces.length) {
    const byId = faces.find((f) => String(f.characterId ?? "").toLowerCase() === charId);
    if (byId && byId.side) {
      match = byId;
      side = byId.side;
      mappingSource = "identity_match";
      matchConfidence = byId.matchConfidence;
    }
  }
  // Positional fallback.
  if (!match) {
    match = faces.find((f) => f.side === side) ?? faces[Math.min(passIndex, Math.max(0, faces.length - 1))];
  }
  if (match && Array.isArray(match.center) && match.center.length === 2) {
    const anchorW = Number(faceMap?.width) || 0;
    const anchorH = Number(faceMap?.height) || 0;
    const videoW = Number(videoDims?.width) || anchorW || 1280;
    const videoH = Number(videoDims?.height) || anchorH || 720;
    const sameAspect = anchorW > 0 && anchorH > 0 && Math.abs((videoW / videoH) - (anchorW / anchorH)) < 0.03;
    const scaleX = sameAspect ? videoW / anchorW : 1;
    const scaleY = sameAspect ? videoH / anchorH : 1;
    const bbox = Array.isArray(match.bbox) && match.bbox.length === 4 ? match.bbox : undefined;
    const faceCenter: [number, number] = [Math.round(Number(match.center[0]) || 0), Math.round(Number(match.center[1]) || 0)];
    let x = faceCenter[0];
    let y = faceCenter[1];
    if (bbox) {
      const [x1, y1, x2, y2] = bbox.map((n) => Number(n));
      if ([x1, y1, x2, y2].every(Number.isFinite) && x2 > x1 && y2 > y1) {
        x = Math.round(Math.max(x1 + 4, Math.min(x2 - 4, x)));
        y = Math.round(Math.max(y1 + 4, Math.min(y2 - 4, y)));
      }
    }
    const coords: [number, number] = [Math.round(x * scaleX), Math.round(y * scaleY)];
    return { coords, side: side as "left" | "right", source: "gemini", mappingSource, matchConfidence, faceCenter, bbox, anchorDims: anchorW && anchorH ? { width: anchorW, height: anchorH } : undefined, videoDims: { width: videoW, height: videoH } };
  }
  const W = Number(videoDims?.width) || Number(faceMap?.width) || 1280;
  const H = Number(videoDims?.height) || Number(faceMap?.height) || 720;
  return { coords: [Math.round(W * (side === "left" ? 0.3 : 0.7)), Math.round(H * 0.5)], side, source: "heuristic", mappingSource };
}


async function startSyncJob(syncApiKey: string, params: { videoUrl: string; audioUrl: string; targetCoords?: [number, number] | null; autoDetect?: boolean; segmentSecs?: [number, number] | Array<[number, number]> | null; temperature?: number; faceBbox?: [number, number, number, number] | null }): Promise<string> {
  // Sync.so Speaker Selection: documented stable path for a single manual
  // selection is `auto_detect:false + frame_number + coordinates`. We do NOT
  // send `bounding_boxes` (a single static box is not what that field expects
  // and was the source of generic "An unknown error occurred" failures on
  // two-shot face-targeted passes).
  let asd: Record<string, unknown>;
  if (params.autoDetect || !params.targetCoords) {
    asd = { auto_detect: true };
  } else {
    asd = { auto_detect: false, frame_number: 0, coordinates: params.targetCoords };
  }
  const options: Record<string, unknown> = {
    sync_mode: "cut_off",
    output_format: "mp4",
    temperature: params.temperature ?? 0.5,
    active_speaker_detection: asd,
  };
  const normalizedSegments = (() => {
    const s = params.segmentSecs;
    if (!s) return null;
    const arr: Array<[number, number]> = Array.isArray(s[0])
      ? (s as Array<[number, number]>)
      : [s as [number, number]];
    const cleaned = arr
      .map(([a, b]) => [Math.max(0, Number(a)), Math.max(0, Number(b))] as [number, number])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
    return cleaned.length ? cleaned : null;
  })();
  const buildInput = (withSegments: boolean) => {
    const vid: Record<string, unknown> = { type: "video", url: params.videoUrl };
    const aud: Record<string, unknown> = { type: "audio", url: params.audioUrl };
    if (withSegments && normalizedSegments) {
      vid.segments_secs = normalizedSegments;
    }
    return [vid, aud];
  };
  const submit = async (withSegments: boolean) => fetch("https://api.sync.so/v2/generate", {
    method: "POST",
    headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "lipsync-2-pro",
      input: buildInput(withSegments),
      options,
    }),
  });

  const useSegments = !!normalizedSegments;
  let resp = await submit(useSegments);

  if (!resp.ok && useSegments) {
    const txt = await resp.text().catch(() => "");
    if (/segments? configuration is invalid|invalid.+segment|only supported for video inputs/i.test(txt) || resp.status === 400) {
      console.warn(`[poll-twoshot-lipsync] segments_secs rejected, retrying without window: ${txt.slice(0, 200)}`);
      resp = await submit(false);
    } else {
      throw new Error(`sync_create_${resp.status}: ${txt.slice(0, 400)}`);
    }
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`sync_create_${resp.status}: ${txt.slice(0, 400)}`);
  }
  const data = await resp.json();
  if (!data?.id) throw new Error(`sync_create_missing_id: ${JSON.stringify(data).slice(0, 240)}`);
  return String(data.id);
}

async function pollSyncJob(syncApiKey: string, jobId: string): Promise<{ status: string; outputUrl?: string; error?: string; providerResponse?: Record<string, unknown> }> {
  const resp = await fetch(`https://api.sync.so/v2/generate/${jobId}`, {
    headers: { "x-api-key": syncApiKey },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`sync_poll_${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  const status = String(data?.status ?? "").toUpperCase();
  const outputUrl = data?.outputUrl || data?.output_url || data?.output;
  const error = data?.error || data?.errorMessage || data?.message || data?.error_code;
  return { status, outputUrl: typeof outputUrl === "string" ? outputUrl : undefined, error: typeof error === "string" ? error : undefined, providerResponse: data };
}

async function rehostVideo(supabase: any, userId: string, sceneId: string, url: string): Promise<string> {
  try {
    const dl = await fetch(url);
    if (!dl.ok) return url;
    const buf = new Uint8Array(await dl.arrayBuffer());
    const path = `${userId}/${sceneId}-twoshot-${Date.now()}.mp4`;
    const { error } = await supabase.storage.from("composer-clips").upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (error) return url;
    const { data } = supabase.storage.from("composer-clips").getPublicUrl(path);
    return data?.publicUrl || url;
  } catch {
    return url;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const syncApiKey = Deno.env.get("SYNC_API_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (!syncApiKey) return json({ error: "SYNC_API_KEY missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const sceneId = body.scene_id || body.sceneId;
    if (!sceneId) return json({ error: "scene_id required" }, 400);

    const auth = req.headers.get("Authorization");
    let userId: string | null = null;
    if (auth) {
      const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
      userId = user?.id ?? null;
    }

    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select("id, project_id, clip_url, lip_sync_source_clip_url, audio_plan, lip_sync_status, twoshot_stage, lip_sync_applied_at, character_shots")
      .eq("id", sceneId)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project) return json({ error: "project not found" }, 404);
    if (auth && userId !== project.user_id) return json({ error: "Forbidden" }, 403);
    userId = project.user_id;

    if (scene.lip_sync_status === "done" && scene.lip_sync_applied_at) {
      return json({ ok: true, status: "done", scene_id: sceneId });
    }

    const plan = (scene.audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const syncJobs = (twoshot.syncJobs ?? {}) as Record<string, any>;
    const mode = String(syncJobs.mode ?? twoshot.heartbeat?.mode ?? "");
    const isSegments = mode === "segments";
    const isTwoPass = mode === "two_pass";
    const jobs = Array.isArray(syncJobs.jobs) ? syncJobs.jobs : [];
    const currentPass = isSegments ? 1 : Number(syncJobs.currentPass || twoshot.heartbeat?.pass || 1);
    const totalPasses = isSegments ? 1 : Number(syncJobs.totalPasses || jobs.length || 2);
    const fallbackMode = String(syncJobs.fallbackMode ?? "");
    const currentJob = isSegments
      ? (jobs[jobs.length - 1] ?? jobs[0])
      : (jobs.find((j: any) => Number(j?.pass) === currentPass) ?? jobs[jobs.length - 1]);
    const jobId = String(currentJob?.jobId || String(scene.replicate_prediction_id ?? "").replace(/^sync:/, ""));
    if (!jobId) return json({ error: "no_sync_job" }, 422);

    const polled = await pollSyncJob(syncApiKey, jobId);
    const now = new Date().toISOString();

    if (["PENDING", "PROCESSING", "RUNNING", "QUEUED"].includes(polled.status)) {
      await supabase.from("composer_scenes").update({
        updated_at: now,
        audio_plan: {
          ...plan,
          twoshot: {
            ...twoshot,
            syncJobs: { ...syncJobs, currentPass, totalPasses, jobs: jobs.map((j: any) => j.jobId === jobId ? { ...j, status: polled.status, lastPolledAt: now, providerResponse: polled.providerResponse } : j) },
            heartbeat: { ...(twoshot.heartbeat ?? {}), pass: currentPass, total_passes: totalPasses, syncJobId: jobId, lastPolledAt: now },
          },
        },
      }).eq("id", sceneId);
      return json({ ok: true, status: polled.status, scene_id: sceneId, pass: currentPass, jobId });
    }

    if (["FAILED", "REJECTED", "CANCELED"].includes(polled.status)) {
      const latest = await supabase.from("composer_scenes").select("audio_plan, clip_url, lip_sync_source_clip_url").eq("id", sceneId).single();
      const latestPlan = (latest.data?.audio_plan ?? plan) as Record<string, any>;
      const latestTwoshot = (latestPlan.twoshot ?? {}) as Record<string, any>;
      const latestSyncJobs = (latestTwoshot.syncJobs ?? syncJobs) as Record<string, any>;
      const latestJobs = Array.isArray(latestSyncJobs.jobs) ? latestSyncJobs.jobs : jobs;
      const latestCurrentJob = latestJobs.find((j: any) => j.jobId === jobId) ?? currentJob;

      if (isSegments && /segments configuration is invalid/i.test(String(polled.error ?? ""))) {
        polled.error = `${polled.error ?? polled.status} | segment_mode_disabled_retry_with_two_pass`;
      }

      // ── Auto-retry transient provider failures ────────────────────────
      // First two retries: resubmit same pass (Sync.so often succeeds on retry).
      // Third strategy: switch from point-coordinates to bounding_boxes mode
      //   (Sync.so docs: more robust when own face detection is available).
      // Fourth strategy: full-scene auto-detect single-pass fallback using the
      //   merged dialogue track — sacrifices per-face targeting but always
      //   produces *some* lipsynced output, avoiding a 95% UI hang.
      const TRANSIENT_REGEX = /(generation pipeline|internal|timeout|temporarily|rate.?limit|503|502|504)/i;
      const MAX_RETRIES = 2;
      const retryAttempts = Number(latestCurrentJob?.retryAttempts ?? 0);
      const errMsg = String(polled.error ?? polled.status);
      const isTransient = TRANSIENT_REGEX.test(errMsg);
      const fallbackTried = !!latestSyncJobs.fallbackTried;
      const fallbackMode = String(latestSyncJobs.fallbackMode ?? "");

      // Phase A: simple retry (same input) up to MAX_RETRIES
      if (isTransient && retryAttempts < MAX_RETRIES && latestCurrentJob && !fallbackMode) {
        try {
          await new Promise((r) => setTimeout(r, retryAttempts === 0 ? 5_000 : 15_000));
          const retrySegments = normalizeSegmentField((latestCurrentJob as any).audioSegmentSecs);
          const newJobId = await startSyncJob(syncApiKey, {
            videoUrl: String(latestCurrentJob.videoUrl),
            audioUrl: String(latestCurrentJob.audioUrl),
            targetCoords: Array.isArray(latestCurrentJob.targetCoords) ? latestCurrentJob.targetCoords as [number, number] : null,
            faceBbox: Array.isArray(latestCurrentJob.faceBbox) && latestCurrentJob.faceBbox.length === 4 ? latestCurrentJob.faceBbox as [number, number, number, number] : null,
            segmentSecs: retrySegments,
          });
          const patchedJobs = latestJobs.map((j: any) =>
            j.jobId === jobId
              ? { ...j, jobId: newJobId, status: "PROCESSING", startedAt: now, retryAttempts: retryAttempts + 1, previousJobId: jobId, previousFailedAt: now, previousError: errMsg.slice(0, 400) }
              : j,
          );
          await supabase.from("composer_scenes").update({
            replicate_prediction_id: `sync:${newJobId}`,
            clip_error: `auto-retry: sync.so transient fail (attempt ${retryAttempts + 1}/${MAX_RETRIES}) — ${errMsg.slice(0, 120)}`,
            updated_at: now,
            audio_plan: {
              ...latestPlan,
              twoshot: {
                ...latestTwoshot,
                syncJobs: { ...latestSyncJobs, jobs: patchedJobs, lastTransientError: errMsg.slice(0, 400), lastTransientAt: now, retryCount: Number(latestSyncJobs.retryCount ?? 0) + 1 },
                heartbeat: { ...(latestTwoshot.heartbeat ?? {}), pass: currentPass, total_passes: totalPasses, syncJobId: newJobId, retriedAt: now, retryAttempts: retryAttempts + 1 },
              },
            },
          }).eq("id", sceneId);
          return json({ ok: true, status: "RETRIED", scene_id: sceneId, pass: currentPass, jobId: newJobId, retryAttempts: retryAttempts + 1 });
        } catch (retryErr) {
          console.warn(`[poll-twoshot-lipsync ${sceneId}] retry submit failed`, (retryErr as Error).message);
        }
      }

      // Phase B: per-pass safe recovery — re-submit the SAME pass with the
      // SAME isolated speaker track, but switch active-speaker-detection from
      // explicit coordinates to `auto_detect:true`. Because the audio input
      // contains only one speaker, Sync.so will animate the most-active face
      // for that audio — almost always the right one. We never fall back to
      // the merged dialogue on auto-detect, which would smear all lines onto
      // one face.
      if (!fallbackTried && !fallbackMode && latestCurrentJob?.audioUrl && latestCurrentJob?.videoUrl) {
        try {
          const newJobId = await startSyncJob(syncApiKey, {
            videoUrl: String(latestCurrentJob.videoUrl),
            audioUrl: String(latestCurrentJob.audioUrl),
            autoDetect: true,
            temperature: 0.6,
          });
          const newJob = {
            ...latestCurrentJob,
            pass: Number(latestCurrentJob.pass ?? currentPass),
            jobId: newJobId,
            status: "PROCESSING",
            mode: "isolated_track_auto_detect",
            startedAt: now,
            fallback: true,
            previousJobId: jobId,
            previousError: errMsg.slice(0, 400),
          };
          await supabase.from("composer_scenes").update({
            replicate_prediction_id: `sync:${newJobId}`,
            clip_error: `auto-retry: face-targeted refused — switching to isolated-track auto-detect for pass ${latestCurrentJob.pass ?? currentPass}`,
            updated_at: now,
            audio_plan: {
              ...latestPlan,
              twoshot: {
                ...latestTwoshot,
                syncJobs: {
                  ...latestSyncJobs,
                  fallbackTried: true,
                  fallbackMode: "isolated_track_auto_detect",
                  fallbackStartedAt: now,
                  jobs: latestJobs.map((j: any) => j.jobId === jobId ? newJob : j),
                },
                heartbeat: { ...(latestTwoshot.heartbeat ?? {}), pass: Number(latestCurrentJob.pass ?? currentPass), syncJobId: newJobId, fallback: true, fallbackStartedAt: now },
              },
            },
          }).eq("id", sceneId);
          await appendTwoshotDiag(supabase, sceneId, {
            source: "poll",
            event: "isolated_track_auto_detect_retry",
            stage: `lipsync_${latestCurrentJob.pass ?? currentPass}`,
            status: "PROCESSING",
            jobId: newJobId,
            reason: `pass=${latestCurrentJob.pass ?? currentPass} prev=${jobId} prevError=${errMsg.slice(0, 160)}`,
          });
          return json({ ok: true, status: "FALLBACK_QUEUED", scene_id: sceneId, jobId: newJobId, mode: "isolated_track_auto_detect" });
        } catch (fbErr) {
          console.warn(`[poll-twoshot-lipsync ${sceneId}] isolated-track fallback submit failed`, (fbErr as Error).message);
        }
      }

      // Phase C: out of options. Refund + mark failed with a user-actionable reason.
      if (!latestSyncJobs.refunded) {
        const cost = Number(latestSyncJobs.costCredits ?? 0);
        if (cost > 0) {
          const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
          if (wallet) {
            await supabase.from("wallets").update({ balance: Number(wallet.balance ?? 0) + cost, updated_at: now }).eq("user_id", userId);
          }
        }
      }
      const finalReason = fallbackMode
        ? `source_clip_unusable_for_lipsync: Sync.so refused both face-targeted and isolated-track auto-detect passes (${errMsg.slice(0, 200)}). Bitte den Quellclip neu rendern.`
        : `syncso_failed: ${(polled.error || "unknown").slice(0, 320)}${retryAttempts > 0 ? ` (after ${retryAttempts} retries)` : ""}`;
      await supabase.from("composer_scenes").update({
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: finalReason,
        updated_at: now,
        audio_plan: { ...latestPlan, twoshot: { ...latestTwoshot, syncJobs: { ...latestSyncJobs, refunded: true, failedAt: now, error: polled.error ?? polled.status, lastError: polled.error ?? polled.status, lastErrorAt: now, jobs: latestJobs.map((j: any) => j.jobId === jobId ? { ...j, status: polled.status, failedAt: now, providerResponse: polled.providerResponse } : j) } } },
      }).eq("id", sceneId);
      await appendTwoshotDiag(supabase, sceneId, {
        source: "poll",
        event: "final_provider_failure",
        stage: "failed",
        status: polled.status,
        jobId,
        reason: finalReason,
      });
      return json({ ok: false, status: polled.status, error: polled.error ?? polled.status, retried: retryAttempts, fallbackTried }, 200);
    }


    if (polled.status !== "COMPLETED" || !polled.outputUrl) {
      return json({ error: "unexpected_sync_status", status: polled.status }, 502);
    }

    const updatedJobs = jobs.map((j: any) => j.jobId === jobId ? { ...j, status: "COMPLETED", outputUrl: polled.outputUrl, completedAt: now, providerResponse: polled.providerResponse } : j);

    // Segments-mode = single job, no next-pass spawn. Legacy multi-pass rows
    // (mode != 'segments') still chain to the next pass for backward compat.
      if (!isSegments && currentPass < totalPasses) {
      const speakers = Array.isArray(twoshot.speakers) ? twoshot.speakers : [];
      const nextIdx = currentPass;
      const nextSpeaker = speakers[nextIdx];
      if (!nextSpeaker?.track_url) return json({ error: "missing_next_speaker_track" }, 422);
      const videoDims = await probeMp4Dims(polled.outputUrl);
      const charShots = Array.isArray((scene as any).character_shots) ? ((scene as any).character_shots as Array<any>) : [];
      const target = pickTargetCoordinates(nextIdx, twoshot.faceMap as FaceMap | null, videoDims, { characterId: nextSpeaker.character_id ?? null, characterShots: charShots });
      if (!Number.isFinite(target.coords[0]) || !Number.isFinite(target.coords[1]) || target.coords[0] <= 0 || target.coords[1] <= 0) {
        return json({ error: "invalid_next_face_target", coords: target.coords }, 422);
      }
      // Single-source-of-truth audio: use the merged WAV (same audio the user
      // hears in preview/export) and scope Sync.so to this speaker's voiced
      // window via segments_secs. Per-character padded tracks caused visible
      // drift between mouth animation and merged audio because Sync.so
      // re-encoded a different WAV than what plays back.
      const sceneDurSec = Number(twoshot.totalSec) || 0;
      const mergedAudioUrl: string =
        (twoshot as any)?.url ||
        (plan as any)?.twoshot?.url ||
        nextSpeaker.track_url;
      const vrNext: any = (nextSpeaker as any).voicedRange ?? null;
      // Use per-turn windows when present so a speaker with multiple turns
      // never re-animates over the OTHER speaker's voiced range.
      let nextSegment: [number, number] | Array<[number, number]> | null = null;
      if (vrNext && sceneDurSec > 0) {
        if (Array.isArray(vrNext.turns) && vrNext.turns.length > 0) {
          const turns = vrNext.turns
            .map((t: any) => [
              Math.max(0, Number(t.startSec)),
              Math.min(sceneDurSec, Number(t.endSec)),
            ] as [number, number])
            .filter(([a, b]: [number, number]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
          if (turns.length > 0) nextSegment = turns;
        } else if (Number.isFinite(vrNext.startSec) && Number.isFinite(vrNext.endSec) && vrNext.endSec > vrNext.startSec) {
          nextSegment = [
            Math.max(0, Number(vrNext.startSec)),
            Math.min(sceneDurSec, Number(vrNext.endSec)),
          ];
        }
      }
      const nextJobId = await startSyncJob(syncApiKey, {
        videoUrl: polled.outputUrl,
        audioUrl: mergedAudioUrl,
        targetCoords: target.coords,
        segmentSecs: nextSegment,
        temperature: 0.5,
      });

      await appendTwoshotDiag(supabase, sceneId, {
        source: "poll",
        event: "sync_job_created",
        stage: `lipsync_${currentPass + 1}`,
        status: "PROCESSING",
        jobId: nextJobId,
        reason: `pass=${currentPass + 1} face=${target.side} source=${target.source}${nextSegment ? ` windows=${formatSegments(nextSegment)} voicedSec=${vrNext?.voicedSec}` : ""}`,
      });
      const nextPass = currentPass + 1;
      const nextJob = {
        pass: nextPass,
        jobId: nextJobId,
        status: "PROCESSING",
        videoUrl: polled.outputUrl,
        audioUrl: nextSpeaker.track_url,
        speaker: nextSpeaker.speaker,
        character_id: nextSpeaker.character_id ?? null,
        targetFace: target.side,
        targetCoords: target.coords,
        targetSource: target.source,
        mappingSource: target.mappingSource,
        faceCenter: target.faceCenter ?? null,
        faceBbox: target.bbox ?? null, // debug-only metadata
        anchorDims: target.anchorDims ?? null,
        videoDims: target.videoDims ?? null,
        startedAt: now,
      };
      await supabase.from("composer_scenes").update({
        replicate_prediction_id: `sync:${nextJobId}`,
        twoshot_stage: `lipsync_${nextPass}`,
        updated_at: now,
        audio_plan: {
          ...plan,
          twoshot: {
            ...twoshot,
            syncJobs: { ...syncJobs, mode: isTwoPass ? "two_pass" : syncJobs.mode, currentPass: nextPass, totalPasses, jobs: [...updatedJobs, nextJob] },
            heartbeat: { mode: isTwoPass ? "two_pass" : twoshot.heartbeat?.mode, pass: nextPass, total_passes: totalPasses, started_at: now, speaker: nextSpeaker.speaker, targetFace: target.side, targetSource: target.source, syncJobId: nextJobId },
          },
        },
      }).eq("id", sceneId);
      return json({ ok: true, status: "PASS_QUEUED", scene_id: sceneId, pass: nextPass, jobId: nextJobId });
    }

    const publicUrl = await rehostVideo(supabase, userId!, sceneId, polled.outputUrl);
    const prevSpeakers = Array.isArray(plan.speakers) ? plan.speakers : [];
    const mergedSpeakers = prevSpeakers.map((sp: Record<string, unknown>) => ({ ...sp, audioUrl: null, mergedInto: "twoshot" }));
    await supabase.from("composer_scenes").update({
      clip_url: publicUrl,
      lip_sync_source_clip_url: scene.lip_sync_source_clip_url || scene.clip_url,
      lip_sync_applied_at: now,
      lip_sync_status: "done",
      twoshot_stage: "done",
      continuity_drift_score: null,
      continuity_drift_notes: null,
      updated_at: now,
      audio_plan: {
        ...plan,
        speakers: mergedSpeakers,
        twoshot: {
          ...twoshot,
          speakers: Array.isArray(twoshot.speakers) ? twoshot.speakers : [],
          url: twoshot.url,
          useExternalAudio: true,
          embeddedAudio: false,
          lipsyncedAt: now,
          passes: totalPasses,
          syncJobs: { ...syncJobs, currentPass, totalPasses, jobs: updatedJobs, completedAt: now, finalOutputUrl: publicUrl },
        },
      },
    }).eq("id", sceneId);

    try {
      const { data: prior } = await supabase
        .from("video_creations")
        .select("id, metadata")
        .eq("user_id", userId)
        .contains("metadata", { source: "motion-studio-clip", scene_id: sceneId });
      for (const row of prior ?? []) {
        const md = (row.metadata || {}) as Record<string, unknown>;
        if (md.superseded === true) continue;
        await supabase.from("video_creations").update({ metadata: { ...md, superseded: true, superseded_at: now, superseded_by: "twoshot_lipsync" }, updated_at: now }).eq("id", row.id);
      }
    } catch {
      // non-fatal
    }

    return json({ ok: true, status: "done", scene_id: sceneId, clip_url: publicUrl });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
