import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// ---- Engine catalog (mirror of src/lib/music/engineCatalog.ts) ----
interface EngineMeta {
  price: number;
  maxDuration: number;
  route: 'replicate' | 'direct-elevenlabs' | 'direct-stability' | 'direct-lyria';
  vocals: boolean;
  requiresLyrics: boolean;
  replicateModel?: string;
  label: string;
}
const ENGINES: Record<string, EngineMeta> = {
  'stable-audio-25':      { price: 0.15, maxDuration: 190, route: 'replicate',         vocals: false, requiresLyrics: false, replicateModel: 'stability-ai/stable-audio-2.5', label: 'Stable Audio 2.5' },
  'stable-audio-3-large': { price: 0.18, maxDuration: 190, route: 'direct-stability',  vocals: false, requiresLyrics: false, label: 'Stable Audio 3.0 Large' },
  'minimax-15':           { price: 0.30, maxDuration: 60,  route: 'replicate',         vocals: true,  requiresLyrics: true,  replicateModel: 'minimax/music-1.5', label: 'MiniMax Music 1.5' },
  'elevenlabs-music-v2':  { price: 0.36, maxDuration: 300, route: 'direct-elevenlabs', vocals: true,  requiresLyrics: false, label: 'ElevenLabs Music v2' },
  'lyria-3-pro':          { price: 0.42, maxDuration: 60,  route: 'direct-lyria',      vocals: true,  requiresLyrics: true,  label: 'Google Lyria 3 Pro' },
};

// Legacy tier IDs → new engine IDs (keeps old clients / stored plans working).
const LEGACY_ALIAS: Record<string, string> = {
  quick:                 'stable-audio-3-large',
  adaptive:              'stable-audio-25',
  standard:              'elevenlabs-music-v2',
  vocal:                 'minimax-15',
  pro:                   'elevenlabs-music-v2',
  'suno-v5':             'elevenlabs-music-v2',
  'stable-audio-open-2': 'stable-audio-3-large',
};

function resolveEngine(id: string): { id: string; meta: EngineMeta } | null {
  const normalized = ENGINES[id] ? id : LEGACY_ALIAS[id];
  if (!normalized) return null;
  return { id: normalized, meta: ENGINES[normalized] };
}


interface GenerateMusicRequest {
  prompt: string;
  tier: string;                     // engineId (or legacy tier)
  durationSeconds?: number;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  bpm?: number;
  key?: string;
  lyrics?: string;
  loop?: boolean;
  language?: string;
  languageName?: string;
  styleTags?: string;               // Suno style tags
}

function buildEnhancedPrompt(req: GenerateMusicRequest): string {
  const parts = [req.prompt.trim()];
  if (req.genre && req.genre !== 'any') parts.push(`Genre: ${req.genre}`);
  if (req.mood) parts.push(`Mood: ${req.mood}`);
  if (req.bpm && req.bpm >= 40 && req.bpm <= 220) parts.push(`Tempo: exactly ${Math.round(req.bpm)} BPM`);
  if (req.key) parts.push(`Key: ${req.key}`);
  if (req.instrumental) parts.push('instrumental, no vocals');
  parts.push('high quality, professional production, studio mastered');
  return parts.join('. ');
}

