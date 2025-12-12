import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Beat {
  time: number;
  strength: number;
  type: 'beat' | 'drop' | 'buildup';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, sensitivity = 50, duration = 60 } = await req.json();

    console.log('Beat detection request:', { audioUrl, sensitivity, duration });

    if (!audioUrl) {
      throw new Error('No audio URL provided');
    }

    // Generate beats based on typical music structure
    // In a full implementation, this would use audio analysis libraries
    // or external APIs like Spotify's Audio Analysis or librosa-based services
    
    const beats: Beat[] = [];
    
    // Simulate BPM detection (between 90-160 BPM based on sensitivity)
    const baseBpm = 90 + (sensitivity / 100) * 70;
    const bpm = Math.round(baseBpm + (Math.random() * 20 - 10));
    const beatInterval = 60 / bpm;
    
    // Generate beats
    for (let time = 0; time < duration; time += beatInterval) {
      const beatNumber = Math.floor(time / beatInterval);
      const isDownbeat = beatNumber % 4 === 0;
      const isDrop = beatNumber % 32 === 0 && beatNumber > 0;
      const isBuildup = beatNumber % 32 >= 28 && beatNumber % 32 < 32;
      
      // Calculate strength based on position in bar and sensitivity
      let strength = 0.5;
      if (isDrop) {
        strength = 1.0;
      } else if (isDownbeat) {
        strength = 0.8;
      } else if (isBuildup) {
        strength = 0.6 + ((beatNumber % 32 - 28) / 4) * 0.3;
      }
      
      // Apply sensitivity modifier
      strength = Math.min(1, strength * (0.5 + sensitivity / 100));
      
      beats.push({
        time: Math.round(time * 1000) / 1000, // Round to 3 decimal places
        strength,
        type: isDrop ? 'drop' : isBuildup ? 'buildup' : 'beat'
      });
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`Generated ${beats.length} beats at ${bpm} BPM`);

    return new Response(
      JSON.stringify({
        success: true,
        beats,
        bpm,
        duration,
        dropCount: beats.filter(b => b.type === 'drop').length,
        buildupCount: beats.filter(b => b.type === 'buildup').length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Beat detection error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
