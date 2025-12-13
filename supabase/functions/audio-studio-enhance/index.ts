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
      console.log('Mode: Audio Enhancement');

      const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
      if (!REPLICATE_API_KEY) {
        throw new Error('REPLICATE_API_KEY is not configured');
      }

      const replicate = new Replicate({
        auth: REPLICATE_API_KEY,
      });

      if (!isWav) {
        // MP3: Use resemble-enhance for REAL audio enhancement (not voice isolation!)
        // Note: resemble-enhance outputs 44.1kHz - client will handle resampling if needed
        console.log('Using resemble-enhance for MP3 audio enhancement...');
        
        // Upload MP3 temporarily to Supabase Storage for Replicate access
        tempFileName = `temp/${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
        console.log('Uploading temp MP3 for resemble-enhance:', tempFileName);

        const { error: tempError } = await supabase.storage
          .from('audio-studio')
          .upload(tempFileName, audioArrayBuffer, {
            contentType: 'audio/mpeg',
            upsert: false,
          });

        if (tempError) {
          throw new Error(`Failed to upload temp audio: ${tempError.message}`);
        }

        const { data: tempUrlData } = supabase.storage
          .from('audio-studio')
          .getPublicUrl(tempFileName);
        const publicAudioUrl = tempUrlData.publicUrl;
        console.log('Temp MP3 URL for resemble-enhance:', publicAudioUrl);

        // Run resemble-enhance with CORRECT parameters per official Replicate schema:
        // https://replicate.com/resemble-ai/resemble-enhance/api/schema
        // - denoise_flag (boolean) - NOT "denoising" or "denoise"
        // - prior_temperature (number 0-1) - NOT "cfg_strength" or "tau"
        // - number_function_evaluations (integer 1-128) - NOT "nfe"
        console.log('Running resemble-enhance with official schema parameters...');
        const enhanceOutput = await replicate.run(
          "resemble-ai/resemble-enhance:93266a7e7f5805fb79bcf213b1a4e0ef2e45aff3c06eefd96c59e850c87fd6a2",
          {
            input: {
              input_audio: publicAudioUrl,
              solver: "Midpoint",
              denoise_flag: true,              // CORRECT per official schema
              prior_temperature: 0.5,          // CORRECT per official schema
              number_function_evaluations: 64  // CORRECT per official schema
            }
          }
        );
        console.log('resemble-enhance output:', enhanceOutput);
        
        // resemble-enhance returns URL to enhanced audio
        const enhancedAudioUrl = Array.isArray(enhanceOutput) && enhanceOutput.length > 0 
          ? (typeof enhanceOutput[0] === 'string' ? enhanceOutput[0] : String(enhanceOutput[0]))
          : String(enhanceOutput);
        
        console.log('Downloading enhanced audio from:', enhancedAudioUrl);
        const enhancedResponse = await fetch(enhancedAudioUrl);
        if (!enhancedResponse.ok) {
          throw new Error(`Failed to download enhanced audio: ${enhancedResponse.status}`);
        }
        processedArrayBuffer = await enhancedResponse.arrayBuffer();
        console.log('MP3 enhancement complete, size:', processedArrayBuffer.byteLength, 'bytes');
        
        // Clean up temp file
        console.log('Cleaning up temp file:', tempFileName);
        await supabase.storage.from('audio-studio').remove([tempFileName]);
        
      } else {
        // WAV: Use SGMSE+ via Replicate (preserves sample rate)
        const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
        if (!REPLICATE_API_KEY) {
          throw new Error('REPLICATE_API_KEY is not configured');
        }

        const replicate = new Replicate({
          auth: REPLICATE_API_KEY,
        });

        // Upload WAV temporarily to Supabase Storage for Replicate access
        tempFileName = `temp/${Date.now()}_${Math.random().toString(36).substring(7)}.wav`;
        console.log('Uploading temp WAV for SGMSE+:', tempFileName);

        const { error: tempError } = await supabase.storage
          .from('audio-studio')
          .upload(tempFileName, audioArrayBuffer, {
            contentType: 'audio/wav',
            upsert: false,
          });

        if (tempError) {
          throw new Error(`Failed to upload temp audio: ${tempError.message}`);
        }

        const { data: tempUrlData } = supabase.storage
          .from('audio-studio')
          .getPublicUrl(tempFileName);
        const publicAudioUrl = tempUrlData.publicUrl;
        console.log('Temp WAV URL for SGMSE+:', publicAudioUrl);

        // Use SGMSE+ for WAV - preserves sample rate correctly
        console.log('Using SGMSE+ for WAV enhancement (preserves sample rate)...');
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
        const enhancedAudioUrl = typeof output === 'string' ? output : String(output);

        // Clean up temp file
        console.log('Cleaning up temp file:', tempFileName);
        await supabase.storage.from('audio-studio').remove([tempFileName]);

        // Download the enhanced audio
        console.log('Downloading enhanced audio from:', enhancedAudioUrl);
        const enhancedResponse = await fetch(enhancedAudioUrl);
        if (!enhancedResponse.ok) {
          throw new Error(`Failed to download enhanced audio: ${enhancedResponse.status}`);
        }
        processedArrayBuffer = await enhancedResponse.arrayBuffer();
        console.log('SGMSE+ enhancement complete, size:', processedArrayBuffer.byteLength, 'bytes');
      }
      
      processingType = 'enhanced';
    }

    // Step 3: Upload processed audio to Supabase Storage
    // Determine output format: ElevenLabs (isolate + MP3 enhance) returns MP3, SGMSE+ (WAV enhance) returns WAV
    const outputIsWav = mode === 'enhance' && isWav;
    const fileExt = outputIsWav ? 'wav' : 'mp3';
    const contentType = outputIsWav ? 'audio/wav' : 'audio/mpeg';
    const fileName = `${processingType}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    console.log('Uploading processed audio to:', fileName, 'format:', fileExt);
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
