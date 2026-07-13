// supabase/functions/preview-voice-hume/index.ts
// Hume Octave TTS preview — returns base64 MP3.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 32768;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
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

    const { text, voiceName, provider = 'HUME_AI', description, speed } = await req.json();
    if (!text || !voiceName) throw new Error('text and voiceName are required');

    const body: any = {
      utterances: [
        {
          text: String(text).slice(0, 500),
          voice: { name: voiceName, provider },
          ...(description ? { description } : {}),
          ...(typeof speed === 'number' ? { speed } : {}),
        },
      ],
      format: { type: 'mp3' },
    };

    const res = await fetch('https://api.hume.ai/v0/tts/file', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': HUME_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[preview-voice-hume] Hume error', res.status, err);
      if (res.status === 404) {
        throw new Error(`Hume voice "${voiceName}" not found in your library.`);
      }
      throw new Error(`Hume ${res.status}: ${err.slice(0, 300)}`);
    }

    const buf = await res.arrayBuffer();
    return new Response(JSON.stringify({ audioContent: bufToBase64(buf) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[preview-voice-hume] error', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
