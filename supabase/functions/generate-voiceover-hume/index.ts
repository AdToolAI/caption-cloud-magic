// supabase/functions/generate-voiceover-hume/index.ts
// Hume Octave TTS → uploads MP3 to `voiceover-audio` bucket and returns a
// public URL + duration. Mirrors `generate-voiceover` (ElevenLabs) so the
// SceneDialogStudio / HeyGen lip-sync pipeline can consume Hume voices the
// same way (URL + duration in seconds).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface Body {
  text: string;
  voiceName: string;        // Hume voice NAME (e.g. "Ito")
  provider?: 'HUME_AI' | 'CUSTOM_VOICE';
  description?: string;     // emotional steering
  speed?: number;           // 0.7..1.2
  projectId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "audio" });
  }

  try {
    const HUME_API_KEY = Deno.env.get('HUME_API_KEY');
    if (!HUME_API_KEY) throw new Error('HUME_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const body = await req.json() as Body;
    if (!body.text) throw new Error('text is required');
    if (!body.voiceName) throw new Error('voiceName is required');
    if (!body.projectId) throw new Error('projectId is required');

    const speed = typeof body.speed === 'number'
      ? Math.max(0.7, Math.min(1.2, body.speed))
      : 1.0;

    const humeBody: any = {
      utterances: [
        {
          text: body.text,
          voice: { name: body.voiceName, provider: body.provider || 'HUME_AI' },
          ...(body.description ? { description: body.description } : {}),
          ...(speed !== 1.0 ? { speed } : {}),
        },
      ],
      format: { type: 'mp3' },
    };

    console.log('[generate-voiceover-hume] calling Hume', {
      voice: body.voiceName, provider: body.provider, textLen: body.text.length, speed,
    });

    const res = await fetch('https://api.hume.ai/v0/tts/file', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': HUME_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(humeBody),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[generate-voiceover-hume] Hume error', res.status, err);
      if (res.status === 404) {
        throw new Error(`Hume voice "${body.voiceName}" not found in your library. Please pick another voice.`);
      }
      throw new Error(`Hume ${res.status}: ${err.slice(0, 300)}`);
    }

    const audioBuffer = await res.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    // Unique path per generation (mirrors generate-voiceover semantics)
    const fileName = `${body.projectId}_${Date.now()}_hume.mp3`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('voiceover-audio')
      .upload(filePath, audioBytes, { contentType: 'audio/mpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('voiceover-audio').getPublicUrl(filePath);

    // Hume returns variable-bitrate MP3 — best-effort estimate via 128 kbps
    // CBR floor. Real duration will be re-probed client-side after playback,
    // but this is good enough for scene timing.
    const BITRATE_BPS = 128 * 1000;
    const estimatedDuration = Math.round(((audioBytes.byteLength * 8) / BITRATE_BPS) * 100) / 100;

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: urlData.publicUrl,
        duration: estimatedDuration,
        engine: 'hume',
        voiceName: body.voiceName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-voiceover-hume] error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error), success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
