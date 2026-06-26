import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "audio" });
  }

  try {
    const body = await req.json();
    const {
      text,
      voiceId,
      speed: rawSpeed = 1.0,
      stability = 0.5,
      similarityBoost = 0.75,
      style = 0.0,
      useSpeakerBoost = true,
    } = body ?? {};
    const speed = Math.max(0.7, Math.min(1.2, Number(rawSpeed) || 1.0));

    if (!text || !voiceId) {
      throw new Error('Text and voiceId are required');
    }

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey,
        },
        body: JSON.stringify({
          text: text.substring(0, 500),
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: Math.max(0, Math.min(1, Number(stability))),
            similarity_boost: Math.max(0, Math.min(1, Number(similarityBoost))),
            style: Math.max(0, Math.min(1, Number(style))),
            use_speaker_boost: !!useSpeakerBoost,
            speed,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[preview-voice] ElevenLabs API error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    // Get audio as buffer
    const audioBuffer = await response.arrayBuffer();
    console.log('[preview-voice] ElevenLabs response:', {
      status: response.status,
      ok: response.ok,
      audioSize: audioBuffer?.byteLength
    });

    // Convert audio buffer to base64 in chunks to avoid stack overflow
    function arrayBufferToBase64(buffer: ArrayBuffer): string {
      const bytes = new Uint8Array(buffer);
      const chunkSize = 32768; // 32KB
      let binary = '';

      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }

      return btoa(binary);
    }

    const base64Audio = arrayBufferToBase64(audioBuffer);

    return new Response(
      JSON.stringify({ audioContent: base64Audio }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[preview-voice] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
