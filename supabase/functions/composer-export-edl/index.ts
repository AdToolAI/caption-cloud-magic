// composer-export-edl v1.0.0
// CMX 3600 EDL exporter — minimal, video+audio only, no overlays/effects.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildEDL, type NLEProject, type NLEScene } from "../_shared/nle-export.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  projectId: string;
  fps?: number;
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

    const { data: ownership } = await supabase
      .from("composer_projects")
      .select("id, title, user_id")
      .eq("id", body.projectId)
      .single();
    if (!ownership || ownership.user_id !== user.id) {
      throw new Error("Project not found or not owned by user");
    }

    const { data: scenes } = await supabase
      .from("composer_scenes")
      .select("id, order_index, duration_seconds, clip_url, upload_url, scene_type")
      .eq("project_id", body.projectId)
      .order("order_index", { ascending: true });

    const warnings: string[] = [];
    const nleScenes: NLEScene[] = (scenes ?? []).map((s: any, idx: number) => {
      const url = s.clip_url || s.upload_url || null;
      if (!url) warnings.push(`Scene ${s.order_index ?? idx}: no clip — skipped`);
      return {
        id: s.id,
        order_index: s.order_index ?? idx,
        duration_seconds: Number(s.duration_seconds ?? 5),
        videoUrl: url,
        name: s.scene_type ? `${s.scene_type}_${(s.order_index ?? idx) + 1}` : undefined,
      };
    });

    const usable = nleScenes.filter((s) => s.videoUrl);
    if (usable.length === 0) throw new Error("No scenes with usable clips");

    const project: NLEProject = {
      id: ownership.id,
      title: ownership.title || "Composer Project",
      fps,
      width: 1920,
      height: 1080,
      scenes: nleScenes,
      audio: [],
    };

    const edlText = buildEDL(project);
    const edlBytes = new TextEncoder().encode(edlText);

    const ts = Date.now();
    const storagePath = `${user.id}/${body.projectId}/sequence-${ts}.edl`;
    const { error: upErr } = await supabase.storage
      .from("composer-nle-exports")
      .upload(storagePath, edlBytes, {
        contentType: "text/plain",
        upsert: true,
      });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const totalDur = nleScenes.reduce((s, x) => s + x.duration_seconds, 0);

    const { data: exportRow, error: insErr } = await supabase
      .from("composer_nle_exports")
      .insert({
        user_id: user.id,
        project_id: body.projectId,
        format: "edl",
        storage_path: storagePath,
        file_size_bytes: edlBytes.byteLength,
        scene_count: nleScenes.length,
        total_duration_sec: totalDur,
        warnings: [
          "EDL format does not support text overlays, color grading, or effects.",
          ...warnings,
        ],
      })
      .select("id, expires_at")
      .single();
    if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);

    const { data: signed } = await supabase.storage
      .from("composer-nle-exports")
      .createSignedUrl(storagePath, 3600);

    return new Response(
      JSON.stringify({
        success: true,
        exportId: exportRow!.id,
        downloadUrl: signed?.signedUrl,
        expiresAt: exportRow!.expires_at,
        warnings,
        format: "edl",
        sizeBytes: edlBytes.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[composer-export-edl] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
