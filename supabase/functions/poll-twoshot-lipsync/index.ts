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
  faces?: Array<{ side?: "left" | "right"; center?: [number, number] }>;
  width?: number;
  height?: number;
};

function pickTargetCoordinates(passIndex: number, faceMap: FaceMap | null | undefined): { coords: [number, number]; side: "left" | "right"; source: "gemini" | "heuristic" } {
  const side: "left" | "right" = passIndex === 0 ? "left" : "right";
  const faces = Array.isArray(faceMap?.faces) ? faceMap!.faces! : [];
  const match = faces.find((f) => f.side === side) ?? faces[Math.min(passIndex, Math.max(0, faces.length - 1))];
  if (Array.isArray(match?.center) && match.center.length === 2) {
    return { coords: [Math.round(Number(match.center[0])), Math.round(Number(match.center[1]))], side, source: "gemini" };
  }
  const W = Number(faceMap?.width) || 1280;
  const H = Number(faceMap?.height) || 720;
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

async function pollSyncJob(syncApiKey: string, jobId: string): Promise<{ status: string; outputUrl?: string; error?: string }> {
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
  return { status, outputUrl: typeof outputUrl === "string" ? outputUrl : undefined, error: typeof error === "string" ? error : undefined };
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
    const jobs = Array.isArray(syncJobs.jobs) ? syncJobs.jobs : [];
    const currentPass = Number(syncJobs.currentPass || twoshot.heartbeat?.pass || 1);
    const totalPasses = Number(syncJobs.totalPasses || jobs.length || 2);
    const currentJob = jobs.find((j: any) => Number(j?.pass) === currentPass) ?? jobs[jobs.length - 1];
    const jobId = String(currentJob?.jobId || String(scene.replicate_prediction_id ?? "").replace(/^sync:/, ""));
    if (!jobId) return json({ error: "no_sync_job" }, 422);

    const polled = await pollSyncJob(syncApiKey, jobId);
    const now = new Date().toISOString();

    if (["PENDING", "PROCESSING"].includes(polled.status)) {
      await supabase.from("composer_scenes").update({
        updated_at: now,
        audio_plan: {
          ...plan,
          twoshot: {
            ...twoshot,
            syncJobs: { ...syncJobs, currentPass, totalPasses, jobs: jobs.map((j: any) => j.jobId === jobId ? { ...j, status: polled.status, lastPolledAt: now } : j) },
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
        audio_plan: { ...latestPlan, twoshot: { ...latestTwoshot, syncJobs: { ...latestSyncJobs, refunded: true, failedAt: now, error: polled.error ?? polled.status } } },
      }).eq("id", sceneId);
      return json({ ok: false, status: polled.status, error: polled.error ?? polled.status }, 200);
    }

    if (polled.status !== "COMPLETED" || !polled.outputUrl) {
      return json({ error: "unexpected_sync_status", status: polled.status }, 502);
    }

    const updatedJobs = jobs.map((j: any) => j.jobId === jobId ? { ...j, status: "COMPLETED", outputUrl: polled.outputUrl, completedAt: now } : j);

    if (currentPass < totalPasses) {
      const speakers = Array.isArray(twoshot.speakers) ? twoshot.speakers : [];
      const nextIdx = currentPass;
      const nextSpeaker = speakers[nextIdx];
      if (!nextSpeaker?.track_url) return json({ error: "missing_next_speaker_track" }, 422);
      const target = pickTargetCoordinates(nextIdx, twoshot.faceMap as FaceMap | null);
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
            syncJobs: { ...syncJobs, currentPass: nextPass, totalPasses, jobs: [...updatedJobs, nextJob] },
            heartbeat: { pass: nextPass, total_passes: totalPasses, started_at: now, speaker: nextSpeaker.speaker, targetFace: target.side, targetSource: target.source, syncJobId: nextJobId },
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