function extractAudioUrl(output: any): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) {
    return typeof output[0] === 'string' ? output[0] : null;
  }
  if (output && typeof output === 'object') {
    if ('audio' in output && typeof (output as any).audio === 'string') return (output as any).audio;
    if ('url' in output) {
      const u = (output as any).url;
      return typeof u === 'function' ? u().toString() : u;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "music" });
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
    const { prompt, tier, durationSeconds = 30, genre, mood, instrumental = true, bpm, key, lyrics, loop, languageName, styleTags } = body;

    if (!prompt?.trim() || prompt.length > 800) {
      return new Response(JSON.stringify({ error: "Prompt is required (max 800 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const resolved = resolveEngine(tier);
    if (!resolved) {
      return new Response(JSON.stringify({ error: `Unknown engine '${tier}'` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const engineId = resolved.id;
    const engine = resolved.meta;

    if (engine.requiresLyrics && (!lyrics || !lyrics.trim() || lyrics.trim().length < 10)) {
      return new Response(JSON.stringify({
        error: "Lyrics zu kurz (min. 10 Zeichen). Bitte Songtext eingeben oder AI-Lyrics generieren.",
        code: "MISSING_LYRICS",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const duration = Math.max(5, Math.min(engine.maxDuration, durationSeconds));

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
    const cost = engine.price;
    const currencySymbol = currency === 'USD' ? '$' : '€';
    if (wallet.balance_euros < cost) {
      return new Response(JSON.stringify({
        error: `Insufficient credits. Need ${currencySymbol}${cost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
        code: "INSUFFICIENT_CREDITS", needsPurchase: true, required: cost, available: wallet.balance_euros, currency,
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const enhancedPrompt = buildEnhancedPrompt(body);
    console.log(`[generate-music-track] engine=${engineId} duration=${duration}s cost=${currencySymbol}${cost}`);

    let audioBuffer: ArrayBuffer | null = null;
    let engineUsed = engine.label;

    // =================================================================
    // ROUTE 1: Replicate models (Stable Audio 2.5, Open 2, MiniMax 1.5)
    // =================================================================
    if (engine.route === 'replicate') {
      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        return new Response(JSON.stringify({ error: "REPLICATE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const replicate = new Replicate({ auth: REPLICATE_API_KEY });
      engineUsed = `replicate/${engine.replicateModel}`;

      let input: Record<string, unknown> = {};
      if (engineId === 'stable-audio-25') {
        const p = loop ? `${enhancedPrompt}. Seamless loop, no fade-in or fade-out, continuous beat` : enhancedPrompt;
        input = { prompt: p, duration, steps: 8, cfg_scale: 7, output_format: 'mp3' };
      } else if (engineId === 'minimax-15') {
        // MiniMax: prompt (style, 10-300) + lyrics (10-600)
        const FILLER = 'Cinematic studio production, mastered mix, professional arrangement';
        let styleDesc = [
          genre && genre !== 'any' ? `Genre: ${genre}` : '',
          mood ? `Mood: ${mood}` : '',
          bpm ? `Tempo: ${bpm} BPM` : '',
          key ? `Key: ${key}` : '',
          prompt.trim(),
          languageName ? `Sung in ${languageName}` : '',
          'Studio production quality',
        ].filter(Boolean).join('. ');
        if (styleDesc.length < 10) styleDesc = `${styleDesc} ${FILLER}`.trim();
        if (styleDesc.length > 300) styleDesc = styleDesc.slice(0, 300);
        let lyricsInput = (lyrics ?? '').trim();
        if (lyricsInput.length > 600) lyricsInput = lyricsInput.slice(0, 600);
        input = { lyrics: lyricsInput, prompt: styleDesc };
        console.log('[generate-music-track] MiniMax input lens:', { promptLen: styleDesc.length, lyricsLen: lyricsInput.length });
      }


      let output: any;
      try {
        output = await replicate.run(engine.replicateModel as `${string}/${string}`, { input });
      } catch (err: any) {
        console.error(`[generate-music-track] Replicate error (${engineId}):`, err);
        let providerDetail: string | undefined;
        try {
          if (err?.response && typeof err.response.json === 'function') {
            const b = await err.response.clone().json();
            providerDetail = b?.detail || JSON.stringify(b);
          }
        } catch { /* ignore */ }
        return new Response(JSON.stringify({
          error: providerDetail || err?.message || 'Unknown Replicate error',
          code: engineId === 'minimax-15' ? "MINIMAX_VALIDATION" : "REPLICATE_ERROR",
          stage: "replicate-input",
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const audioUrl = extractAudioUrl(output);
      if (!audioUrl) {
        return new Response(JSON.stringify({ error: `No audio returned from ${engine.label}`, code: "NO_OUTPUT" }), {
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

    // =================================================================
    // ROUTE 2: ElevenLabs Music v2 (native API)
    // =================================================================
    } else if (engine.route === 'direct-elevenlabs') {
      const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
      if (!ELEVENLABS_API_KEY) {
        return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      engineUsed = 'elevenlabs/music-v2';

      const elPayload: Record<string, unknown> = {
        prompt: enhancedPrompt,
        music_length_ms: duration * 1000,
        model_id: 'music_v2',
      };
      if (languageName) elPayload.language = languageName;
      if (lyrics && lyrics.trim()) elPayload.lyrics = lyrics.trim();

      const elResponse = await fetch('https://api.elevenlabs.io/v1/music', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify(elPayload),
      });

      if (!elResponse.ok) {
        const errText = await elResponse.text().catch(() => '');
        console.error('[generate-music-track] ElevenLabs error:', elResponse.status, errText);
        if (elResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly.", code: "RATE_LIMIT" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (elResponse.status === 401 || elResponse.status === 403) {
          return new Response(JSON.stringify({ error: "ElevenLabs API key fehlt Berechtigungen für Music v2.", code: "ELEVENLABS_UNAUTHORIZED", details: errText }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({
          error: `ElevenLabs Music v2 failed (${elResponse.status})`,
          code: "ELEVENLABS_ERROR",
          details: errText,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      audioBuffer = await elResponse.arrayBuffer();

    // =================================================================
    // ROUTE 3: Stability AI — Stable Audio 3.0 Large (direct API)
    // =================================================================
    } else if (engine.route === 'direct-stability') {
      const STABILITY_API_KEY = Deno.env.get('STABILITY_API_KEY');
      if (!STABILITY_API_KEY) {
        return new Response(JSON.stringify({
          error: "Stable Audio 3.0 Large ist noch nicht aktiviert. STABILITY_API_KEY wird in Kürze hinterlegt.",
          code: "STABILITY_NOT_CONFIGURED",
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      engineUsed = 'stability/stable-audio-3-large';

      // Stability AI text-to-audio (v2beta) — expects multipart/form-data.
      const form = new FormData();
      form.append('prompt', enhancedPrompt);
      form.append('duration', String(Math.min(duration, 190)));
      form.append('output_format', 'mp3');
      form.append('model', 'stable-audio-2'); // v3 Large served under this endpoint family

      let stRes: Response;
      try {
        stRes = await fetch('https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STABILITY_API_KEY}`,
            'Accept': 'audio/*',
          },
          body: form,
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `Stability request failed: ${err.message}`, code: "STABILITY_ERROR" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (!stRes.ok) {
        const t = await stRes.text().catch(() => '');
        console.error('[generate-music-track] Stability error:', stRes.status, t);
        if (stRes.status === 401 || stRes.status === 403) {
          return new Response(JSON.stringify({ error: "Stability API key ungültig oder ohne Music-Zugang.", code: "STABILITY_UNAUTHORIZED", details: t }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({
          error: `Stable Audio 3.0 Large failed (${stRes.status})`, code: "STABILITY_ERROR", details: t,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      audioBuffer = await stRes.arrayBuffer();

    // =================================================================
    // ROUTE 4: Google Lyria 3 Pro (Vertex AI / Gemini API, Preview)
    // =================================================================
    } else if (engine.route === 'direct-lyria') {
      const GOOGLE_LYRIA_API_KEY = Deno.env.get('GOOGLE_LYRIA_API_KEY');
      if (!GOOGLE_LYRIA_API_KEY) {
        return new Response(JSON.stringify({
          error: "Google Lyria 3 Pro ist noch nicht freigeschaltet. Vertex-AI Preview-Access wird gerade eingerichtet.",
          code: "LYRIA_NOT_CONFIGURED",
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      engineUsed = 'google/lyria-3-pro';

      const lyriaPayload: Record<string, unknown> = {
        prompt: enhancedPrompt,
        lyrics: lyrics?.trim() || undefined,
        duration_seconds: Math.min(duration, 60),
        language: languageName || 'English',
        instrumental: engine.vocals ? !!instrumental : true,
      };

      let lyRes: Response;
      try {
        lyRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro:generateMusic?key=${GOOGLE_LYRIA_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(lyriaPayload),
          },
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `Lyria request failed: ${err.message}`, code: "LYRIA_ERROR" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (!lyRes.ok) {
        const t = await lyRes.text().catch(() => '');
        console.error('[generate-music-track] Lyria error:', lyRes.status, t);
        return new Response(JSON.stringify({
          error: `Google Lyria 3 Pro failed (${lyRes.status})`, code: "LYRIA_ERROR", details: t,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const lyJson: any = await lyRes.json().catch(() => null);
      const b64: string | undefined =
        lyJson?.audio?.data ||
        lyJson?.audioContent ||
        lyJson?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data;
      if (!b64) {
        return new Response(JSON.stringify({ error: "Lyria returned no audio", code: "LYRIA_ERROR", details: JSON.stringify(lyJson).slice(0, 500) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      audioBuffer = binary.buffer;
    }


    if (!audioBuffer || audioBuffer.byteLength < 1000) {
      return new Response(JSON.stringify({ error: "Generated audio too small / invalid" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ===== Upload to Storage =====
    const storagePath = `${user.id}/music/${engineId}-${Date.now()}.mp3`;
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
    const { data: publicUrlData } = supabaseAdmin.storage.from('audio-studio').getPublicUrl(storagePath);
    const publicUrl = publicUrlData.publicUrl;

    const title = prompt.trim().slice(0, 60) + (prompt.length > 60 ? '...' : '');

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
        processing_preset: engineId,
        effect_config: {
          prompt: prompt.trim(),
          enhanced_prompt: enhancedPrompt,
          engine: engineUsed,
          engine_id: engineId,
          instrumental,
          bpm: bpm || null,
          key: key || null,
          lyrics: lyrics || null,
          loop: loop || false,
          style_tags: styleTags || null,
          language: languageName || null,
        },
      })
      .select()
      .single();
    if (insertError) {
      console.warn('[generate-music-track] Asset insert warning:', insertError);
    }

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
      tier: engineId,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[generate-music-track] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
