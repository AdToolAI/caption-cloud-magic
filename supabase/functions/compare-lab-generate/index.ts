// Compare Lab — Multi-Engine Fan-Out
//
// Triggers parallel video generations across 2-6 engines for the SAME prompt.
// Creates a compare_lab_runs row + one compare_lab_outputs row per engine,
// then invokes each engine's existing edge function.
//
// The engines write to ai_video_generations as usual; a polling job on the
// client links generation status back to compare_lab_outputs by generation_id.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EngineKey = 'sora' | 'kling' | 'seedance' | 'wan' | 'hailuo' | 'luma';

// Maps each engine to its edge-function name + default model + per-second cost.
const ENGINE_CONFIG: Record<EngineKey, {
  fn: string;
  model: string;
  costPerSec: number;
  modelField: string;
}> = {
  sora:     { fn: 'generate-sora-chain',    model: 'sora-2',          costPerSec: 0.10, modelField: 'model' },
  kling:    { fn: 'generate-kling-video',   model: 'kling-3-standard', costPerSec: 0.15, modelField: 'model' },
  seedance: { fn: 'generate-seedance-video', model: 'seedance-1-lite', costPerSec: 0.06, modelField: 'model' },
  wan:      { fn: 'generate-wan-video',     model: 'wan-2.5-t2v',     costPerSec: 0.10, modelField: 'model' },
  hailuo:   { fn: 'generate-hailuo-video',  model: 'hailuo-2.3',      costPerSec: 0.08, modelField: 'model' },
  luma:     { fn: 'generate-luma-video',    model: 'luma-ray-2',      costPerSec: 0.12, modelField: 'model' },
};

interface CompareRequest {
  prompt: string;
  promptSlots?: Record<string, string>;
  engines: EngineKey[];
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  sourceImageUrl?: string;
  composerSceneId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = (await req.json()) as CompareRequest;
    const {
      prompt,
      promptSlots,
      engines,
      durationSeconds = 5,
      aspectRatio = '16:9',
      sourceImageUrl,
      composerSceneId,
    } = body;

    if (!prompt?.trim()) throw new Error("prompt is required");
    if (!engines?.length || engines.length < 2) throw new Error("at least 2 engines required");
    if (engines.length > 6) throw new Error("max 6 engines");

    // Get wallet currency
    const { data: wallet } = await supabaseClient
      .from('ai_video_wallets')
      .select('currency, balance_euros')
      .eq('user_id', user.id)
      .single();

    const currency = wallet?.currency || 'EUR';

    // Pre-flight cost estimate
    const estimatedCost = engines.reduce((sum, e) => {
      const cfg = ENGINE_CONFIG[e];
      return cfg ? sum + cfg.costPerSec * durationSeconds : sum;
    }, 0);

    if (wallet && wallet.balance_euros < estimatedCost) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient credits',
          required: estimatedCost,
          available: wallet.balance_euros,
          currency,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the run row
    const { data: run, error: runError } = await supabaseAdmin
      .from('compare_lab_runs')
      .insert({
        user_id: user.id,
        prompt,
        prompt_slots: promptSlots ?? null,
        engines,
        duration_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        source_image_url: sourceImageUrl ?? null,
        composer_scene_id: composerSceneId ?? null,
        status: 'running',
        currency,
        total_cost_euros: estimatedCost,
      })
      .select()
      .single();

    if (runError || !run) throw new Error(`Failed to create run: ${runError?.message}`);

    // Create output rows + fire-and-forget generation calls
    const outputs = await Promise.all(
      engines.map(async (engine) => {
        const cfg = ENGINE_CONFIG[engine];
        if (!cfg) {
          return { engine, error: 'unknown engine' };
        }

        const cost = cfg.costPerSec * durationSeconds;

        // Insert output row first
        const { data: output, error: outErr } = await supabaseAdmin
          .from('compare_lab_outputs')
          .insert({
            run_id: run.id,
            user_id: user.id,
            engine,
            model: cfg.model,
            status: 'pending',
            cost_euros: cost,
            duration_seconds: durationSeconds,
          })
          .select()
          .single();

        if (outErr || !output) {
          return { engine, error: outErr?.message || 'insert failed' };
        }

        // Build engine-specific payload
        const payload: Record<string, unknown> = {
          prompt,
          duration: durationSeconds,
          aspectRatio,
        };
        payload[cfg.modelField] = cfg.model;
        if (sourceImageUrl) {
          payload.startImageUrl = sourceImageUrl;
          payload.sourceImageUrl = sourceImageUrl;
          payload.imageUrl = sourceImageUrl;
        }

        // Invoke the engine function (do NOT await response body — fire and forget)
        // The function will create an ai_video_generations row; we link it back.
        try {
          const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${cfg.fn}`;
          // We use waitUntil-pattern by NOT awaiting, but Deno serve doesn't have it,
          // so we await but don't block on the polling. The generation itself is async.
          const resp = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          let generationId: string | null = null;
          let errorMsg: string | null = null;
          let videoUrl: string | null = null;
          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            generationId = data?.generationId || data?.generation_id || data?.id || null;
            videoUrl = data?.videoUrl || data?.video_url || null;
          } else {
            errorMsg = `${cfg.fn} returned ${resp.status}`;
          }

          // Update output row with generation_id (or error)
          await supabaseAdmin
            .from('compare_lab_outputs')
            .update({
              generation_id: generationId,
              status: errorMsg ? 'failed' : (videoUrl ? 'completed' : 'running'),
              video_url: videoUrl,
              error_message: errorMsg,
            })
            .eq('id', output.id);

          return { engine, output_id: output.id, generation_id: generationId, error: errorMsg };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown error';
          await supabaseAdmin
            .from('compare_lab_outputs')
            .update({ status: 'failed', error_message: msg })
            .eq('id', output.id);
          return { engine, output_id: output.id, error: msg };
        }
      })
    );

    return new Response(
      JSON.stringify({
        runId: run.id,
        outputs,
        currency,
        estimatedCost,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[compare-lab-generate] error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
