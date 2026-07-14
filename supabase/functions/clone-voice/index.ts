import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "clone-voice" });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { name, sample_urls, language, description, remove_background_noise } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new Error('Voice-Name fehlt (mindestens 2 Zeichen).');
    }
    if (!Array.isArray(sample_urls) || sample_urls.length < 1) {
      throw new Error('Mindestens 1 Audio-Sample erforderlich.');
    }
    console.log(`[clone-voice] samples=${sample_urls.length} lang=${language} denoise=${remove_background_noise}`);

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Download audio samples, keep their real container so ElevenLabs
    // can decode OGG/Opus (WhatsApp voice notes), M4A, MP3, WAV, etc.
    const audioFiles = await Promise.all(
      sample_urls.map(async (url: string, idx: number) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch sample ${idx}: ${response.status}`);
        const blob = await response.blob();
        const contentType = response.headers.get('content-type') || blob.type || 'audio/mpeg';
        const extFromType: Record<string, string> = {
          'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/wave': 'wav',
          'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
          'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac',
        };
        const cleanType = contentType.split(';')[0].trim().toLowerCase();
        const ext = extFromType[cleanType] || (url.match(/\.(mp3|wav|m4a|ogg|opus|webm|flac)(?:\?|$)/i)?.[1]?.toLowerCase()) || 'mp3';
        return { blob, ext, type: cleanType };
      })
    );

    // Create FormData for ElevenLabs
    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', String(description).slice(0, 500));
    // ElevenLabs' built-in denoise on ingest — no external DSP required.
    formData.append('remove_background_noise', remove_background_noise === false ? 'false' : 'true');
    audioFiles.forEach(({ blob, ext }, idx) => {
      formData.append('files', blob, `sample_${idx}.${ext}`);
    });


    // Call ElevenLabs Voice Cloning API
    const cloneResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!cloneResponse.ok) {
      const error = await cloneResponse.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    const cloneData = await cloneResponse.json();

    // Save to database
    const { data: customVoice, error } = await supabase
      .from('custom_voices')
      .insert({
        user_id: user.id,
        name,
        elevenlabs_voice_id: cloneData.voice_id,
        language: language || 'en',
        sample_urls,
        voice_characteristics: cloneData,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        success: true,
        voice_id: customVoice.id,
        elevenlabs_voice_id: cloneData.voice_id,
        name: customVoice.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in clone-voice:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
