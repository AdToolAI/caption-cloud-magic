import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Demucs separation cost (Replicate ~$0.05/min) → €0.20 per request flat (≥70% margin)
const STEM_SEPARATION_COST_EUR = 0.20;

interface SeparateRequest {
  audioUrl: string;
  assetId?: string;     // Optional source asset id to link
  title?: string;
}

const STEM_TYPES = ['vocals', 'drums', 'bass', 'other'] as const;
type StemType = typeof STEM_TYPES[number];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as SeparateRequest;
    const { audioUrl, assetId, title } = body;

    if (!audioUrl || typeof audioUrl !== 'string') {
      return new Response(JSON.stringify({ error: "audioUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Wallet check
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({
        error: "No AI Credits wallet found.", code: "NO_WALLET", needsPurchase: true
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cost = STEM_SEPARATION_COST_EUR;
    const currency = (wallet.currency || 'EUR') as 'EUR' | 'USD';
    const symbol = currency === 'USD' ? '$' : '€';

    if (wallet.balance_euros < cost) {
      return new Response(JSON.stringify({
        error: `Insufficient credits. Need ${symbol}${cost.toFixed(2)}, have ${symbol}${wallet.balance_euros.toFixed(2)}`,
        code: "INSUFFICIENT_CREDITS",
        needsPurchase: true,
        required: cost,
        available: wallet.balance_euros,
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ error: "REPLICATE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`[separate-audio-stems] user=${user.id} url=${audioUrl}`);

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Demucs by ryan5453 — outputs vocals/drums/bass/other
    let output: any;
    try {
      output = await replicate.run(
        'ryan5453/demucs:5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727f2d0aabb39',
        {
          input: {
            audio: audioUrl,
            stem: 'none',           // Separate ALL stems
            model: 'htdemucs',      // Best quality
            output_format: 'mp3',
          },
        }
      );
    } catch (err: any) {
      console.error('[separate-audio-stems] Demucs error:', err);
      return new Response(JSON.stringify({
        error: `Stem separation failed: ${err.message || 'Unknown error'}`,
        code: "DEMUCS_ERROR",
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // output is an object: { vocals, drums, bass, other }
    if (!output || typeof output !== 'object') {
      return new Response(JSON.stringify({ error: "No stems returned", code: "NO_OUTPUT" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const stemUrls: Partial<Record<StemType, string>> = {};
    for (const stem of STEM_TYPES) {
      const val = (output as any)[stem];
      if (typeof val === 'string') {
        stemUrls[stem] = val;
      } else if (val && typeof val === 'object' && 'url' in val) {
        stemUrls[stem] = typeof val.url === 'function' ? val.url().toString() : val.url;
      }
    }

    if (Object.keys(stemUrls).length === 0) {
      return new Response(JSON.stringify({ error: "No stem files in output", code: "NO_STEMS" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const sessionId = Date.now();
    const baseTitle = title || 'Stems';
    const savedStems: Array<{ type: StemType; url: string; assetId?: string }> = [];

    // Upload each stem to storage + save asset
    for (const [stemType, url] of Object.entries(stemUrls)) {
      try {
        const audioRes = await fetch(url);
        if (!audioRes.ok) continue;
        const buf = await audioRes.arrayBuffer();
        if (buf.byteLength < 1000) continue;

        const path = `${user.id}/stems/${sessionId}-${stemType}.mp3`;
        const { error: upErr } = await supabaseAdmin.storage
          .from('audio-studio')
          .upload(path, new Uint8Array(buf), {
            contentType: 'audio/mpeg',
            upsert: false,
          });

        if (upErr) {
          console.warn(`[separate-audio-stems] upload error ${stemType}:`, upErr);
          continue;
        }

        const { data: urlData } = supabaseAdmin.storage.from('audio-studio').getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        const { data: asset } = await supabaseAdmin
          .from('universal_audio_assets')
          .insert({
            user_id: user.id,
            type: stemType === 'vocals' ? 'voiceover' : 'music',
            title: `${baseTitle} — ${stemType}`,
            url: publicUrl,
            storage_url: publicUrl,
            storage_path: path,
            source: 'stem_separation',
            processing_preset: 'demucs',
            effect_config: {
              stem: stemType,
              source_asset_id: assetId,
              source_url: audioUrl,
              session_id: sessionId,
            },
          })
          .select()
          .single();

        savedStems.push({ type: stemType as StemType, url: publicUrl, assetId: asset?.id });
      } catch (err) {
        console.warn(`[separate-audio-stems] stem ${stemType} processing error:`, err);
      }
    }

    if (savedStems.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to save any stems" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Deduct credits AFTER success
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: cost, p_generation_id: savedStems[0].assetId || null }
    );
    if (deductError) console.error('[separate-audio-stems] deduct error:', deductError);

    return new Response(JSON.stringify({
      success: true,
      stems: savedStems,
      cost,
      currency,
      newBalance: newBalance ?? (wallet.balance_euros - cost),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[separate-audio-stems] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
