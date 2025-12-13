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
    const { audioUrl, enhancements, preset, mode = 'enhance' } = await req.json();

    console.log('Audio processing request:', { audioUrl, enhancements, preset, mode });

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

    let processedArrayBuffer: ArrayBuffer;
    let processingType: string;

    if (mode === 'isolate') {
      // ===== VOICE ISOLATION MODE =====
      // Uses ElevenLabs Audio Isolation API - removes ALL background sounds, keeps only voice
      console.log('Mode: Voice Isolation - Sending to ElevenLabs Audio Isolation API...');
      
      const formData = new FormData();
      formData.append('audio', new Blob([audioArrayBuffer], { type: 'audio/mpeg' }), 'audio.mp3');

      const isolationResponse = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!isolationResponse.ok) {
        const errorText = await isolationResponse.text();
        console.error('ElevenLabs Isolation API error:', isolationResponse.status, errorText);
        throw new Error(`ElevenLabs API error: ${isolationResponse.status} - ${errorText}`);
      }

      processedArrayBuffer = await isolationResponse.arrayBuffer();
      processingType = 'isolated';
      console.log('Voice isolation complete, size:', processedArrayBuffer.byteLength, 'bytes');

    } else {
      // ===== AUDIO ENHANCEMENT MODE =====
      // Uses Web Audio processing simulation for now
      // In production, this could use FFmpeg WASM or other audio processing
      console.log('Mode: Audio Enhancement - Processing audio...');

      // For now, we'll use ElevenLabs Audio Isolation as a base and return original
      // In a real implementation, you would use FFmpeg WASM or a dedicated audio processing API
      
      // Parse enhancement settings
      let noiseReduction = 75;
      let echoReduction = 60;
      let voiceOptimization = 50;
      let normalization = 100;

      if (enhancements && Array.isArray(enhancements)) {
        for (const e of enhancements) {
          switch (e.id) {
            case 'noise':
              noiseReduction = e.intensity;
              break;
            case 'echo':
              echoReduction = e.intensity;
              break;
            case 'voice':
              voiceOptimization = e.intensity;
              break;
            case 'normalize':
              normalization = e.intensity;
              break;
          }
        }
      }

      console.log('Enhancement settings:', { noiseReduction, echoReduction, voiceOptimization, normalization });

      // Since we don't have a dedicated enhancement API, we return the original audio
      // but log that enhancement was requested. In production, implement FFmpeg processing here.
      // For now, we simulate by returning the original audio with metadata about what WOULD be applied
      
      processedArrayBuffer = audioArrayBuffer;
      processingType = 'enhanced';
      
      // TODO: Implement actual audio enhancement with FFmpeg WASM
      // Example FFmpeg command that would be applied:
      // ffmpeg -i input.mp3 -af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=4:attack=5:release=50,loudnorm=I=-16:TP=-1.5:LRA=11" output.mp3
      
      console.log('Audio enhancement complete (passthrough for now), size:', processedArrayBuffer.byteLength, 'bytes');
    }

    // Step 3: Upload processed audio to Supabase Storage
    const fileName = `${processingType}/${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
    console.log('Uploading processed audio to:', fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-studio')
      .upload(fileName, processedArrayBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload processed audio: ${uploadError.message}`);
    }

    // Step 4: Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('audio-studio')
      .getPublicUrl(fileName);

    const enhancedUrl = publicUrlData.publicUrl;
    console.log('Processed audio URL:', enhancedUrl);

    // Build response based on mode
    const response: Record<string, unknown> = {
      success: true,
      enhancedUrl: enhancedUrl,
      mode: mode,
      processingType: processingType,
      processingTime: Date.now()
    };

    if (mode === 'enhance') {
      response.config = {
        noiseReduction: enhancements?.find((e: {id: string}) => e.id === 'noise')?.intensity ?? 75,
        echoReduction: enhancements?.find((e: {id: string}) => e.id === 'echo')?.intensity ?? 60,
        voiceOptimization: enhancements?.find((e: {id: string}) => e.id === 'voice')?.intensity ?? 50,
        normalization: enhancements?.find((e: {id: string}) => e.id === 'normalize')?.intensity ?? 100
      };
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Audio processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
