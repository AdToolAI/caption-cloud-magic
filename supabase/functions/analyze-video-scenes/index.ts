import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneAnalysis {
  id: string;
  start_time: number;
  end_time: number;
  original_start_time?: number;
  original_end_time?: number;
  playbackRate?: number;
  description: string;
  mood: string;
  suggested_effects: {
    type: string;
    name: string;
    reason: string;
    confidence: number;
  }[];
  ai_suggestions: string[];
}

interface SceneBoundary {
  time: number;
  type: 'hard_cut' | 'soft_transition';
  score: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, duration, frames, scene_boundaries, detected_cuts, client_extraction_failed } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "video_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoDuration = duration || 30;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // scene_boundaries from deterministic client-side detection
    const boundaries: SceneBoundary[] = Array.isArray(scene_boundaries) ? scene_boundaries : [];
    const legacyCuts: number[] = Array.isArray(detected_cuts) ? detected_cuts : [];
    const hasClientBoundaries = boundaries.length > 0 || legacyCuts.length > 0;
    
    console.log(`[analyze-video-scenes] Video: ${video_url}, duration: ${videoDuration}s, boundaries: ${boundaries.length}, legacy_cuts: ${legacyCuts.length}, frames: ${frames?.length || 0}, client_failed: ${!!client_extraction_failed}`);

    let analysisMode = 'client_deterministic';
    let serverBoundaries: SceneBoundary[] = [];

    // PATH A: Client provided boundaries → use them
    // PATH B: No boundaries → server-side scene detection via Gemini Vision
    if (!hasClientBoundaries) {
      console.log("[analyze-video-scenes] No client boundaries — running server-side scene detection via Vision API");
      analysisMode = 'server_vision';
      
      try {
        serverBoundaries = await detectScenesViaVision(video_url, videoDuration, LOVABLE_API_KEY);
        console.log(`[analyze-video-scenes] Server detected ${serverBoundaries.length} boundaries: ${serverBoundaries.map(b => `${b.time.toFixed(1)}s(${b.type})`).join(', ')}`);
      } catch (e) {
        console.error("[analyze-video-scenes] Server-side detection failed:", e);
        analysisMode = 'fallback_single';
      }
    }

    // Build deterministic scenes
    const allBoundaries = hasClientBoundaries ? boundaries : serverBoundaries;
    const allLegacyCuts = hasClientBoundaries ? legacyCuts : [];
    const deterministicScenes = buildDeterministicScenes(allBoundaries, allLegacyCuts, videoDuration);
    
    console.log(`[analyze-video-scenes] Scenes: ${deterministicScenes.length} → ${deterministicScenes.map(s => `${s.start_time.toFixed(1)}-${s.end_time.toFixed(1)}s`).join(', ')} (mode: ${analysisMode})`);

    // Ask AI to DESCRIBE each scene
    const hasFrames = frames && frames.length > 0;

    const sceneList = deterministicScenes.map((s, i) => 
      `Szene ${i + 1}: ${s.start_time.toFixed(1)}s bis ${s.end_time.toFixed(1)}s`
    ).join('\n');

    const systemPrompt = `Du bist ein Video-Analyst. Die Szenengrenzen sind bereits FEST bestimmt.
Du darfst die Anzahl oder Zeitgrenzen der Szenen NICHT ändern!

VORGEGEBENE SZENEN (unveränderlich):
${sceneList}

Deine Aufgabe: Beschreibe jede vorgegebene Szene anhand der Frames/des Videos.

Für JEDE Szene gib zurück:
{
  "id": "scene-N",
  "description": "Kurze Beschreibung (max 50 Zeichen)",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant|noir|muted|highkey", "reason": "...", "confidence": 0.8 },
    { "type": "color", "name": "brightness-110|contrast-115|saturation-120|vignette-40", "reason": "...", "confidence": 0.8 }
  ],
  "ai_suggestions": ["Vorschlag 1", "Vorschlag 2"]
}

REGELN:
- Gib EXAKT ${deterministicScenes.length} Szenen zurück (nicht mehr, nicht weniger!)
- Szene 1 startet bei ${deterministicScenes[0].start_time}s, letzte endet bei ${deterministicScenes[deterministicScenes.length - 1].end_time}s
- JEDE Szene braucht 2 suggested_effects (1 filter + 1 color)
- Beschreibungen MAXIMAL 50 Zeichen
- Antworte NUR mit einem validen JSON-Array!`;

    let aiDescriptions: any[] | null = null;

    // Try AI description with frames or video URL
    const describePromptText = `Beschreibe die ${deterministicScenes.length} vorgegebenen Szenen. Antworte NUR mit JSON-Array!`;
    
    try {
      const userContent: any[] = [{ type: "text", text: describePromptText }];
      
      if (hasFrames) {
        const frameImages = (typeof frames[0] === 'object' && 'image' in frames[0])
          ? frames.map((f: { image: string }) => f.image)
          : frames;
        for (const frame of frameImages) {
          userContent.push({ type: "image_url", image_url: { url: frame, detail: "high" } });
        }
      } else {
        // Send video URL directly to Gemini Vision
        userContent.push({ type: "image_url", image_url: { url: video_url } });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      });

      if (response.ok) {
        const aiResponse = await response.json();
        const content = aiResponse.choices?.[0]?.message?.content || "";
        aiDescriptions = parseAIResponse(content);
      }
    } catch (e) {
      console.error("[analyze-video-scenes] AI description error:", e);
    }

    // Merge AI descriptions into deterministic scenes
    const finalScenes: SceneAnalysis[] = deterministicScenes.map((scene, i) => {
      const aiScene = aiDescriptions && aiDescriptions[i];
      const mood = aiScene?.mood || "neutral";
      
      return {
        id: `scene-${i + 1}`,
        start_time: scene.start_time,
        end_time: scene.end_time,
        original_start_time: scene.start_time,
        original_end_time: scene.end_time,
        playbackRate: 1.0,
        description: aiScene?.description || (deterministicScenes.length === 1 ? "Gesamtes Video" : `Szene ${i + 1}`),
        mood,
        suggested_effects: (aiScene?.suggested_effects?.length >= 2)
          ? aiScene.suggested_effects
          : generateDefaultEffectsForMood(mood),
        ai_suggestions: aiScene?.ai_suggestions?.length > 0
          ? aiScene.ai_suggestions
          : ["Farbkorrektur empfohlen"],
      };
    });

    console.log(`[analyze-video-scenes] Final: ${finalScenes.map(s => `${s.id}:${s.start_time}-${s.end_time}s`).join(', ')}`);

    return new Response(
      JSON.stringify({ 
        scenes: finalScenes, 
        source: analysisMode,
        boundaries_used: allBoundaries.length,
        analysis_mode: analysisMode,
        debug_boundary_times: allBoundaries.map(b => b.time),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-video-scenes] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Server-side scene detection using Gemini Vision API.
 * Sends the video URL directly and asks the model to identify exact cut timestamps.
 */
async function detectScenesViaVision(
  videoUrl: string, 
  duration: number, 
  apiKey: string
): Promise<SceneBoundary[]> {
  const prompt = `Du bist ein Video-Schnitt-Detektor. Analysiere dieses ${duration.toFixed(1)}s Video und finde ALLE echten Szenenwechsel.

AUFGABE: Identifiziere die exakten Zeitpunkte, an denen ein Szenenwechsel stattfindet.
Ein Szenenwechsel ist:
- Harter Schnitt (abrupter Wechsel zwischen zwei verschiedenen Szenen)
- Weicher Übergang (Fade, Dissolve, Morph zwischen zwei verschiedenen Szenen)

KEIN Szenenwechsel ist:
- Kamerabewegung innerhalb derselben Szene
- Zoom in/out in derselben Szene  
- Helligkeitsänderung durch Lichtwechsel
- Gleiche Szene aus leicht anderem Winkel

WICHTIG: Sei SEHR GENAU mit den Zeitangaben. Gib nur ECHTE, eindeutige Szenenwechsel an.
Wenn es keine Szenenwechsel gibt, gib ein leeres Array zurück.

Antworte NUR mit einem JSON-Array von Objekten:
[
  { "time": 30.0, "type": "hard_cut", "confidence": 0.95, "description": "Wechsel von Szene A zu Szene B" }
]

Mögliche Typen: "hard_cut", "soft_transition"
confidence: 0.0 bis 1.0 (nur Wechsel mit confidence >= 0.7 sind relevant)

Antworte NUR mit dem JSON-Array, kein weiterer Text!`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: videoUrl } }
        ]}
      ],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} - ${errorText}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || "";
  
  console.log(`[detectScenesViaVision] Raw AI response: ${content.substring(0, 500)}`);
  
  const parsed = parseAIResponse(content);
  if (!parsed || !Array.isArray(parsed)) {
    console.log("[detectScenesViaVision] Could not parse response as array");
    return [];
  }

  // Filter valid boundaries with sufficient confidence
  const boundaries: SceneBoundary[] = [];
  for (const item of parsed) {
    const time = typeof item.time === 'number' ? item.time : parseFloat(item.time);
    const confidence = typeof item.confidence === 'number' ? item.confidence : 0.5;
    
    if (isNaN(time) || time <= 0.5 || time >= duration - 0.5) continue;
    if (confidence < 0.7) continue;
    
    boundaries.push({
      time,
      type: item.type === 'soft_transition' ? 'soft_transition' : 'hard_cut',
      score: confidence,
    });
  }

  // Sort and deduplicate (merge boundaries within 1s of each other)
  boundaries.sort((a, b) => a.time - b.time);
  const deduped: SceneBoundary[] = [];
  for (const b of boundaries) {
    if (deduped.length === 0 || b.time - deduped[deduped.length - 1].time > 1.0) {
      deduped.push(b);
    } else if (b.score > deduped[deduped.length - 1].score) {
      deduped[deduped.length - 1] = b;
    }
  }

  return deduped;
}

