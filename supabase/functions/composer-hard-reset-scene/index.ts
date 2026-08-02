/**
 * composer-hard-reset-scene — v373.
 *
 * "Clip generieren" muss ein HARTER Neustart sein: erst alles Alte abbrechen
 * und löschen, dann erst den neuen Job starten. Diese Function ist der einzige
 * erlaubte Einstiegspunkt dafür.
 *
 * Input:  { scene_id: string }
 * Output: { ok, generation, deleted_objects, canceled_jobs }
 *
 * Der Aufrufer MUSS auf die Antwort warten, bevor er `compose-video-clips`
 * anstößt — sonst entsteht wieder das Rennen, bei dem die Lip-Sync-Kette auf
 * der Plate des vorherigen Laufs arbeitet.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { hardResetScene } from "../_shared/scene-hard-reset.ts";
import { getSyncApiKey } from "../_shared/syncso-preflight.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "composer-hard-reset-scene" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const sceneId = String((body as any)?.scene_id ?? (body as any)?.sceneId ?? "").trim();
    if (!sceneId) return json({ error: "scene_id_required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: scene } = await admin
      .from("composer_scenes")
      .select("id, project_id")
      .eq("id", sceneId)
      .maybeSingle();
    if (!scene) return json({ error: "scene_not_found" }, 404);

    const { data: proj } = await admin
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", (scene as any).project_id)
      .maybeSingle();
    if (!proj || (proj as any).user_id !== userId) return json({ error: "forbidden" }, 403);

    const result = await hardResetScene({
      supabase: admin as any,
      sceneId,
      userId,
      projectId: (scene as any).project_id,
      syncApiKey: getSyncApiKey() || null,
      reason: String((body as any)?.reason ?? "user_regenerate"),
    });

    return json({
      ok: true,
      scene_id: sceneId,
      generation: result.generation,
      deleted_objects: result.deletedObjects,
      canceled_jobs: result.canceledJobs,
      warnings: result.errors,
    });
  } catch (e) {
    console.error("[composer-hard-reset-scene] crash", e);
    return json({ error: (e as Error).message ?? "internal_error" }, 500);
  }
});
