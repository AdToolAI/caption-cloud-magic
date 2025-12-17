import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Analyze music for BPM and beat positions
 * Returns beat data for scene transitions and animations
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { musicUrl, duration = 60 } = await req.json();

    if (!musicUrl) {
      throw new Error('musicUrl is required');
    }

    console.log('[analyze-music-beats] Starting analysis:', { musicUrl, duration });

    // For now, use heuristic-based beat estimation
    // In production, this could use Essentia.js or similar audio analysis
    const beatData = estimateBeatData(musicUrl, duration);

    console.log('[analyze-music-beats] Beat analysis complete:', {
      bpm: beatData.bpm,
      beatCount: beatData.beats.length,
      transitionPoints: beatData.transitionPoints.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...beatData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-music-beats] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        // Return fallback beat data
        bpm: 120,
        beats: [],
        transitionPoints: [],
        downbeats: [],
      }),
      { 
        status: 200, // Return 200 with fallback data
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Estimate beat data based on common music patterns
 * Uses genre detection from URL and standard BPM ranges
 */
function estimateBeatData(musicUrl: string, duration: number): any {
  // Detect mood/genre from URL patterns
  const urlLower = musicUrl.toLowerCase();
  let estimatedBpm = 120; // Default moderate tempo
  
  if (urlLower.includes('upbeat') || urlLower.includes('energetic')) {
    estimatedBpm = 128;
  } else if (urlLower.includes('calm') || urlLower.includes('relaxing')) {
    estimatedBpm = 90;
  } else if (urlLower.includes('corporate') || urlLower.includes('business')) {
    estimatedBpm = 110;
  } else if (urlLower.includes('inspirational')) {
    estimatedBpm = 100;
  } else if (urlLower.includes('cinematic')) {
    estimatedBpm = 95;
  }

  const beatInterval = 60 / estimatedBpm; // seconds between beats
  const beatsPerBar = 4;
  const barInterval = beatInterval * beatsPerBar;

  // Generate beat positions
  const beats: number[] = [];
  const downbeats: number[] = [];
  const transitionPoints: number[] = [];

  let currentTime = 0;
  let beatCount = 0;

  while (currentTime < duration) {
    beats.push(currentTime);
    
    // Every 4 beats is a downbeat (start of a bar)
    if (beatCount % beatsPerBar === 0) {
      downbeats.push(currentTime);
    }
    
    // Every 8 or 16 beats is a good transition point
    if (beatCount % (beatsPerBar * 2) === 0 && beatCount > 0) {
      transitionPoints.push(currentTime);
    }
    
    currentTime += beatInterval;
    beatCount++;
  }

  // Add key musical moments (good for scene changes)
  // Typically at 25%, 50%, 75% of the track
  const musicalMoments = [
    Math.round(duration * 0.25),
    Math.round(duration * 0.5),
    Math.round(duration * 0.75),
  ];

  // Find nearest beats to musical moments
  const keyTransitions = musicalMoments.map(moment => {
    const nearestBeat = beats.reduce((prev, curr) => 
      Math.abs(curr - moment) < Math.abs(prev - moment) ? curr : prev
    );
    return nearestBeat;
  });

  return {
    bpm: estimatedBpm,
    beatInterval,
    beats: beats.slice(0, 200), // Limit array size
    downbeats: downbeats.slice(0, 50),
    transitionPoints: [...new Set([...transitionPoints, ...keyTransitions])].sort((a, b) => a - b),
    musicalMoments: keyTransitions,
    beatsPerBar,
    estimatedMood: detectMood(urlLower),
  };
}

function detectMood(url: string): string {
  if (url.includes('upbeat') || url.includes('energetic') || url.includes('happy')) {
    return 'energetic';
  } else if (url.includes('calm') || url.includes('relax') || url.includes('peaceful')) {
    return 'calm';
  } else if (url.includes('corporate') || url.includes('business') || url.includes('professional')) {
    return 'professional';
  } else if (url.includes('inspirational') || url.includes('motivational')) {
    return 'inspirational';
  } else if (url.includes('cinematic') || url.includes('epic')) {
    return 'cinematic';
  }
  return 'neutral';
}
