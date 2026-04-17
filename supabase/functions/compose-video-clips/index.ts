// compose-video-clips v2.1.0 — webhook_events_filter fix (only "completed" allowed)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Quality = 'standard' | 'pro';

// Cost per second by source × quality tier — synced with client (src/types/video-composer.ts)
const CLIP_COSTS: Record<string, Record<Quality, number>> = {
  'ai-hailuo': { standard: 0.15, pro: 0.20 },
  'ai-kling':  { standard: 0.15, pro: 0.21 },
  'ai-sora':   { standard: 0.25, pro: 0.53 },
};

interface ClipScene {
  id: string;
  clipSource: string;
  clipQuality?: Quality;
  aiPrompt?: string;
  stockKeywords?: string;
  uploadUrl?: string;
  /** Optional image used as visual guide for AI sources (image-to-video). */
  referenceImageUrl?: string;
  durationSeconds: number;
}

interface ClipRequest {
  projectId: string;
  scenes: ClipScene[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: ClipRequest = await req.json();
    const { projectId, scenes } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "MISSING_PROJECT_ID", message: "projectId is required — project must be saved before clips can be generated" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!scenes?.length) {
      return new Response(
        JSON.stringify({ error: "MISSING_SCENES", message: "At least one scene is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify project ownership
    const { data: project, error: projError } = await supabaseAdmin
      .from('composer_projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projError || !project) {
      return new Response(
        JSON.stringify({ error: "PROJECT_NOT_FOUND", message: "Project not found or you don't have access to it" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total cost for AI scenes (quality-tier aware)
    const aiScenes = scenes.filter(s => s.clipSource.startsWith('ai-'));
    let totalCost = 0;
    for (const scene of aiScenes) {
      const quality: Quality = scene.clipQuality === 'pro' ? 'pro' : 'standard';
      const costPerSec = CLIP_COSTS[scene.clipSource]?.[quality] ?? 0.15;
      totalCost += scene.durationSeconds * costPerSec;
    }

    // Check wallet if AI scenes exist
    if (aiScenes.length > 0) {
      const { data: wallet } = await supabaseAdmin
        .from('ai_video_wallets')
        .select('balance_euros, currency')
        .eq('user_id', user.id)
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({ error: "No AI Video wallet found", code: "NO_WALLET", needsPurchase: true }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (wallet.balance_euros < totalCost) {
        return new Response(
          JSON.stringify({
            error: `Insufficient credits. Need €${totalCost.toFixed(2)}, have €${wallet.balance_euros.toFixed(2)}`,
            code: "INSUFFICIENT_CREDITS", needsPurchase: true,
            required: totalCost, available: wallet.balance_euros
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update project status
    await supabaseAdmin
      .from('composer_projects')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    const replicate = new Replicate({ auth: Deno.env.get("REPLICATE_API_KEY") });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const webhookUrl = `${supabaseUrl}/functions/v1/compose-clip-webhook`;

    // Append a negative-text suffix to AI prompts so models don't burn captions/watermarks
    // into the generated clip (would conflict with our manual overlay system).
    // Hard guard: NEVER allow burned-in text, captions, subtitles or any written
    // language in the generated clip — they would conflict with our overlay /
    // subtitle system in the "Voice & Subtitles" tab.
    const NEGATIVE_TEXT_SUFFIX = ", no on-screen text, no captions, no subtitles, no watermarks, no logos, no written words, no typography, no signs with readable text, no UI overlays, no lower thirds, no isolated product on plain background, no floating product, no product rotating in empty space, clean visuals only";
    const enrichPrompt = (prompt?: string): string => {
      const base = (prompt || "cinematic footage").trim();
      const lower = base.toLowerCase();
      if (lower.includes("no subtitles") && lower.includes("no captions") && lower.includes("no on-screen text")) {
        return base;
      }
      // Strip any partial old guard before re-appending the canonical one
      const cleaned = base.replace(/,?\s*no on-screen text[\s\S]*$/i, "").trim().replace(/[,.]\s*$/, "");
      return cleaned + NEGATIVE_TEXT_SUFFIX;
    };

    const results: Array<{ sceneId: string; status: string; predictionId?: string; clipUrl?: string; error?: string }> = [];

    // Helper: extract a useful error message from Replicate / generic errors
    const errorToString = (err: unknown): string => {
      if (!err) return 'Unknown error';
      if (err instanceof Error) {
        // Replicate errors often have .response.data with details
        const anyErr = err as any;
        const detail = anyErr?.response?.data?.detail || anyErr?.response?.data?.error || anyErr?.response?.statusText;
        if (detail) return `${err.message} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
        return err.message;
      }
      try { return JSON.stringify(err); } catch { return String(err); }
    };

    // Process each scene
    for (const scene of scenes) {
      const quality: Quality = scene.clipQuality === 'pro' ? 'pro' : 'standard';

      try {
        if (scene.clipSource === 'upload' && scene.uploadUrl) {
          // Upload: just mark as ready
          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_url: scene.uploadUrl, clip_status: 'ready', updated_at: new Date().toISOString() })
            .eq('id', scene.id);
          results.push({ sceneId: scene.id, status: 'ready', clipUrl: scene.uploadUrl });

        } else if (scene.clipSource === 'stock' && scene.stockKeywords) {
          // Stock: search and pick best match
          const stockResponse = await fetch(`${supabaseUrl}/functions/v1/search-stock-videos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ query: scene.stockKeywords, perPage: 5 }),
          });

          const stockData = await stockResponse.json();
          const bestVideo = stockData.videos?.[0];

          if (bestVideo) {
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_url: bestVideo.url, clip_status: 'ready', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'ready', clipUrl: bestVideo.url });
          } else {
            await supabaseAdmin
              .from('composer_scenes')
              .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'failed', error: 'No stock videos found' });
          }

        } else if (scene.clipSource === 'ai-hailuo') {
          // Hailuo via Replicate (Standard 768p / Pro 1080p)
          const duration = scene.durationSeconds >= 8 ? 10 : 6;
          const resolution = quality === 'pro' ? '1080p' : '768p';

          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_status: 'generating', clip_quality: quality, updated_at: new Date().toISOString() })
            .eq('id', scene.id);

          const hailuoInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt),
            duration: duration,
            resolution: resolution,
          };
          // Image-to-Video: use reference image as the first frame
          if (scene.referenceImageUrl) {
            hailuoInput.first_frame_image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Hailuo scene ${scene.id} uses reference image`);
          }

          const prediction = await replicate.predictions.create({
            model: "minimax/hailuo-2.3",
            input: hailuoInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-kling') {
          // Kling via Replicate — Kling 2.1
          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_status: 'generating', clip_quality: quality, updated_at: new Date().toISOString() })
            .eq('id', scene.id);

          const klingInput: Record<string, unknown> = {
            prompt: enrichPrompt(scene.aiPrompt),
            duration: Math.min(scene.durationSeconds, 10),
            aspect_ratio: "16:9",
            mode: quality === 'pro' ? 'pro' : 'standard',
          };
          // Image-to-Video: Kling 2.1 supports start_image
          if (scene.referenceImageUrl) {
            klingInput.start_image = scene.referenceImageUrl;
            console.log(`[compose-video-clips] Kling scene ${scene.id} uses reference image`);
          }

          const prediction = await replicate.predictions.create({
            model: "kwaivgi/kling-v2.1",
            input: klingInput,
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else {
          // Unknown source, skip
          results.push({ sceneId: scene.id, status: 'skipped', error: `Unknown clip source: ${scene.clipSource}` });
        }
      } catch (sceneError) {
        const errMsg = errorToString(sceneError);
        console.error(`[compose-video-clips] Scene ${scene.id} error:`, errMsg);
        await supabaseAdmin
          .from('composer_scenes')
          .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', scene.id);
        results.push({ sceneId: scene.id, status: 'failed', error: errMsg });
      }
    }

    // Deduct credits ONLY for AI scenes that actually started generating
    const generatingResults = results.filter(r => r.status === 'generating');
    const generatingCount = generatingResults.length;
    let actualCost = 0;
    for (const r of generatingResults) {
      const scene = scenes.find(s => s.id === r.sceneId);
      if (!scene) continue;
      const q: Quality = scene.clipQuality === 'pro' ? 'pro' : 'standard';
      actualCost += scene.durationSeconds * (CLIP_COSTS[scene.clipSource]?.[q] ?? 0);
    }

    if (generatingCount > 0 && actualCost > 0) {
      try {
        await supabaseAdmin.rpc('deduct_ai_video_credits', {
          p_user_id: user.id,
          p_amount: actualCost,
          p_generation_id: projectId,
        });
        console.log(`[compose-video-clips] Deducted €${actualCost.toFixed(2)} for ${generatingCount} AI clips`);
      } catch (creditErr) {
        console.error('[compose-video-clips] Credit deduction failed:', creditErr);
      }
    }

    // Check if all scenes are already done (stock/upload only)
    const allDone = results.every(r => r.status === 'ready' || r.status === 'skipped');
    if (allDone) {
      await supabaseAdmin
        .from('composer_projects')
        .update({ status: 'preview', updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    return new Response(
      JSON.stringify({ success: true, results, totalCost: actualCost, generatingCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[compose-video-clips] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
