import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Customer pricing per track in EUR (≥30% margin over Replicate/ElevenLabs cost)
// quick:    MusicGen ~$0.04 → €0.10 (instrumental loops, fast)
// adaptive: Stable Audio 2.5 ~$0.04 → €0.15 (background, loopable, up to ~190s, inpainting/continuation)
// standard: ElevenLabs Music ~$0.20 → €0.35 (full instrumental, polished)
// vocal:    MiniMax Music 1.5 ~$0.05 → €0.30 (with vocals + lyrics, up to 60s)
// pro:      ElevenLabs Music ~$0.80 → €1.40 (long-form pro)
const MUSIC_PRICING: Record<string, { EUR: number; USD: number }> = {
  quick:    { EUR: 0.10, USD: 0.10 },
  adaptive: { EUR: 0.15, USD: 0.15 },
  standard: { EUR: 0.35, USD: 0.35 },
  vocal:    { EUR: 0.30, USD: 0.30 },
  pro:      { EUR: 1.40, USD: 1.40 },
};

const MAX_DURATION: Record<string, number> = {
  quick:    30,
  adaptive: 190,   // Stable Audio 2.5 max ~190s
  standard: 60,
  vocal:    60,    // MiniMax Music 1.5 max 60s
  pro:      300,
};

interface GenerateMusicRequest {
  prompt: string;
  tier: 'quick' | 'adaptive' | 'standard' | 'vocal' | 'pro';
  durationSeconds?: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  bpm?: number;          // Optional target BPM (e.g. match video tempo)
  key?: string;          // Optional musical key (e.g. "C minor")
  lyrics?: string;       // Required for 'vocal' tier (MiniMax) — supports [Verse]/[Chorus]/[Bridge] tags
  loop?: boolean;        // For 'adaptive' tier (Stable Audio loop hint)
}