// Build scenes from deterministic boundaries — AI CANNOT change these
function buildDeterministicScenes(
  boundaries: SceneBoundary[],
  legacyCuts: number[],
  duration: number
): { start_time: number; end_time: number }[] {
  const cutTimes = boundaries.length > 0
    ? boundaries.map(b => b.time)
    : legacyCuts.length > 0
      ? legacyCuts
      : [];

  if (cutTimes.length === 0) {
    return [{ start_time: 0, end_time: duration }];
  }

  const sorted = [...cutTimes].sort((a, b) => a - b);
  const scenes: { start_time: number; end_time: number }[] = [];
  let lastStart = 0;

  for (const t of sorted) {
    if (t > lastStart + 0.5 && t < duration - 0.5) {
      scenes.push({ start_time: lastStart, end_time: t });
      lastStart = t;
    }
  }
  scenes.push({ start_time: lastStart, end_time: duration });

  return scenes;
}

function parseAIResponse(content: string): any[] | null {
  try {
    let clean = content.trim();
    if (clean.startsWith("```json")) clean = clean.slice(7);
    if (clean.startsWith("```")) clean = clean.slice(3);
    if (clean.endsWith("```")) clean = clean.slice(0, -3);
    const parsed = JSON.parse(clean.trim());
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function generateDefaultEffectsForMood(mood: string) {
  const moodEffects: Record<string, any[]> = {
    dynamic: [
      { type: "filter", name: "vibrant", reason: "Verstärkt dynamische Energie", confidence: 0.85 },
      { type: "color", name: "saturation-130", reason: "Lebendige Farben", confidence: 0.8 }
    ],
    calm: [
      { type: "filter", name: "muted", reason: "Ruhige Stimmung", confidence: 0.85 },
      { type: "color", name: "brightness-105", reason: "Sanfte Aufhellung", confidence: 0.8 }
    ],
    energetic: [
      { type: "filter", name: "highkey", reason: "Energiegeladene Optik", confidence: 0.85 },
      { type: "color", name: "contrast-120", reason: "Verstärkter Kontrast", confidence: 0.8 }
    ],
    emotional: [
      { type: "filter", name: "cinematic", reason: "Filmische Tiefe", confidence: 0.85 },
      { type: "color", name: "saturation-90", reason: "Reduzierte Farben", confidence: 0.8 }
    ],
    neutral: [
      { type: "filter", name: "cinematic", reason: "Professioneller Look", confidence: 0.8 },
      { type: "color", name: "contrast-110", reason: "Leicht erhöhter Kontrast", confidence: 0.75 }
    ]
  };
  return moodEffects[mood] || moodEffects.neutral;
}
