import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

// Artlist-grade lip-sync via Sync.so lipsync-2-pro
// Duration-based pricing: 16 credits/s ≈ €0.16/s (raised from 9, 3.5× margin
// cap on ~€0.046/s Sync.so Creator raw cost). Mirrors frontend estimate in
// src/lib/composer/estimateSceneRenderCost.ts and compose-dialog-segments.
const CREDITS_PER_SECOND = 16;
const MIN_COST = 16;
const FALLBACK_DURATION_SEC = 10; // conservative cap when caller omits duration
const computeCost = (durationSec: number): number =>
  Math.max(MIN_COST, Math.ceil(Math.max(0, durationSec)) * CREDITS_PER_SECOND);
const LIPSYNC_MODEL = "sync/lipsync-2-pro" as `${string}/${string}`;
// Idempotency namespace for deterministic refund UUIDs
const REFUND_NS = 'b3f4c1a8-1d4e-4cf7-9b1c-a4b9d77ef111';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const token = auth.replace('Bearer ', '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const body = await req.json();
    const { video_url, audio_url, scene_id = null, project_id = null, user_id: bodyUserId, duration_seconds } = body || {};

    // Allow service-role calls (e.g. from remotion-webhook) to pass user_id
    // explicitly instead of a user JWT.
    let userId: string | null = null;
    if (token === serviceKey && bodyUserId) {
      userId = String(bodyUserId);
    } else {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    if (!video_url || !audio_url) return json({ error: 'video_url and audio_url required' }, 400);

    const durSec = Number.isFinite(Number(duration_seconds)) && Number(duration_seconds) > 0
      ? Number(duration_seconds)
      : FALLBACK_DURATION_SEC;
    const cost = computeCost(durSec);

    const { data: wallet } = await supabase
      .from('wallets').select('balance').eq('user_id', userId).single();
    if (!wallet || wallet.balance < cost) {
      return json({ error: 'INSUFFICIENT_CREDITS', required: cost }, 402);
    }

    const REPLICATE = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE) return json({ error: 'REPLICATE_API_KEY missing' }, 500);

    await supabase.from('wallets').update({
      balance: wallet.balance - cost,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    const refund = async (reason: string) => {
      console.warn(`[lip-sync-video] Refund ${cost}: ${reason}`);
      const { data: w2 } = await supabase
        .from('wallets').select('balance').eq('user_id', userId).single();
      if (w2) {
        await supabase.from('wallets').update({
          balance: w2.balance + cost,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }
    };

    try {
      const replicate = new Replicate({ auth: REPLICATE });
      // Sync.so lipsync-2-pro — identity-locked, Artlist-grade fidelity
      const output = await replicate.run(LIPSYNC_MODEL, {
        input: {
          video: video_url,
          audio: audio_url,
          sync_mode: "loop",
          temperature: 0.5,
          active_speaker: true,
          output_format: "mp4",
        },
      });

      let outUrl: string | null = null;
      if (typeof output === 'string') outUrl = output;
      else if (Array.isArray(output) && output.length) outUrl = output[0] as string;
      else if (output && typeof output === 'object') {
        const o = output as Record<string, unknown>;
        outUrl = (o.video || o.output || o.url) as string ?? null;
      }
      if (!outUrl) {
        await refund('no output url');
        return json({ error: 'no output' }, 502);
      }

      return json({ success: true, video_url: outUrl, scene_id, project_id, credits_used: cost });
    } catch (e) {
      await refund(`replicate error: ${(e as Error).message}`);
      return json({ error: (e as Error).message }, 502);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
