// hybrid-extend-scene v1.0.0 — Block M (Hybrid Production)
//
// Orchestrator for forward / backward extend of an existing composer scene.
//
// Flow:
//   1. Validate JWT, ownership, engine compatibility.
//   2. Reserve a unique order_index slot in the project (insert at end first,
//      then re-sequence after success).
//   3. Insert a NEW composer_scenes row in 'pending' state with hybrid_mode set.
//   4. Call extract-video-frames to get the anchor frame (last for forward,
//      first for backward) — caches on the SOURCE scene row.
//   5. Update the new scene with reference_image_url (forward) or
//      end_reference_image_url (backward).
//   6. Trigger compose-video-clips for the new scene → existing pipeline does
//      generation + webhook + final clip_url.
//
// The actual Replicate render and credit deduction happen inside
// compose-video-clips (which already handles wallet, refund, webhook).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type HybridMode = "forward" | "backward";
type Engine = "ai-hailuo" | "ai-kling" | "ai-luma" | "ai-wan" | "ai-seedance";
type Quality = "standard" | "pro";

interface RequestBody {
  projectId: string;
  sourceSceneId: string;
  mode: HybridMode;
  engine: Engine;
  quality?: Quality;
  prompt: string;
  durationSeconds?: number;
}

// Engines that support an `end_image` (required for true backward extend)
const BACKWARD_CAPABLE: Engine[] = ["ai-kling", "ai-luma"];

const DEFAULT_DURATION = 5;
const MIN_DURATION = 3;
const MAX_DURATION = 12;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Unauthorized", 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: authErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !userRes?.user) return jsonError("Unauthorized", 401);
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- Input validation ---
    const body = (await req.json()) as RequestBody;
    if (!body.projectId || !body.sourceSceneId || !body.mode || !body.engine || !body.prompt) {
      return jsonError("Missing required fields: projectId, sourceSceneId, mode, engine, prompt", 400);
    }
    if (!["forward", "backward"].includes(body.mode)) {
      return jsonError("mode must be 'forward' or 'backward'", 400);
    }
    if (body.mode === "backward" && !BACKWARD_CAPABLE.includes(body.engine)) {
      return jsonError(
        `Backward extend only supported for: ${BACKWARD_CAPABLE.join(", ")}. Use forward extend with other engines.`,
        400
      );
    }
    const quality: Quality = body.quality === "pro" ? "pro" : "standard";
    const duration = clamp(body.durationSeconds ?? DEFAULT_DURATION, MIN_DURATION, MAX_DURATION);

    // --- Ownership check on project ---
    const { data: project, error: projErr } = await admin
      .from("composer_projects")
      .select("id, user_id, briefing")
      .eq("id", body.projectId)
      .single();
    if (projErr || !project) return jsonError("Project not found", 404);
    if (project.user_id !== userId) return jsonError("Forbidden", 403);

    // --- Source scene lookup ---
    const { data: source, error: srcErr } = await admin
      .from("composer_scenes")
      .select("id, project_id, order_index, clip_url, last_frame_url, first_frame_url, duration_seconds, scene_type")
      .eq("id", body.sourceSceneId)
      .single();
    if (srcErr || !source) return jsonError("Source scene not found", 404);
    if (source.project_id !== body.projectId) return jsonError("Source scene belongs to a different project", 400);
    if (!source.clip_url) return jsonError("Source scene has no generated clip yet", 400);

    // --- Determine new order_index ---
    const { data: maxRow } = await admin
      .from("composer_scenes")
      .select("order_index")
      .eq("project_id", body.projectId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newOrderIndex = (maxRow?.order_index ?? -1) + 1;

    // --- Insert placeholder scene ---
    const { data: newScene, error: insErr } = await admin
      .from("composer_scenes")
      .insert({
        project_id: body.projectId,
        order_index: newOrderIndex,
        scene_type: source.scene_type ?? "custom",
        duration_seconds: duration,
        clip_source: body.engine,
        clip_quality: quality,
        ai_prompt: body.prompt,
        clip_status: "pending",
        text_overlay: { text: "", position: "bottom", animation: "fade-in", fontSize: 48, color: "#FFFFFF" },
        transition_type: "crossfade",
        transition_duration: 0.5,
        cost_euros: 0,
        retry_count: 0,
        hybrid_mode: body.mode,
        continuity_source_scene_id: body.sourceSceneId,
      } as any)
      .select("id")
      .single();
    if (insErr || !newScene) {
      return jsonError(`Failed to create scene: ${insErr?.message}`, 500);
    }
    const newSceneId = newScene.id;

    // --- Extract anchor frame ---
    const wantFirst = body.mode === "backward";
    const wantLast = body.mode === "forward";
    let anchorUrl: string | null = null;

    // Cached on source row?
    if (wantFirst && source.first_frame_url) anchorUrl = source.first_frame_url;
    if (wantLast && source.last_frame_url) anchorUrl = source.last_frame_url;

    if (!anchorUrl) {
      const extractResp = await fetch(`${SUPABASE_URL}/functions/v1/extract-video-frames`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          videoUrl: source.clip_url,
          mode: wantFirst ? "first" : "last",
          durationSeconds: source.duration_seconds ?? 5,
          sceneId: source.id, // cache on SOURCE scene
          projectId: body.projectId,
        }),
      });
      if (!extractResp.ok) {
        const txt = await extractResp.text();
        await markSceneFailed(admin, newSceneId);
        return jsonError(`Frame extraction failed: ${txt}`, 500);
      }
      const extractData = await extractResp.json();
      anchorUrl = wantFirst ? extractData.firstFrameUrl : extractData.lastFrameUrl;
      if (!anchorUrl) {
        await markSceneFailed(admin, newSceneId);
        return jsonError("Frame extractor returned no URL", 500);
      }
    }

    // --- Wire anchor onto the NEW scene ---
    const wireUpdate: Record<string, string> =
      body.mode === "forward"
        ? { reference_image_url: anchorUrl }
        : { end_reference_image_url: anchorUrl };
    await admin.from("composer_scenes").update(wireUpdate).eq("id", newSceneId);

    // --- Trigger compose-video-clips for the single new scene ---
    const composeResp = await fetch(`${SUPABASE_URL}/functions/v1/compose-video-clips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader, // pass through user JWT
      },
      body: JSON.stringify({
        projectId: body.projectId,
        scenes: [
          {
            id: newSceneId,
            clipSource: body.engine,
            clipQuality: quality,
            aiPrompt: body.prompt,
            referenceImageUrl: body.mode === "forward" ? anchorUrl : undefined,
            endReferenceImageUrl: body.mode === "backward" ? anchorUrl : undefined,
            durationSeconds: duration,
          },
        ],
        visualStyle: (project.briefing as any)?.visualStyle,
        characters: (project.briefing as any)?.characters,
      }),
    });

    if (!composeResp.ok) {
      const txt = await composeResp.text();
      await markSceneFailed(admin, newSceneId);
      return jsonError(`compose-video-clips failed: ${txt}`, 500);
    }

    return new Response(
      JSON.stringify({
        success: true,
        newSceneId,
        orderIndex: newOrderIndex,
        anchorImageUrl: anchorUrl,
        mode: body.mode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[hybrid-extend-scene] error:", err);
    return jsonError((err as Error).message ?? "Internal error", 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function markSceneFailed(admin: any, sceneId: string) {
  try {
    await admin
      .from("composer_scenes")
      .update({ clip_status: "failed" })
      .eq("id", sceneId);
  } catch (e) {
    console.warn("[hybrid-extend-scene] failed to mark scene failed:", e);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
