import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

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

type FaceMap = {
  faces?: Array<{ side?: "left" | "right"; center?: [number, number]; bbox?: [number, number, number, number]; normCenter?: [number, number] }>;
  width?: number;
  height?: number;
};

async function probeMp4Dims(url: string | null | undefined): Promise<{ width: number; height: number } | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const textAt = (i: number, n: number) => String.fromCharCode(...buf.slice(i, i + n));
    const readU32 = (i: number) => ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
    for (let i = 0; i < buf.length - 32; i++) {
      if (textAt(i, 4) !== "tkhd") continue;
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

function pickTargetCoordinates(passIndex: number, faceMap: FaceMap | null | undefined, videoDims?: { width: number; height: number } | null): { coords: [number, number]; side: "left" | "right"; source: "gemini" | "heuristic"; faceCenter?: [number, number]; bbox?: [number, number, number, number]; anchorDims?: { width: number; height: number }; videoDims?: { width: number; height: number } } {
  const side: "left" | "right" = passIndex === 0 ? "left" : "right";
  const faces = Array.isArray(faceMap?.faces) ? faceMap!.faces! : [];
  const match = faces.find((f) => f.side === side) ?? faces[Math.min(passIndex, Math.max(0, faces.length - 1))];
  if (Array.isArray(match?.center) && match.center.length === 2) {
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
    return { coords, side, source: "gemini", faceCenter, bbox, anchorDims: anchorW && anchorH ? { width: anchorW, height: anchorH } : undefined, videoDims: { width: videoW, height: videoH } };
  }
  const W = Number(videoDims?.width) || Number(faceMap?.width) || 1280;
  const H = Number(videoDims?.height) || Number(faceMap?.height) || 720;
  return { coords: [Math.round(W * (side === "left" ? 0.3 : 0.7)), Math.round(H * 0.5)], side, source: "heuristic" };
}

async function startSyncJob(syncApiKey: string, params: { videoUrl: string; audioUrl: string; targetCoords?: [number, number] | null }): Promise<string> {
  const options: Record<string, unknown> = {
    sync_mode: "cut_off",
    output_format: "mp4",
    temperature: 0.5,
    active_speaker_detection: params.targetCoords
      ? { auto_detect: false, frame_number: 0, coordinates: params.targetCoords }
      : { auto_detect: true },
  };
  const resp = await fetch("https://api.sync.so/v2/generate", {
    method: "POST",
    headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "lipsync-2-pro",
      input: [
        { type: "video", url: params.videoUrl },
        { type: "audio", url: params.audioUrl },
      ],
      options,
    }),
  });
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
      .select("id, project_id, clip_url, lip_sync_source_clip_url, audio_plan, lip_sync_status, twoshot_stage, lip_sync_applied_at")
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
      const latest = await supabase.from("composer_scenes").select("audio_plan").eq("id", sceneId).single();
      const latestPlan = (latest.data?.audio_plan ?? plan) as Record<string, any>;
      const latestTwoshot = (latestPlan.twoshot ?? {}) as Record<string, any>;
      const latestSyncJobs = (latestTwoshot.syncJobs ?? syncJobs) as Record<string, any>;
      if (isSegments && /segments configuration is invalid/i.test(String(polled.error ?? ""))) {
        polled.error = `${polled.error ?? polled.status} | segment_mode_disabled_retry_with_two_pass`;
      }
      if (!latestSyncJobs.refunded) {
        const cost = Number(latestSyncJobs.costCredits ?? 0);
        if (cost > 0) {
          const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
          if (wallet) {
            await supabase.from("wallets").update({ balance: Number(wallet.balance ?? 0) + cost, updated_at: now }).eq("user_id", userId);
          }
        }
      }
      await supabase.from("composer_scenes").update({
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: `syncso_${polled.status.toLowerCase()}: ${(polled.error || "unknown").slice(0, 420)}`,
        updated_at: now,
        audio_plan: { ...latestPlan, twoshot: { ...latestTwoshot, syncJobs: { ...latestSyncJobs, refunded: true, failedAt: now, error: polled.error ?? polled.status, lastError: polled.error ?? polled.status, lastErrorAt: now, jobs: (Array.isArray(latestSyncJobs.jobs) ? latestSyncJobs.jobs : jobs).map((j: any) => j.jobId === jobId ? { ...j, status: polled.status, failedAt: now, providerResponse: polled.providerResponse } : j) } } },
      }).eq("id", sceneId);
      return json({ ok: false, status: polled.status, error: polled.error ?? polled.status }, 200);
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
      const target = pickTargetCoordinates(nextIdx, twoshot.faceMap as FaceMap | null, videoDims);
      if (!Number.isFinite(target.coords[0]) || !Number.isFinite(target.coords[1]) || target.coords[0] <= 0 || target.coords[1] <= 0) {
        return json({ error: "invalid_next_face_target", coords: target.coords }, 422);
      }
      const nextJobId = await startSyncJob(syncApiKey, {
        videoUrl: polled.outputUrl,
        audioUrl: nextSpeaker.track_url,
        targetCoords: target.coords,
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
        faceCenter: target.faceCenter ?? null,
        faceBbox: target.bbox ?? null,
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
