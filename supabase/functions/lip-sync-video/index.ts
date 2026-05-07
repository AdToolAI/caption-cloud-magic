import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const COST = 8;
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
    const { video_url, audio_url, scene_id = null, project_id = null, user_id: bodyUserId } = body || {};

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

    const { data: wallet } = await supabase
      .from('wallets').select('balance').eq('user_id', userId).single();
    if (!wallet || wallet.balance < COST) {
      return json({ error: 'INSUFFICIENT_CREDITS', required: COST }, 402);
    }

    const REPLICATE = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE) return json({ error: 'REPLICATE_API_KEY missing' }, 500);

    await supabase.from('wallets').update({
      balance: wallet.balance - COST,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);

    const refund = async (reason: string) => {
      console.warn(`[lip-sync-video] Refund ${COST}: ${reason}`);
      const { data: w2 } = await supabase
        .from('wallets').select('balance').eq('user_id', user.id).single();
      if (w2) {
        await supabase.from('wallets').update({
          balance: w2.balance + COST,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      }
    };

    try {
      const replicate = new Replicate({ auth: REPLICATE });
      // sync-labs/lipsync-2 is the current production lip-sync model
      const output = await replicate.run("sync/lipsync-2" as `${string}/${string}`, {
        input: { video: video_url, audio: audio_url, sync_mode: "loop" },
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

      return json({ success: true, video_url: outUrl, scene_id, project_id, credits_used: COST });
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
