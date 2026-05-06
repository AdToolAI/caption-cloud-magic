import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function err(step: string, message: string, status: number) {
  console.error(`[save-composer-scene] ${step}: ${message}`);
  return new Response(JSON.stringify({ ok: false, step, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("auth", "No authorization header", 401);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return err("auth", "Unauthorized", 401);

    const body = await req.json();
    const {
      project_id,
      scene_id,
      clip_url,
      prompt,
      duration_seconds,
      clip_source,
      clip_quality,
    } = body ?? {};

    if (!scene_id || !clip_url) {
      return err("validation", "scene_id and clip_url are required", 400);
    }

    // Idempotency check
    const { data: existing } = await supabaseAdmin
      .from("video_creations")
      .select("id, output_url")
      .eq("user_id", user.id)
      .contains("metadata", { composer_scene_id: scene_id });

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ ok: true, already: true, video_id: existing[0].id, video_url: existing[0].output_url }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download
    let res: Response;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      res = await fetch(clip_url, { signal: ctrl.signal });
      clearTimeout(t);
    } catch (e) {
      return err("download", `Quelle nicht erreichbar: ${(e as Error).message}`, 410);
    }
    if (!res.ok) return err("download", `HTTP ${res.status}`, 410);
    const buf = await (await res.blob()).arrayBuffer();

    // Upload — RLS-konformer Pfad: <user_id>/...
    const fileName = `${user.id}/composer-${scene_id}.mp4`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("ai-videos")
      .upload(fileName, buf, { contentType: "video/mp4", upsert: true });
    if (upErr) return err("upload", upErr.message, 500);

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("ai-videos")
      .getPublicUrl(fileName);

    const { data: created, error: insErr } = await supabaseAdmin
      .from("video_creations")
      .insert({
        user_id: user.id,
        output_url: publicUrl,
        status: "completed",
        credits_used: 0,
        metadata: {
          source: "video-composer",
          composer_scene_id: scene_id,
          composer_project_id: project_id ?? null,
          prompt: prompt ?? null,
          clip_source: clip_source ?? null,
          clip_quality: clip_quality ?? null,
          duration_seconds: duration_seconds ?? null,
        },
      })
      .select()
      .single();
    if (insErr) return err("insert", insErr.message, 500);

    return new Response(
      JSON.stringify({ ok: true, video_id: created.id, video_url: publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Unknown error", 500);
  }
});
