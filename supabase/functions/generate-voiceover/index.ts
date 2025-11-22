import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VoiceoverRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  projectId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

    if (!elevenlabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const {
      text,
      voiceId = '9BWtsMINqrJLrRacOk9x', // Default: Aria
      modelId = 'eleven_turbo_v2_5',
      stability = 0.5,
      similarityBoost = 0.75,
      speed = 1.0,
      projectId
    }: VoiceoverRequest = await req.json();

    console.log('Generating voiceover:', { 
      textLength: text.length, 
      voiceId, 
      modelId,
      projectId 
    });

    // Call ElevenLabs API
    const elevenlabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=2`;
    
    const elevenlabsResponse = await fetch(elevenlabsUrl, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsApiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          speed,
        },
      }),
    });

    if (!elevenlabsResponse.ok) {
      const errorText = await elevenlabsResponse.text();
      console.error('ElevenLabs API error:', elevenlabsResponse.status, errorText);
      throw new Error(`ElevenLabs API error: ${elevenlabsResponse.status}`);
    }

    // Get audio as blob
    const audioBlob = await elevenlabsResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioUint8Array = new Uint8Array(audioBuffer);

    // Upload to Supabase Storage
    const fileName = `${projectId}_voiceover.mp3`;
    const filePath = `${user.id}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voiceover-audio')
      .upload(filePath, audioUint8Array, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('voiceover-audio')
      .getPublicUrl(filePath);

    // Estimate duration (rough calculation: ~150 words per minute, ~5 chars per word)
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = Math.ceil((wordCount / 150) * 60);

    console.log('Voiceover generated successfully:', {
      url: urlData.publicUrl,
      duration: estimatedDuration,
      size: audioUint8Array.length
    });

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: urlData.publicUrl,
        duration: estimatedDuration,
        voiceId,
        modelId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error generating voiceover:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
