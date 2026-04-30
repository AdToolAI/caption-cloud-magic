// composer-export-fcpxml v1.0.0
// Builds an Apple FCPXML 1.10 file from a composer project, uploads it to the
// composer-nle-exports bucket, and registers it in composer_nle_exports.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildFCPXML,
  type NLEAudio,
  type NLEProject,
  type NLEScene,
} from "../_shared/nle-export.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const RESOLUTIONS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "4:3": { w: 1440, h: 1080 },
};

interface ReqBody {
  projectId: string;
  /** Optional override (24/30/60). Defaults to 30. */
  fps?: number;
}

// deno-lint-ignore no-explicit-any
export async function buildProjectPayload(
  supabase: any,
  projectId: string,
  fps: 24 | 30 | 60,
): Promise<{ project: NLEProject; warnings: string[] }> {
  const warnings: string[] = [];

  const { data: project, error: pErr } = await supabase
    .from("composer_projects")
    .select("id, title, assembly_config, briefing")
    .eq("id", projectId)
    .single();
  if (pErr || !project) throw new Error("Project not found");

  const { data: scenes, error: sErr } = await supabase
    .from("composer_scenes")
    .select("id, order_index, duration_seconds, clip_url, upload_url, scene_type")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });
  if (sErr) throw new Error(`Scene fetch failed: ${sErr.message}`);

  const briefing = (project.briefing as any) ?? {};
  const aspect = (briefing.aspectRatio as string) ?? "16:9";
  const res = RESOLUTIONS[aspect] ?? RESOLUTIONS["16:9"];

  const nleScenes: NLEScene[] = (scenes ?? []).map((s: any, idx: number) => {
    const url = s.clip_url || s.upload_url || null;
    if (!url) warnings.push(`Scene ${s.order_index ?? idx}: no clip available — skipped`);
    return {
      id: s.id,
      order_index: s.order_index ?? idx,
      duration_seconds: Number(s.duration_seconds ?? 5),
      videoUrl: url,
      name: s.scene_type ? `${s.scene_type}_${(s.order_index ?? idx) + 1}` : undefined,
    };
  });

  const usableCount = nleScenes.filter((s) => s.videoUrl).length;
  if (usableCount === 0) throw new Error("No scenes with usable clips");

  // Audio from assembly_config (voiceover + music)
  const ac = (project.assembly_config as any) ?? {};
  const totalDur = nleScenes.reduce((sum, s) => sum + s.duration_seconds, 0);
  const audio: NLEAudio[] = [];
  if (ac.voiceover?.audioUrl) {
    audio.push({
      laneIndex: 1,
      url: ac.voiceover.audioUrl,
      name: ac.voiceover.voiceName ? `voiceover-${ac.voiceover.voiceName}` : "voiceover",
      durationSeconds: ac.voiceover.durationSeconds || totalDur,
    });
  }
  if (ac.music?.trackUrl) {
    audio.push({
      laneIndex: 2,
      url: ac.music.trackUrl,
      name: ac.music.trackName || "music",
      durationSeconds: totalDur,
    });
  }

  if (ac.globalTextOverlays?.length) {
    warnings.push(
      `${ac.globalTextOverlays.length} text overlay(s) detected — exported as static text only.`,
    );
  }
  if (ac.colorGrading && ac.colorGrading !== "none") {
    warnings.push(`Color grading "${ac.colorGrading}" must be re-applied in your NLE.`);
  }

  return {
    project: {
      id: project.id,
      title: project.title || "Untitled Composer Project",
      fps,
      width: res.w,
      height: res.h,
      scenes: nleScenes,
      audio,
    },
    warnings,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const body = (await req.json()) as ReqBody;
    if (!body.projectId) throw new Error("projectId required");

    const requestedFps = body.fps ?? 30;
    const fps = ([24, 30, 60].includes(requestedFps) ? requestedFps : 30) as 24 | 30 | 60;

    // Verify project ownership
    const { data: ownership } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", body.projectId)
      .single();
    if (!ownership || ownership.user_id !== user.id) {
      throw new Error("Project not found or not owned by user");
    }

    const { project, warnings } = await buildProjectPayload(supabase, body.projectId, fps);
    const xml = buildFCPXML(project);
    const xmlBytes = new TextEncoder().encode(xml);

    const ts = Date.now();
    const storagePath = `${user.id}/${body.projectId}/sequence-${ts}.fcpxml`;

    const { error: upErr } = await supabase.storage
      .from("composer-nle-exports")
      .upload(storagePath, xmlBytes, {
        contentType: "application/xml",
        upsert: true,
      });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const totalDur = project.scenes.reduce((s, x) => s + x.duration_seconds, 0);

    const { data: exportRow, error: insErr } = await supabase
      .from("composer_nle_exports")
      .insert({
        user_id: user.id,
        project_id: body.projectId,
        format: "fcpxml",
        storage_path: storagePath,
        file_size_bytes: xmlBytes.byteLength,
        scene_count: project.scenes.length,
        total_duration_sec: totalDur,
        warnings,
      })
      .select("id, expires_at")
      .single();
    if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage
      .from("composer-nle-exports")
      .createSignedUrl(storagePath, 3600);
    if (signErr || !signed?.signedUrl) throw new Error("Could not sign download URL");

    return new Response(
      JSON.stringify({
        success: true,
        exportId: exportRow!.id,
        downloadUrl: signed.signedUrl,
        expiresAt: exportRow!.expires_at,
        warnings,
        format: "fcpxml",
        sizeBytes: xmlBytes.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[composer-export-fcpxml] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
