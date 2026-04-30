// auto-match-music-to-video
// Analyzes a video (cuts/sec + visual mood via Lovable AI) and returns
// a music-generation recommendation: bpm, duration, genre, mood, prompt.
// Free for the user — no credit deduction. Generation itself uses
// the existing `generate-music-track` pipeline with normal pricing.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface AutoMatchRequest {
  video_url: string;
  duration_sec: number;
  // Optional: client-extracted frames as base64 data URLs (jpeg/png)
  frames?: string[];
  // Optional: scene cut count detected on the client
  scene_cuts?: number;
}

interface MoodAnalysis {
  genre: string;       // e.g. "cinematic", "electronic", "lo-fi"
  mood: string;        // e.g. "energetic", "calm", "dark"
  energy: number;      // 0..1
  brightness: number;  // 0..1 (dark -> bright)
  descriptors: string[]; // e.g. ["epic", "drone", "orchestral"]
}

const VALID_GENRES = [
  'cinematic', 'electronic', 'hip-hop', 'lo-fi', 'corporate',
  'ambient', 'rock', 'pop', 'classical', 'jazz',
];
const VALID_MOODS = ['calm', 'mellow', 'steady', 'energetic', 'hype', 'dark', 'uplifting'];

/** Map cuts-per-second → BPM (deterministic, transparent) */
function cutsToBpm(cutsPerSec: number): number {
  if (cutsPerSec < 0.2) return 75;
  if (cutsPerSec < 0.4) return 95;
  if (cutsPerSec < 0.7) return 115;
  if (cutsPerSec < 1.0) return 128;
  if (cutsPerSec < 1.5) return 140;
  return 160;
}

/** Snap BPM into common dance-music grid for natural musicality */
function snapBpm(bpm: number): number {
  const grid = [70, 80, 90, 100, 110, 120, 128, 135, 140, 150, 160, 170];
  let best = grid[0];
  let bestDiff = Math.abs(grid[0] - bpm);
  for (const g of grid) {
    const d = Math.abs(g - bpm);
    if (d < bestDiff) { bestDiff = d; best = g; }
  }
  return best;
}

async function analyzeMoodWithAI(
  frames: string[],
  apiKey: string,
): Promise<MoodAnalysis> {
  const content: any[] = [
    {
      type: "text",
      text: `Analyze these video frames and recommend music. Return ONLY a JSON object via the tool call. Choose:
- genre: one of ${VALID_GENRES.join(', ')}
- mood: one of ${VALID_MOODS.join(', ')}
- energy: 0..1 (calm=0, intense=1)
- brightness: 0..1 (dark=0, bright=1)
- descriptors: 3-5 short adjectives (e.g. "epic", "drone", "uplifting", "warm pads", "vintage")`,
    },
  ];
  for (const f of frames.slice(0, 6)) {
    content.push({ type: "image_url", image_url: { url: f } });
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are an expert music supervisor for film. Analyze visual content and recommend matching music." },
        { role: "user", content },
      ],
      tools: [{
        type: "function",
        function: {
          name: "recommend_music",
          description: "Recommend music style for the given video frames.",
          parameters: {
            type: "object",
            properties: {
              genre: { type: "string", enum: VALID_GENRES },
              mood: { type: "string", enum: VALID_MOODS },
              energy: { type: "number" },
              brightness: { type: "number" },
              descriptors: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
            },
            required: ["genre", "mood", "energy", "brightness", "descriptors"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "recommend_music" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("AI rate limit exceeded — please retry shortly");
    if (resp.status === 402) throw new Error("AI credits exhausted — please top up your workspace");
    const t = await resp.text().catch(() => '');
    throw new Error(`AI gateway error ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("AI returned no recommendation");
  }
  const parsed = JSON.parse(toolCall.function.arguments);
  return {
    genre: VALID_GENRES.includes(parsed.genre) ? parsed.genre : 'cinematic',
    mood: VALID_MOODS.includes(parsed.mood) ? parsed.mood : 'steady',
    energy: Math.max(0, Math.min(1, Number(parsed.energy) || 0.5)),
    brightness: Math.max(0, Math.min(1, Number(parsed.brightness) || 0.5)),
    descriptors: Array.isArray(parsed.descriptors) ? parsed.descriptors.slice(0, 6).map((s: any) => String(s)) : [],
  };
}

/** Heuristic fallback when no frames provided */
function fallbackMood(cutsPerSec: number): MoodAnalysis {
  if (cutsPerSec > 1.0) {
    return { genre: 'electronic', mood: 'energetic', energy: 0.85, brightness: 0.7, descriptors: ['driving', 'rhythmic', 'modern'] };
  }
  if (cutsPerSec > 0.4) {
    return { genre: 'corporate', mood: 'steady', energy: 0.6, brightness: 0.65, descriptors: ['uplifting', 'motivational', 'clean'] };
  }
  return { genre: 'cinematic', mood: 'calm', energy: 0.35, brightness: 0.5, descriptors: ['atmospheric', 'orchestral', 'emotive'] };
}

function buildMusicPrompt(mood: MoodAnalysis, bpm: number, durationSec: number): string {
  const descPart = mood.descriptors.length ? mood.descriptors.join(', ') : '';
  return [
    `${mood.genre} background score, ${mood.mood} mood`,
    descPart && `Style: ${descPart}`,
    `${bpm} BPM`,
    `Duration: ${Math.round(durationSec)}s`,
    'instrumental, professional production, mastered, suitable for video',
  ].filter(Boolean).join('. ');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as AutoMatchRequest;
    const { video_url, duration_sec, frames = [], scene_cuts } = body;

    if (!video_url || typeof video_url !== 'string') {
      return new Response(JSON.stringify({ error: "video_url is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const dur = Math.max(3, Math.min(600, Number(duration_sec) || 30));

    // Step 1: cuts/sec → BPM (use client-provided cut count; fallback estimate from frame count)
    let cuts = typeof scene_cuts === 'number' && scene_cuts >= 0 ? scene_cuts : 0;
    if (cuts === 0 && frames.length > 1) {
      // Conservative estimate: assume one scene change per ~2 frames sampled
      cuts = Math.max(1, Math.floor(frames.length / 2));
    }
    const cutsPerSec = cuts > 0 ? cuts / dur : 0.3;
    const rawBpm = cutsToBpm(cutsPerSec);
    const bpm = snapBpm(rawBpm);

    // Step 2: mood analysis (AI if frames provided, else heuristic)
    let mood: MoodAnalysis;
    let analysisSource: 'ai' | 'heuristic' = 'heuristic';
    if (frames.length > 0) {
      try {
        mood = await analyzeMoodWithAI(frames, apiKey);
        analysisSource = 'ai';
      } catch (e) {
        console.warn('[auto-match-music] AI mood analysis failed, falling back:', e);
        mood = fallbackMood(cutsPerSec);
      }
    } else {
      mood = fallbackMood(cutsPerSec);
    }

    // Step 3: build music prompt
    const prompt = buildMusicPrompt(mood, bpm, dur);

    return new Response(JSON.stringify({
      success: true,
      recommendation: {
        bpm,
        durationSec: Math.round(dur),
        genre: mood.genre,
        mood: mood.mood,
        prompt,
        descriptors: mood.descriptors,
      },
      analysis: {
        cutsPerSecond: Number(cutsPerSec.toFixed(3)),
        sceneCuts: cuts,
        videoDurationSec: Math.round(dur),
        energy: mood.energy,
        brightness: mood.brightness,
        analysisSource,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[auto-match-music] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
