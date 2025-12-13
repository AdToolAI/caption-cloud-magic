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
      // Uses Replicate's resemble-enhance model for real AI audio enhancement
      console.log('Mode: Audio Enhancement - Using Replicate resemble-enhance...');

      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        throw new Error('REPLICATE_API_KEY is not configured');
      }

      const replicate = new Replicate({
        auth: REPLICATE_API_KEY,
      });

      // Parse enhancement settings for logging
      let noiseReduction = 75;
      let echoReduction = 60;
      if (enhancements && Array.isArray(enhancements)) {
        for (const e of enhancements) {
          if (e.id === 'noise') noiseReduction = e.intensity;
          if (e.id === 'echo') echoReduction = e.intensity;
        }
      }
      console.log('Enhancement settings:', { noiseReduction, echoReduction });

      // Upload audio temporarily to Supabase Storage for Replicate access
      tempFileName = `temp/${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
      console.log('Uploading temp audio for Replicate:', tempFileName);

      const { error: tempError } = await supabase.storage
        .from('audio-studio')
        .upload(tempFileName, audioArrayBuffer, {
          contentType: 'audio/mpeg',
          upsert: false,
        });

      if (tempError) {
        throw new Error(`Failed to upload temp audio: ${tempError.message}`);
      }

      // Get public URL for Replicate
      const { data: tempUrlData } = supabase.storage
        .from('audio-studio')
        .getPublicUrl(tempFileName);
      const publicAudioUrl = tempUrlData.publicUrl;
      console.log('Temp audio URL for Replicate:', publicAudioUrl);

      // Run SGMSE+ Speech Enhancement - preserves original sample rate
      console.log('Calling SGMSE+ speech enhancement model...');
      const output = await replicate.run(
        "turian/sgmse-speech-enhancement-deverb-replicate:0e497fe31924f2eef113e29e23697e9f58a26e17f7335d108506ee6950745bfb",
        {
          input: {
            audio: publicAudioUrl,
            checkpoint: "EARS-WHAM",
            corrector: "ald",
            corrector_steps: 1,
            snr: 0.5,
            N: 30
          }
        }
      );

      console.log('SGMSE+ output:', output);
      
      // SGMSE+ returns a direct URL string
      const enhancedAudioUrl = typeof output === 'string' ? output : String(output);
      console.log('Enhanced audio URL:', enhancedAudioUrl);

      // Clean up temp file
      if (tempFileName) {
        console.log('Cleaning up temp file:', tempFileName);
        await supabase.storage.from('audio-studio').remove([tempFileName]);
      }

      // Download the enhanced audio from Replicate
      console.log('Downloading enhanced audio from resemble-enhance...');
      const enhancedResponse = await fetch(enhancedAudioUrl);
      if (!enhancedResponse.ok) {
        throw new Error(`Failed to download enhanced audio: ${enhancedResponse.status}`);
      }
      processedArrayBuffer = await enhancedResponse.arrayBuffer();
      console.log('SGMSE+ audio downloaded, size:', processedArrayBuffer.byteLength, 'bytes');
      
      processingType = 'enhanced';
    }

    // Step 3: Upload processed audio to Supabase Storage
    // SGMSE+ returns WAV, ElevenLabs returns MP3
    const fileExt = mode === 'isolate' ? 'mp3' : 'wav';
    const contentType = mode === 'isolate' ? 'audio/mpeg' : 'audio/wav';
    const fileName = `${processingType}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    console.log('Uploading processed audio to:', fileName);

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