function buildEnhancedPrompt(req: GenerateMusicRequest): string {
  const parts = [req.prompt.trim()];
  if (req.genre && req.genre !== 'any') parts.push(`Genre: ${req.genre}`);
  if (req.mood) parts.push(`Mood: ${req.mood}`);
  if (req.bpm && req.bpm >= 40 && req.bpm <= 220) {
    parts.push(`Tempo: exactly ${Math.round(req.bpm)} BPM`);
  }
  if (req.key) parts.push(`Key: ${req.key}`);
  if (req.instrumental) parts.push('instrumental, no vocals');
  parts.push('high quality, professional production, studio mastered');
  return parts.join('. ');
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

    const body = await req.json() as GenerateMusicRequest;
    const { prompt, tier, durationSeconds = 30, genre, mood, instrumental = true, bpm, key } = body;

    // Validation
    if (!prompt?.trim() || prompt.length > 500) {
      return new Response(JSON.stringify({ error: "Prompt is required (max 500 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (!MUSIC_PRICING[tier]) {
      return new Response(JSON.stringify({ error: "Invalid tier. Use quick, standard, or pro." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const maxDur = MAX_DURATION[tier];
    const duration = Math.max(5, Math.min(maxDur, durationSeconds));

    // Wallet check
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({
        error: "No AI Credits wallet found. Please purchase credits first.",
        code: "NO_WALLET", needsPurchase: true
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currency = (wallet.currency || 'EUR') as 'EUR' | 'USD';
    const cost = MUSIC_PRICING[tier][currency] || MUSIC_PRICING[tier].EUR;
    const currencySymbol = currency === 'USD' ? '$' : '€';

    if (wallet.balance_euros < cost) {
      return new Response(JSON.stringify({
        error: `Insufficient credits. Need ${currencySymbol}${cost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
        code: "INSUFFICIENT_CREDITS",
        needsPurchase: true,
        required: cost,
        available: wallet.balance_euros,
        currency,
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const enhancedPrompt = buildEnhancedPrompt(body);
    console.log(`[generate-music-track] tier=${tier} duration=${duration}s cost=${currencySymbol}${cost}`);

    let audioBuffer: ArrayBuffer | null = null;
    let engineUsed = '';

    // ===== TIER ROUTING =====
    if (tier === 'quick') {
      // ----- Replicate MusicGen (Meta) -----
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        return new Response(JSON.stringify({ error: "REPLICATE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      engineUsed = 'replicate/musicgen';
      const replicate = new Replicate({ auth: REPLICATE_API_KEY });

      let output: any;
      try {
        output = await replicate.run(
          'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
          {
            input: {
              prompt: enhancedPrompt,
              duration,
              model_version: 'stereo-large',
              output_format: 'mp3',
              normalization_strategy: 'peak',
            },
          }
        );
      } catch (err: any) {
        console.error('[generate-music-track] Replicate error:', err);
        return new Response(JSON.stringify({
          error: `Music generation failed: ${err.message || 'Unknown error'}`,
          code: "REPLICATE_ERROR",
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let audioUrl: string | null = null;
      if (typeof output === 'string') audioUrl = output;
      else if (Array.isArray(output) && output.length > 0) audioUrl = typeof output[0] === 'string' ? output[0] : null;
      else if (output && typeof output === 'object' && 'url' in output) {
        audioUrl = typeof (output as any).url === 'function' ? (output as any).url().toString() : (output as any).url;
      }

      if (!audioUrl) {
        return new Response(JSON.stringify({ error: "No audio returned from MusicGen", code: "NO_OUTPUT" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch generated audio" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      audioBuffer = await audioRes.arrayBuffer();

    } else {
      // ----- ElevenLabs Music (standard / pro) -----
      const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
      if (!ELEVENLABS_API_KEY) {
        return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      engineUsed = 'elevenlabs/music';

      const elResponse = await fetch('https://api.elevenlabs.io/v1/music', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          music_length_ms: duration * 1000,
        }),
      });

      if (!elResponse.ok) {
        const errText = await elResponse.text().catch(() => '');
        console.error('[generate-music-track] ElevenLabs error:', elResponse.status, errText);
        if (elResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly.", code: "RATE_LIMIT" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (elResponse.status === 402) {
          return new Response(JSON.stringify({ error: "ElevenLabs quota exceeded.", code: "PROVIDER_QUOTA" }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({
          error: `ElevenLabs Music failed (${elResponse.status})`,
          code: "ELEVENLABS_ERROR",
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      audioBuffer = await elResponse.arrayBuffer();
    }

    if (!audioBuffer || audioBuffer.byteLength < 1000) {
      return new Response(JSON.stringify({ error: "Generated audio too small / invalid" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ===== Upload to Storage =====
    const storagePath = `${user.id}/music/${tier}-${Date.now()}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('audio-studio')
      .upload(storagePath, new Uint8Array(audioBuffer), {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[generate-music-track] Storage upload error:', uploadError);
      return new Response(JSON.stringify({ error: `Storage error: ${uploadError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('audio-studio')
      .getPublicUrl(storagePath);
    const publicUrl = publicUrlData.publicUrl;

    // Title from prompt
    const title = prompt.trim().slice(0, 60) + (prompt.length > 60 ? '...' : '');

    // ===== Insert into universal_audio_assets =====
    const { data: asset, error: insertError } = await supabaseAdmin
      .from('universal_audio_assets')
      .insert({
        user_id: user.id,
        type: 'music',
        title,
        url: publicUrl,
        storage_url: publicUrl,
        storage_path: storagePath,
        duration_sec: duration,
        genre: genre || null,
        mood: mood || null,
        source: 'generated',
        processing_preset: tier,
        effect_config: {
          prompt: prompt.trim(),
          enhanced_prompt: enhancedPrompt,
          engine: engineUsed,
          instrumental,
          bpm: bpm || null,
          key: key || null,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.warn('[generate-music-track] Asset insert warning:', insertError);
    }

    // ===== Deduct credits AFTER successful generation =====
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: cost, p_generation_id: asset?.id || null }
    );

    if (deductError) {
      console.error('[generate-music-track] Deduct error:', deductError);
    }

    return new Response(JSON.stringify({
      success: true,
      track: {
        id: asset?.id,
        url: publicUrl,
        title,
        duration_sec: duration,
        engine: engineUsed,
      },
      cost,
      currency,
      newBalance: newBalance ?? (wallet.balance_euros - cost),
      tier,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[generate-music-track] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
