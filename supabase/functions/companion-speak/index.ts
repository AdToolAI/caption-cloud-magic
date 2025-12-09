import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Text required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const voiceIdToUse = voiceId || '9BWtsMINqrJLrRacOk9x'; // Default to Aria

    console.log('[companion-speak] Generating speech:', { 
      voiceId: voiceIdToUse, 
      textLength: text.length 
    });

    // Use ElevenLabs Turbo v2.5 for low latency
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceIdToUse}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey,
        },
        body: JSON.stringify({
          text: text.substring(0, 2000), // Limit text length
          model_id: 'eleven_turbo_v2_5', // Low latency model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[companion-speak] ElevenLabs error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log('[companion-speak] Audio generated, size:', audioBuffer.byteLength);

    // Convert to base64 in chunks
    function arrayBufferToBase64(buffer: ArrayBuffer): string {
      const bytes = new Uint8Array(buffer);
      const chunkSize = 32768;
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[companion-speak] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
