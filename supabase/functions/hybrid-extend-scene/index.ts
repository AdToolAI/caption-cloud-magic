// hybrid-extend-scene v2.0.0 — Block M (Hybrid Production)
//
// Orchestrator for forward / backward / bridge / style-ref of composer scenes.
//
// Modes:
//   - forward    : new scene appended AFTER source, anchored to source's LAST frame
//   - backward   : new scene appended at end, with source's FIRST frame as end_image
//   - bridge     : new scene inserted BETWEEN source(A) and target(B), morphing
//                  from A.last_frame → B.first_frame  (Kling/Luma only)
//   - style-ref  : new scene appended at end, using source's LAST frame purely
//                  as visual style anchor (any engine)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type HybridMode = "forward" | "backward" | "bridge" | "style-ref";
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
  targetSceneId?: string; // bridge only
}

const BACKWARD_CAPABLE: Engine[] = ["ai-kling", "ai-luma"];
const BRIDGE_CAPABLE: Engine[] = BACKWARD_CAPABLE;

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
    if (!authHeader) return jsonError("Unauthorized", 401);
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
    if (!["forward", "backward", "bridge", "style-ref"].includes(body.mode)) {
      return jsonError("mode must be one of: forward, backward, bridge, style-ref", 400);
    }
    if (body.mode === "backward" && !BACKWARD_CAPABLE.includes(body.engine)) {
      return jsonError(
        `Backward extend only supported for: ${BACKWARD_CAPABLE.join(", ")}.`,
        400
      );
    }
    if (body.mode === "bridge") {
      if (!BRIDGE_CAPABLE.includes(body.engine)) {
        return jsonError(
          `Bridge only supported for: ${BRIDGE_CAPABLE.join(", ")}.`,
          400
        );
      }
      if (!body.targetSceneId) {
        return jsonError("Bridge requires targetSceneId", 400);
      }
      if (body.targetSceneId === body.sourceSceneId) {
        return jsonError("Bridge target must differ from source", 400);
      }
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

    // --- Bridge: target scene lookup ---
    let target: any = null;
    if (body.mode === "bridge") {
      const { data: tgt, error: tgtErr } = await admin
        .from("composer_scenes")
        .select("id, project_id, order_index, clip_url, first_frame_url, last_frame_url, duration_seconds")
        .eq("id", body.targetSceneId!)
        .single();
      if (tgtErr || !tgt) return jsonError("Target scene not found", 404);
      if (tgt.project_id !== body.projectId) return jsonError("Target scene belongs to a different project", 400);
      if (!tgt.clip_url) return jsonError("Target scene has no generated clip yet", 400);
      target = tgt;
    }

    // --- Determine new order_index ---
    // Bridge: insert directly AFTER source, shift everything >= that index by +1.
    // Others: append at end.
    let newOrderIndex: number;
    if (body.mode === "bridge") {
      newOrderIndex = (source.order_index ?? 0) + 1;
      // Two-phase shift to avoid unique-index collisions: bump all >= newOrderIndex
      // into a high "negative-space" block, then re-pack with the gap reserved.
      const { data: toShift, error: shiftQueryErr } = await admin
        .from("composer_scenes")
        .select("id, order_index")
        .eq("project_id", body.projectId)
        .gte("order_index", newOrderIndex)
        .order("order_index", { ascending: true });
      if (shiftQueryErr) return jsonError(`Bridge shift query failed: ${shiftQueryErr.message}`, 500);

      if (toShift && toShift.length > 0) {
        const HIGH_OFFSET = 100000;
        // Phase 1: push to high range
        for (const row of toShift) {
          const { error: e1 } = await admin
            .from("composer_scenes")
            .update({ order_index: (row.order_index ?? 0) + HIGH_OFFSET })
            .eq("id", row.id);
          if (e1) return jsonError(`Bridge shift phase 1 failed: ${e1.message}`, 500);
        }
        // Phase 2: bring back to original + 1
        for (const row of toShift) {
          const { error: e2 } = await admin
            .from("composer_scenes")
            .update({ order_index: (row.order_index ?? 0) + 1 })
            .eq("id", row.id);
          if (e2) return jsonError(`Bridge shift phase 2 failed: ${e2.message}`, 500);
        }
      }
    } else {
      const { data: maxRow } = await admin
        .from("composer_scenes")
        .select("order_index")
        .eq("project_id", body.projectId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      newOrderIndex = (maxRow?.order_index ?? -1) + 1;
    }

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
        hybrid_target_scene_id: body.mode === "bridge" ? body.targetSceneId : null,
      } as any)
      .select("id")
      .single();
    if (insErr || !newScene) {
      return jsonError(`Failed to create scene: ${insErr?.message}`, 500);
    }
    const newSceneId = newScene.id;

    // --- Anchor frame extraction ---
    // forward       → source.last
    // backward      → source.first
    // style-ref     → source.last (used as start_image only)
    // bridge        → source.last (start) + target.first (end)
    let startAnchor: string | null = null;
    let endAnchor: string | null = null;

    try {
      if (body.mode === "backward") {
        startAnchor = source.first_frame_url ?? null;
        if (!startAnchor) {
          startAnchor = await extractFrame(admin, SUPABASE_URL, SERVICE_ROLE, {
            videoUrl: source.clip_url,
            mode: "first",
            durationSeconds: source.duration_seconds ?? 5,
            sceneId: source.id,
            projectId: body.projectId,
          });
        }
      } else {
        // forward / style-ref / bridge — all need source LAST frame
        startAnchor = source.last_frame_url ?? null;
        if (!startAnchor) {
          startAnchor = await extractFrame(admin, SUPABASE_URL, SERVICE_ROLE, {
            videoUrl: source.clip_url,
            mode: "last",
            durationSeconds: source.duration_seconds ?? 5,
            sceneId: source.id,
            projectId: body.projectId,
          });
        }
      }

      if (body.mode === "bridge" && target) {
        endAnchor = target.first_frame_url ?? null;
        if (!endAnchor) {
          endAnchor = await extractFrame(admin, SUPABASE_URL, SERVICE_ROLE, {
            videoUrl: target.clip_url,
            mode: "first",
            durationSeconds: target.duration_seconds ?? 5,
            sceneId: target.id,
            projectId: body.projectId,
          });
        }
      }
    } catch (e) {
      await markSceneFailed(admin, newSceneId);
      return jsonError(`Frame extraction failed: ${(e as Error).message}`, 500);
    }

    if (!startAnchor) {
      await markSceneFailed(admin, newSceneId);
      return jsonError("No anchor frame produced", 500);
    }

    // --- Wire anchors onto the NEW scene ---
    const wireUpdate: Record<string, string | null> = {};
    if (body.mode === "backward") {
      // For backward, the source's first frame becomes the END image of the new clip
      wireUpdate.end_reference_image_url = startAnchor;
    } else {
      wireUpdate.reference_image_url = startAnchor;
      if (body.mode === "bridge" && endAnchor) {
        wireUpdate.end_reference_image_url = endAnchor;
      }
    }
    await admin.from("composer_scenes").update(wireUpdate).eq("id", newSceneId);

    // --- Build compose payload ---
    const composeScene: Record<string, unknown> = {
      id: newSceneId,
      clipSource: body.engine,
      clipQuality: quality,
      aiPrompt: body.prompt,
      durationSeconds: duration,
    };
    if (body.mode === "backward") {
      composeScene.endReferenceImageUrl = startAnchor;
    } else {
      composeScene.referenceImageUrl = startAnchor;
      if (body.mode === "bridge" && endAnchor) {
        composeScene.endReferenceImageUrl = endAnchor;
      }
    }

    const composeResp = await fetch(`${SUPABASE_URL}/functions/v1/compose-video-clips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        projectId: body.projectId,
        scenes: [composeScene],
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
        anchorImageUrl: startAnchor,
        endAnchorImageUrl: endAnchor,
        mode: body.mode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[hybrid-extend-scene] error:", err);
    return jsonError((err as Error).message ?? "Internal error", 500);
  }
});

// --- Helpers ---

async function extractFrame(
  _admin: any,
  supabaseUrl: string,
  serviceRole: string,
  params: {
    videoUrl: string;
    mode: "first" | "last";
    durationSeconds: number;
    sceneId: string;
    projectId: string;
  }
): Promise<string> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/extract-video-frames`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt);
  }
  const data = await resp.json();
  const url = params.mode === "first" ? data.firstFrameUrl : data.lastFrameUrl;
  if (!url) throw new Error("Frame extractor returned no URL");
  return url;
}

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
