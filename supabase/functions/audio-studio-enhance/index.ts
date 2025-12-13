import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import Replicate from "https://esm.sh/replicate@0.25.2";

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

    // Detect audio format - check for WAV magic bytes "RIFF"
    const magicBytes = new Uint8Array(audioArrayBuffer.slice(0, 4));
    const isWav = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46 && magicBytes[3] === 0x46; // "RIFF"
    console.log('Audio format detected:', isWav ? 'WAV' : 'MP3/Other');

    // Extract original sample rate from WAV header if WAV, otherwise assume 16000 for typical speech MP3s
    let originalSampleRate = 16000; // Default for speech MP3s (common for podcasts/voice recordings)
    if (isWav && audioArrayBuffer.byteLength >= 28) {
      const view = new DataView(audioArrayBuffer);
      // WAV sample rate is at byte offset 24 (little-endian 32-bit)
      originalSampleRate = view.getUint32(24, true);
      console.log('Original WAV sample rate:', originalSampleRate);
    }

    let processedArrayBuffer: ArrayBuffer;
    let processingType: string;
    let tempFileName: string | null = null;

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
      // Strategy: Use ElevenLabs Audio Isolation for noise removal + return flag for client-side enhancement
      // This replaces broken resemble-enhance that truncates audio
      console.log('Mode: Audio Enhancement - Using ElevenLabs Isolation + Client Enhancement');
      
      // Step 1: Send to ElevenLabs for noise/background removal (same as isolation but for enhancement)
      const formData = new FormData();
      formData.append('audio', new Blob([audioArrayBuffer], { type: isWav ? 'audio/wav' : 'audio/mpeg' }), isWav ? 'audio.wav' : 'audio.mp3');

      console.log('Sending to ElevenLabs Audio Isolation for noise removal...');
      const isolationResponse = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!isolationResponse.ok) {
        const errorText = await isolationResponse.text();
        console.error('ElevenLabs API error:', isolationResponse.status, errorText);
        throw new Error(`ElevenLabs API error: ${isolationResponse.status} - ${errorText}`);
      }

      processedArrayBuffer = await isolationResponse.arrayBuffer();
      console.log('ElevenLabs noise removal complete, size:', processedArrayBuffer.byteLength, 'bytes');
      console.log('Original size:', audioArrayBuffer.byteLength, 'Enhanced size:', processedArrayBuffer.byteLength);
      
      processingType = 'enhanced';
    }

    // Step 3: Upload processed audio to Supabase Storage
    // resemble-enhance always outputs WAV at 44.1kHz - keep it as WAV to preserve sample rate info
    // ElevenLabs isolation returns MP3, SGMSE+ returns WAV
    const outputIsWav = mode === 'enhance'; // resemble-enhance AND SGMSE+ both output WAV
    const fileExt = mode === 'isolate' ? 'mp3' : 'wav';
    const contentType = mode === 'isolate' ? 'audio/mpeg' : 'audio/wav';
    const fileName = `${processingType}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    console.log('Uploading processed audio to:', fileName, 'format:', fileExt, 'contentType:', contentType);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-studio')
      .upload(fileName, processedArrayBuffer, {
        contentType: contentType,
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
      processingTime: Date.now(),
      originalSampleRate: originalSampleRate,
      outputSampleRate: mode === 'enhance' && !isWav ? 44100 : originalSampleRate, // resemble-enhance outputs 44.1kHz
      needsResampling: mode === 'enhance' && !isWav // Flag for client-side resampling if needed
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
