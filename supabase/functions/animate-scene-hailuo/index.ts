import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnimateSceneRequest {
  imageUrl: string;           // Static scene image from Flux
  audioUrl?: string;          // Optional: Voiceover for lip-sync
  sceneId: string;            // For tracking
  duration?: number;          // Scene duration in seconds (default: 5)
  motionType?: 'subtle' | 'moderate' | 'dynamic'; // Motion intensity
  prompt?: string;            // Optional motion description
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not configured');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const body: AnimateSceneRequest = await req.json();

    const { 
      imageUrl, 
      audioUrl, 
      sceneId, 
      duration = 5, 
      motionType = 'moderate',
      prompt 
    } = body;

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎬 Animating scene ${sceneId} with Hailuo 2.3`);
    console.log(`  - Image: ${imageUrl.substring(0, 80)}...`);
    console.log(`  - Audio: ${audioUrl ? 'Yes (lip-sync enabled)' : 'No'}`);
    console.log(`  - Duration: ${duration}s`);
    console.log(`  - Motion: ${motionType}`);

    // Build motion prompt based on intensity
    const motionPrompts: Record<string, string> = {
      subtle: 'subtle gentle movement, slow breathing, slight head tilt, minimal motion',
      moderate: 'natural movement, speaking animation, moderate gestures, smooth motion',
      dynamic: 'expressive movement, active gestures, dynamic poses, energetic animation',
    };

    const motionDescription = prompt || motionPrompts[motionType] || motionPrompts.moderate;

    // MiniMax Hailuo 2.3 via Replicate
    // Model: minimax/hailuo-2.3
    const input: Record<string, unknown> = {
      image: imageUrl,
      prompt: motionDescription,
    };

    // If audio is provided, enable lip-sync
    if (audioUrl) {
      input.audio = audioUrl;
      console.log(`  ✅ Lip-sync enabled with audio`);
    }

    console.log(`🚀 Starting Hailuo 2.3 animation...`);

    // Run the model
    const output = await replicate.run(
      "minimax/hailuo-2.3",
      { input }
    );

    console.log(`✅ Hailuo 2.3 response:`, output);

    // Extract video URL from output
    let videoUrl: string | null = null;

    if (typeof output === 'string') {
      videoUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      videoUrl = output[0];
    } else if (output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      videoUrl = (outputObj.video || outputObj.output || outputObj.url) as string || null;
    }

    if (!videoUrl) {
      console.error('❌ No video URL in response:', output);
      return new Response(
        JSON.stringify({ 
          error: 'Animation failed - no video URL returned',
          rawOutput: output 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Animation complete for scene ${sceneId}: ${videoUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        sceneId,
        videoUrl,
        duration,
        motionType,
        hasLipSync: !!audioUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Hailuo animation error:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Animation failed',
        details: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
