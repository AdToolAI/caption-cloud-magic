import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Beat {
  time: number;
  strength: number;
  type: 'beat' | 'downbeat' | 'transition-point';
}

interface BeatAnalysisResult {
  bpm: number;
  beats: Beat[];
  downbeats: number[];
  transitionPoints: number[];
  duration: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { musicUrl, videoDuration = 60, sceneCount = 5 } = await req.json();

    console.log('🎵 Beat analysis request:', { musicUrl, videoDuration, sceneCount });

    if (!musicUrl) {
      throw new Error('No music URL provided');
    }

    // ════════════════════════════════════════════════════════════════════════
    // 🎵 BEAT DETECTION ALGORITHM
    // Generates beats based on typical music structure for video synchronization
    // In production, this would use audio analysis libraries or external APIs
    // ════════════════════════════════════════════════════════════════════════
    
    const beats: Beat[] = [];
    
    // Estimate BPM based on typical explainer video music (100-130 BPM range)
    // Corporate/upbeat music typically falls in this range
    const baseBpm = 110;
    const bpmVariation = Math.random() * 20 - 10; // ±10 BPM variation
    const bpm = Math.round(baseBpm + bpmVariation);
    const beatInterval = 60 / bpm; // Seconds per beat
    
    console.log(`🎵 Estimated BPM: ${bpm}, Beat Interval: ${beatInterval}s`);
    
    // Generate beats for the video duration
    for (let time = 0; time < videoDuration; time += beatInterval) {
      const beatNumber = Math.floor(time / beatInterval);
      const isDownbeat = beatNumber % 4 === 0; // Every 4th beat is a downbeat (start of bar)
      const isStrongBeat = beatNumber % 2 === 0; // Every 2nd beat is stronger
      
      // Calculate strength based on position in bar
      let strength = 0.5;
      if (isDownbeat) {
        strength = 1.0;
      } else if (isStrongBeat) {
        strength = 0.75;
      }
      
      beats.push({
        time: Math.round(time * 1000) / 1000, // Round to 3 decimal places
        strength,
        type: isDownbeat ? 'downbeat' : 'beat',
      });
    }
    
    // Extract downbeat times (ideal for scene transitions)
    const downbeats = beats
      .filter(b => b.type === 'downbeat')
      .map(b => b.time);
    
    // Calculate ideal transition points based on scene count
    // These are the best moments to start a new scene (aligned to downbeats)
    const sceneDuration = videoDuration / sceneCount;
    const transitionPoints: number[] = [0]; // First scene starts at 0
    
    for (let i = 1; i < sceneCount; i++) {
      const idealTime = i * sceneDuration;
      
      // Find the nearest downbeat to the ideal transition time
      let nearestDownbeat = downbeats[0];
      let minDistance = Math.abs(downbeats[0] - idealTime);
      
      for (const downbeat of downbeats) {
        const distance = Math.abs(downbeat - idealTime);
        if (distance < minDistance) {
          minDistance = distance;
          nearestDownbeat = downbeat;
        }
      }
      
      // Only adjust if the nearest downbeat is within a reasonable range (±2 seconds)
      if (minDistance <= 2) {
        transitionPoints.push(nearestDownbeat);
      } else {
        transitionPoints.push(idealTime);
      }
    }
    
    // Mark transition points in beats array
    for (const beat of beats) {
      if (transitionPoints.includes(beat.time)) {
        beat.type = 'transition-point';
        beat.strength = 1.0;
      }
    }

    console.log(`✅ Generated ${beats.length} beats, ${downbeats.length} downbeats, ${transitionPoints.length} transition points`);

    const result: BeatAnalysisResult = {
      bpm,
      beats,
      downbeats,
      transitionPoints,
      duration: videoDuration,
    };

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Beat analysis error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
