import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cost per second by model
const CLIP_COSTS: Record<string, number> = {
  'ai-hailuo': 0.15,
  'ai-kling': 0.15,
  'ai-sora': 0.25,
};

interface ClipRequest {
  projectId: string;
  scenes: Array<{
    id: string;
    clipSource: string;
    aiPrompt?: string;
    stockKeywords?: string;
    uploadUrl?: string;
    durationSeconds: number;
  }>;
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

    if (!projectId || !scenes?.length) {
      throw new Error("projectId and scenes are required");
    }

    // Verify project ownership
    const { data: project, error: projError } = await supabaseAdmin
      .from('composer_projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projError || !project) {
      throw new Error("Project not found or unauthorized");
    }

    // Calculate total cost for AI scenes
    const aiScenes = scenes.filter(s => s.clipSource.startsWith('ai-'));
    let totalCost = 0;
    for (const scene of aiScenes) {
      const costPerSec = CLIP_COSTS[scene.clipSource] || 0.15;
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

    const results: Array<{ sceneId: string; status: string; predictionId?: string; clipUrl?: string; error?: string }> = [];

    // Process each scene
    for (const scene of scenes) {
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
          // Hailuo via Replicate
          const duration = scene.durationSeconds >= 8 ? 10 : 6;
          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_status: 'generating', updated_at: new Date().toISOString() })
            .eq('id', scene.id);

          const prediction = await replicate.predictions.create({
            model: "minimax/hailuo-2.3",
            input: {
              prompt: scene.aiPrompt || "cinematic footage",
              duration: duration,
              resolution: "768p",
            },
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed", "failed"],
          });

          await supabaseAdmin
            .from('composer_scenes')
            .update({ replicate_prediction_id: prediction.id })
            .eq('id', scene.id);

          results.push({ sceneId: scene.id, status: 'generating', predictionId: prediction.id });

        } else if (scene.clipSource === 'ai-kling') {
          // Kling via Replicate
          await supabaseAdmin
            .from('composer_scenes')
            .update({ clip_status: 'generating', updated_at: new Date().toISOString() })
            .eq('id', scene.id);

          const prediction = await replicate.predictions.create({
            model: "kwaai/kling-3.0-pro",
            input: {
              prompt: scene.aiPrompt || "cinematic footage",
              duration: Math.min(scene.durationSeconds, 10),
              aspect_ratio: "16:9",
            },
            webhook: `${webhookUrl}?scene_id=${scene.id}&project_id=${projectId}`,
            webhook_events_filter: ["completed", "failed"],
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
        console.error(`[compose-video-clips] Scene ${scene.id} error:`, sceneError);
        await supabaseAdmin
          .from('composer_scenes')
          .update({ clip_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', scene.id);
        results.push({ sceneId: scene.id, status: 'failed', error: String(sceneError) });
      }
    }

    // Deduct credits for AI scenes that started generating
    const generatingCount = results.filter(r => r.status === 'generating').length;
    if (generatingCount > 0 && totalCost > 0) {
      try {
        await supabaseAdmin.rpc('deduct_ai_video_credits', {
          p_user_id: user.id,
          p_amount: totalCost,
          p_generation_id: projectId,
        });
        console.log(`[compose-video-clips] Deducted €${totalCost.toFixed(2)} for ${generatingCount} AI clips`);
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
      JSON.stringify({ success: true, results, totalCost, generatingCount }),
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
