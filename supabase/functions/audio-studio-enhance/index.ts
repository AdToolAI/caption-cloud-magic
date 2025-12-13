import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, enhancements, preset } = await req.json();

    console.log('Audio enhancement request:', { audioUrl, enhancements, preset });

    if (!audioUrl) {
      throw new Error('No audio URL provided');
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Download the original audio
    console.log('Downloading original audio from:', audioUrl);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioArrayBuffer = await audioResponse.arrayBuffer();
    console.log('Downloaded audio size:', audioArrayBuffer.byteLength, 'bytes');

    // Step 2: Send to ElevenLabs Audio Isolation API
    console.log('Sending to ElevenLabs Audio Isolation API...');
    
    const formData = new FormData();
    formData.append('audio', new Blob([audioArrayBuffer], { type: 'audio/mpeg' }), 'audio.mp3');

    const enhanceResponse = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!enhanceResponse.ok) {
      const errorText = await enhanceResponse.text();
      console.error('ElevenLabs API error:', enhanceResponse.status, errorText);
      throw new Error(`ElevenLabs API error: ${enhanceResponse.status} - ${errorText}`);
    }

    // Step 3: Get the enhanced audio
    const enhancedArrayBuffer = await enhanceResponse.arrayBuffer();
    console.log('Received enhanced audio size:', enhancedArrayBuffer.byteLength, 'bytes');

    // Step 4: Upload to Supabase Storage
    const fileName = `enhanced/${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
    console.log('Uploading enhanced audio to:', fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-studio')
      .upload(fileName, enhancedArrayBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload enhanced audio: ${uploadError.message}`);
    }

    // Step 5: Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('audio-studio')
      .getPublicUrl(fileName);

    const enhancedUrl = publicUrlData.publicUrl;
    console.log('Enhanced audio URL:', enhancedUrl);

    // Determine enhancement config for response
    let enhancementConfig = {
      noiseReduction: 85,
      echoReduction: 70,
      voiceOptimization: 65,
      normalization: 100
    };

    if (preset !== 'studio-sound' && enhancements && Array.isArray(enhancements)) {
      for (const e of enhancements) {
        switch (e.id) {
          case 'noise':
            enhancementConfig.noiseReduction = e.intensity;
            break;
          case 'echo':
            enhancementConfig.echoReduction = e.intensity;
            break;
          case 'voice':
            enhancementConfig.voiceOptimization = e.intensity;
            break;
          case 'normalize':
            enhancementConfig.normalization = e.intensity;
            break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        enhancedUrl: enhancedUrl,
        config: enhancementConfig,
        processingTime: Date.now()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Audio enhancement error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
