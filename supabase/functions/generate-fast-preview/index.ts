/**
 * Phase 5.1 — Fast Preview Layer
 *
 * Generates a sub-10-second LTX-Video preview for a Composer scene so the user
 * can sanity-check the composition long before the heavy provider (Hailuo,
 * Kling, Sora, …) finishes its 30–90 s HQ render.
 *
 * Cost-control:
 *   - Free per call but the scene's `preview_status` acts as an in-flight lock
 *     (only one preview per scene at a time).
 *   - LTX is the cheapest fast model on Replicate (~$0.005 / call).
 *
 * Storage:
 *   - The Replicate URL is rehosted to the existing `ai-videos` bucket under
 *     the user's directory (RLS-safe path: `${userId}/preview-${sceneId}.mp4`).
 *
 * Response:
 *   - 202 Accepted with { previewStatus: 'generating', predictionId }
 *   - The actual URL lands on `composer_scenes.preview_clip_url` once polling
 *     completes (background via `EdgeRuntime.waitUntil`).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface FastPreviewRequest {
  sceneId: string;
  prompt: string;
  startImageUrl?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

const LTX_MODEL = "lightricks/ltx-video";

async function pollAndPersist(params: {
  predictionId: string;
  sceneId: string;
  userId: string;
  replicate: Replicate;
}) {
  const { predictionId, sceneId, userId, replicate } = params;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = Date.now();
  const MAX_POLL_MS = 90_000; // LTX usually < 15s
  const POLL_INTERVAL_MS = 2_000;

  try {
    while (Date.now() - startedAt < MAX_POLL_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const prediction = await replicate.predictions.get(predictionId);
      console.log(`[fast-preview] ${predictionId} status=${prediction.status}`);

      if (prediction.status === 'succeeded') {
        const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        if (!out) throw new Error('LTX succeeded but no output URL');

        let permanentUrl = out as string;
        try {
          const dl = await fetch(out as string);
          if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
          const buf = await dl.arrayBuffer();
          // RLS-safe path: user id is the first segment.
          const fileName = `${userId}/preview-${sceneId}.mp4`;
          const { error: upErr } = await supabaseAdmin.storage
            .from('ai-videos')
            .upload(fileName, buf, { contentType: 'video/mp4', upsert: true });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabaseAdmin.storage.from('ai-videos').getPublicUrl(fileName);
          permanentUrl = publicUrl;
        } catch (storageErr) {
          console.error('[fast-preview] rehost failed, keeping Replicate URL:', storageErr);
        }

        await supabaseAdmin
          .from('composer_scenes')
          .update({
            preview_clip_url: permanentUrl,
            preview_status: 'ready',
          })
          .eq('id', sceneId);
        return;
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        await supabaseAdmin
          .from('composer_scenes')
          .update({ preview_status: 'failed' })
          .eq('id', sceneId);
        console.error('[fast-preview] LTX failed:', prediction.error);
        return;
      }
    }

    // Timeout
    await supabaseAdmin
      .from('composer_scenes')
      .update({ preview_status: 'failed' })
      .eq('id', sceneId);
    console.error('[fast-preview] timeout');
  } catch (err) {
    console.error('[fast-preview] poll error:', err);
    await supabaseAdmin
      .from('composer_scenes')
      .update({ preview_status: 'failed' })
      .eq('id', sceneId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp4", videoUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp4", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-5s.mp4", predictionId: "qa-mock-video", status: "succeeded", duration: 5 });


  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as FastPreviewRequest;
    if (!body.sceneId || !body.prompt || body.prompt.trim().length < 4) {
      return new Response(JSON.stringify({ error: 'sceneId and prompt (min 4 chars) are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Ownership check + in-flight lock
    const { data: scene, error: sceneErr } = await supabaseAdmin
      .from('composer_scenes')
      .select('id, project_id, preview_status, composer_projects!inner(user_id)')
      .eq('id', body.sceneId)
      .maybeSingle();

    if (sceneErr || !scene) {
      return new Response(JSON.stringify({ error: 'Scene not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore nested join shape
    const ownerId = scene.composer_projects?.user_id;
    if (ownerId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (scene.preview_status === 'generating') {
      return new Response(JSON.stringify({
        ok: true,
        previewStatus: 'generating',
        message: 'Preview already in flight',
      }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const REPLICATE_API_KEY =
      Deno.env.get('REPLICATE_API_KEY') ?? Deno.env.get('REPLICATE_API_TOKEN');
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ error: 'REPLICATE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Mark in-flight
    await supabaseAdmin
      .from('composer_scenes')
      .update({ preview_status: 'generating', preview_clip_url: null })
      .eq('id', body.sceneId);

    // LTX-Video input. Keep tiny: low res, 3 seconds, 24 fps.
    const ltxInput: Record<string, unknown> = {
      prompt: body.prompt.slice(0, 500),
      length: 73, // ~3 s @ 24 fps
      width: body.aspectRatio === '9:16' ? 384 : body.aspectRatio === '1:1' ? 512 : 640,
      height: body.aspectRatio === '9:16' ? 640 : body.aspectRatio === '1:1' ? 512 : 384,
      target_size: 384,
    };
    if (body.startImageUrl) {
      ltxInput.image = body.startImageUrl;
    }

    let prediction;
    try {
      prediction = await replicate.predictions.create({
        model: LTX_MODEL,
        input: ltxInput,
      });
    } catch (err) {
      console.error('[fast-preview] LTX submit failed:', err);
      await supabaseAdmin
        .from('composer_scenes')
        .update({ preview_status: 'failed' })
        .eq('id', body.sceneId);
      return new Response(JSON.stringify({
        error: 'Fast preview submission failed',
        details: err instanceof Error ? err.message : String(err),
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(pollAndPersist({
      predictionId: prediction.id,
      sceneId: body.sceneId,
      userId: user.id,
      replicate,
    }));

    return new Response(JSON.stringify({
      ok: true,
      previewStatus: 'generating',
      predictionId: prediction.id,
    }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[fast-preview] error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
