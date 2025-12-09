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
    const { audio } = await req.json();

    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'Audio data required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[companion-transcribe] Processing audio, length:', audio.length);

    // Use OpenAI Whisper for transcription via Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Convert base64 to blob for multipart form
    const binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
    const audioBlob = new Blob([binaryAudio], { type: 'audio/webm' });

    // Create form data
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'de');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY') || LOVABLE_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      // Fallback: Use ElevenLabs if OpenAI fails
      console.log('[companion-transcribe] OpenAI failed, trying ElevenLabs...');
      
      const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');
      if (elevenLabsKey) {
        // ElevenLabs doesn't have a transcription API, so we'll use a simple approach
        // For now, return an error message suggesting text input
        return new Response(
          JSON.stringify({ 
            error: 'Transcription service unavailable',
            text: null 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const errorText = await response.text();
      console.error('[companion-transcribe] Error:', errorText);
      throw new Error('Transcription failed');
    }

    const result = await response.json();
    console.log('[companion-transcribe] Transcription result:', result.text?.substring(0, 50));

    return new Response(
      JSON.stringify({ text: result.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[companion-transcribe] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
