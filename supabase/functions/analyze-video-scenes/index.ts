import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneAnalysis {
  id: string;
  frame_start?: number;
  frame_end?: number;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, duration, frames, detected_cuts } = await req.json();

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

    // detected_cuts: timestamps where client-side pixel analysis found hard cuts
    const clientCuts: number[] = Array.isArray(detected_cuts) ? detected_cuts : [];
    
    console.log(`[analyze-video-scenes] Video: ${video_url}, duration: ${videoDuration}s, frames: ${frames?.length || 0}, client_cuts: ${clientCuts.length} at [${clientCuts.join(', ')}]`);

    // Frames are now timestamped: Array<{ time: number; image: string }>
    const hasTimestampedFrames = frames && frames.length > 0 && typeof frames[0] === 'object' && 'time' in frames[0];
    // Legacy support: plain string array
    const hasLegacyFrames = frames && frames.length > 0 && typeof frames[0] === 'string';

    if (hasTimestampedFrames || hasLegacyFrames) {
      console.log(`[analyze-video-scenes] Using Vision AI with ${frames.length} ${hasTimestampedFrames ? 'timestamped' : 'legacy'} frames`);

      // Build frame timing info
      let frameTimings: string;
      if (hasTimestampedFrames) {
        frameTimings = frames.map((f: { time: number }, i: number) => 
          `Frame ${i + 1}: Sekunde ${f.time.toFixed(1)}`
        ).join('\n');
      } else {
        // Legacy: assume evenly distributed
        const interval = videoDuration / frames.length;
        frameTimings = frames.map((_: string, i: number) => 
          `Frame ${i + 1}: Sekunde ${(i * interval).toFixed(1)}`
        ).join('\n');
      }

      // Build cut-detection context
      const cutContext = clientCuts.length > 0
        ? `\n\nVORERKENNUNG (Pixel-Analyse): Es wurden ${clientCuts.length} mögliche harte Schnitte bei folgenden Zeitpunkten erkannt: ${clientCuts.map(t => `${t.toFixed(1)}s`).join(', ')}.\nDeine Aufgabe: Bestätige oder verwerfe diese Schnitte anhand der Frames. Wenn ein erkannter Schnitt KEIN echter harter Cut ist (z.B. nur Kamerabewegung), dann ignoriere ihn.`
        : `\n\nVORERKENNUNG (Pixel-Analyse): Es wurden KEINE harten Schnitte erkannt. Wenn du ebenfalls keine harten Schnitte siehst, gib NUR 1 Szene zurück, die das gesamte Video umfasst.`;

      const systemPrompt = `Du bist ein präziser Video-Schnitt-Analyst. Deine Aufgabe: NUR ECHTE HARTE SCHNITTE bestätigen.

FRAME-ZEITSTEMPEL:
${frameTimings}

KRITISCHE ANWEISUNG - NUR ECHTE HARTE SCHNITTE:
⚠️ Ein SCHNITT ist NUR wenn sich das Bild ABRUPT und VOLLSTÄNDIG ändert (harter Cut)!
⚠️ Kamerabewegung, Zoom, Schwenk, Tracking = KEIN Schnitt! Gleiche Szene!
⚠️ Leichte Farbänderung, Belichtungsänderung = KEIN Schnitt!
⚠️ Gleiche Szene aus leicht anderem Winkel = KEIN Schnitt!
⚠️ Objekt bewegt sich oder dreht sich = KEIN Schnitt!
⚠️ Wenn du dir NICHT SICHER bist → es ist KEIN Schnitt!
⚠️ Wenn das Video KEINE harten Schnitte hat, gib NUR 1 Szene zurück!
${cutContext}

CHRONOLOGISCHE REIHENFOLGE:
⚠️ Szene 1 = was du in den ERSTEN Frames siehst
⚠️ Szene 2 = was du NACH dem ersten HARTEN SCHNITT siehst

JSON FORMAT für jede Szene:
{
  "id": "scene-1",
  "start_time": number (Sekunden),
  "end_time": number (Sekunden),
  "description": "string (MAXIMAL 50 Zeichen!)",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant|noir|muted|highkey", "reason": "Kurze Begründung", "confidence": 0.8 },
    { "type": "color", "name": "brightness-110|contrast-115|saturation-120|vignette-40", "reason": "Kurze Begründung", "confidence": 0.8 }
  ],
  "ai_suggestions": ["Vorschlag 1", "Vorschlag 2"]
}

REGELN:
- Erste Szene startet IMMER bei 0.0s
- Letzte Szene endet IMMER bei ${videoDuration}s
- JEDE Szene braucht genau 2 suggested_effects (1 filter + 1 color)
- Beschreibungen MAXIMAL 50 Zeichen
- Antworte NUR mit einem validen JSON-Array!`;

      const userContent: any[] = [
        { 
          type: "text", 
          text: `Analysiere diese Frames und bestätige echte harte Schnitte. ${clientCuts.length > 0 ? `Vorab-Erkennung hat Schnitte bei ${clientCuts.map(t => `${t.toFixed(1)}s`).join(', ')} gefunden — bestätige oder verwerfe sie.` : 'Es wurden vorab KEINE Schnitte erkannt.'} Antworte NUR mit dem JSON-Array!`
        }
      ];

      // Add frames as images
      const frameImages = hasTimestampedFrames 
        ? frames.map((f: { image: string }) => f.image)
        : frames;
      
      for (const frame of frameImages) {
        userContent.push({
          type: "image_url",
          image_url: { url: frame, detail: "high" }
        });
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[analyze-video-scenes] Vision AI error:", response.status, errorText);
        
        // If client detected cuts, use those; otherwise 1 scene
        const fallbackScenes = clientCuts.length > 0
          ? buildScenesFromCuts(clientCuts, videoDuration)
          : generateSingleScene(videoDuration);
        
        return new Response(
          JSON.stringify({ scenes: fallbackScenes, source: 'fallback_client_cuts' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices?.[0]?.message?.content || "";

      console.log("[analyze-video-scenes] Vision AI response:", content.substring(0, 800));

      let scenes: SceneAnalysis[];
      try {
        let cleanContent = content.trim();
        if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
        if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
        if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);
        
        scenes = JSON.parse(cleanContent.trim());
        
        if (!Array.isArray(scenes)) {
          throw new Error("Response is not an array");
        }
        
        console.log(`[analyze-video-scenes] Raw AI scenes: ${JSON.stringify(scenes.map(s => ({
          id: s.id, start_time: s.start_time, end_time: s.end_time, desc: s.description?.substring(0, 30)
        })))}`);
        
        // Sort by start_time
        scenes = scenes.sort((a, b) => (a.start_time || 0) - (b.start_time || 0));
        
        // Validate and normalize
        scenes = scenes.map((scene, index) => {
          let startTime = Math.round((scene.start_time || 0) * 10) / 10;
          let endTime = Math.round((scene.end_time || videoDuration) * 10) / 10;
          
          if (index === 0) startTime = 0;
          if (index === scenes.length - 1) endTime = videoDuration;
          if (endTime <= startTime) endTime = startTime + 2;
          
          const mood = scene.mood || "neutral";
          let effects = Array.isArray(scene.suggested_effects) && scene.suggested_effects.length > 0 
            ? scene.suggested_effects 
            : generateDefaultEffectsForMood(mood);
          if (effects.length < 2) effects = generateDefaultEffectsForMood(mood);
          
          return {
            id: `scene-${index + 1}`,
            start_time: startTime,
            end_time: endTime,
            original_start_time: startTime,
            original_end_time: endTime,
            playbackRate: 1.0,
            description: scene.description || `Szene ${index + 1}`,
            mood,
            suggested_effects: effects,
            ai_suggestions: Array.isArray(scene.ai_suggestions) && scene.ai_suggestions.length > 0 
              ? scene.ai_suggestions 
              : ["Farbkorrektur empfohlen", "Leichte Kontrastverstärkung"],
          };
        });
        
        // Stabilize
        scenes = stabilizeScenes(scenes, videoDuration);
        
        console.log(`[analyze-video-scenes] Final: ${scenes.map(s => `${s.id}:${s.start_time}-${s.end_time}s`).join(', ')}`);
        
      } catch (parseError) {
        console.error("[analyze-video-scenes] Parse error:", parseError);
        // Use client cuts if available, otherwise single scene
        scenes = clientCuts.length > 0
          ? buildScenesFromCuts(clientCuts, videoDuration)
          : generateSingleScene(videoDuration);
      }

      return new Response(
        JSON.stringify({ scenes, source: 'vision_ai' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No client-side frames — send video URL directly to Gemini Vision
    console.log("[analyze-video-scenes] No client frames, sending video_url directly");

    const cutContextDirect = clientCuts.length > 0
      ? `Vorab-Pixel-Analyse hat ${clientCuts.length} Schnitte bei [${clientCuts.map(t => `${t.toFixed(1)}s`).join(', ')}] erkannt. Bestätige oder verwerfe diese.`
      : 'Vorab-Pixel-Analyse hat KEINE Schnitte erkannt. Wenn du ebenfalls keine siehst, gib NUR 1 Szene zurück.';

    const videoAnalysisPrompt = `Du bist ein präziser Video-Schnitt-Analyst. Analysiere dieses Video und identifiziere NUR ECHTE HARTE SCHNITTE.

KRITISCHE ANWEISUNG:
- Ein SCHNITT ist NUR wenn sich das Bild ABRUPT und VOLLSTÄNDIG ändert (harter Cut)!
- Kamerabewegung, Zoom, Schwenk = KEIN Schnitt!
- Wenn das Video KEINE harten Schnitte hat, gib NUR 1 Szene zurück!
- ${cutContextDirect}

JSON FORMAT:
{
  "id": "scene-1",
  "start_time": number,
  "end_time": number,
  "description": "MAXIMAL 50 Zeichen",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant|noir|muted|highkey", "reason": "...", "confidence": 0.8 },
    { "type": "color", "name": "brightness-110|contrast-115|saturation-120|vignette-40", "reason": "...", "confidence": 0.8 }
  ],
  "ai_suggestions": ["...", "..."]
}

REGELN:
- Erste Szene: 0.0s, Letzte Szene endet bei ${videoDuration}s
- JEDE Szene: 2 suggested_effects
- Antworte NUR mit JSON-Array!`;

    const userContent: any[] = [
      { type: "text", text: `Analysiere dieses ${videoDuration}s Video. ${cutContextDirect} Antworte NUR mit JSON-Array!` },
      { type: "image_url", image_url: { url: video_url } }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: videoAnalysisPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      console.error("[analyze-video-scenes] AI error:", response.status);
      const scenes = clientCuts.length > 0
        ? buildScenesFromCuts(clientCuts, videoDuration)
        : generateSingleScene(videoDuration);
      return new Response(
        JSON.stringify({ scenes, source: 'fallback' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    let scenes: SceneAnalysis[];
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
      if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
      if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);
      
      scenes = JSON.parse(cleanContent.trim());
      if (!Array.isArray(scenes)) throw new Error("Not an array");
      
      scenes = scenes
        .sort((a, b) => (a.start_time || 0) - (b.start_time || 0))
        .map((scene, index) => ({
          id: `scene-${index + 1}`,
          start_time: index === 0 ? 0 : (scene.start_time || 0),
          end_time: index === scenes.length - 1 ? videoDuration : (scene.end_time || videoDuration),
          original_start_time: index === 0 ? 0 : (scene.start_time || 0),
          original_end_time: index === scenes.length - 1 ? videoDuration : (scene.end_time || videoDuration),
          playbackRate: 1.0,
          description: scene.description || `Szene ${index + 1}`,
          mood: scene.mood || "neutral",
          suggested_effects: scene.suggested_effects?.length >= 2 ? scene.suggested_effects : generateDefaultEffectsForMood(scene.mood || "neutral"),
          ai_suggestions: scene.ai_suggestions || [],
        }));
      
      scenes = stabilizeScenes(scenes, videoDuration);
    } catch (parseError) {
      console.error("[analyze-video-scenes] Parse error:", parseError);
      scenes = clientCuts.length > 0
        ? buildScenesFromCuts(clientCuts, videoDuration)
        : generateSingleScene(videoDuration);
    }

    return new Response(
      JSON.stringify({ scenes, source: 'vision_direct' }),
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

function stabilizeScenes(scenes: any[], videoDuration: number): any[] {
  if (scenes.length <= 1) return scenes;
  
  const MIN_SCENE_DURATION = 3.0;
  const MAX_SCENES_PER_10S = 1;
  const maxScenes = Math.max(1, Math.ceil(videoDuration / 10 * MAX_SCENES_PER_10S));
  
  let stabilized: any[] = [];
  for (const scene of scenes) {
    const dur = (scene.end_time || 0) - (scene.start_time || 0);
    if (dur < MIN_SCENE_DURATION && stabilized.length > 0) {
      stabilized[stabilized.length - 1].end_time = scene.end_time;
      stabilized[stabilized.length - 1].original_end_time = scene.original_end_time ?? scene.end_time;
      console.log(`[stabilize] Merged micro-scene (${dur.toFixed(1)}s)`);
    } else {
      stabilized.push({ ...scene });
    }
  }
  
  while (stabilized.length > maxScenes) {
    let shortestIdx = -1;
    let shortestDur = Infinity;
    for (let i = 1; i < stabilized.length - 1; i++) {
      const dur = stabilized[i].end_time - stabilized[i].start_time;
      if (dur < shortestDur) { shortestDur = dur; shortestIdx = i; }
    }
    if (shortestIdx < 0) break;
    stabilized[shortestIdx - 1].end_time = stabilized[shortestIdx].end_time;
    stabilized.splice(shortestIdx, 1);
  }
  
  return stabilized.map((s, i) => ({ ...s, id: `scene-${i + 1}` }));
}

// Build scenes from client-detected cut timestamps
function buildScenesFromCuts(cuts: number[], duration: number): SceneAnalysis[] {
  const sortedCuts = [...cuts].sort((a, b) => a - b);
  const scenes: SceneAnalysis[] = [];
  let lastStart = 0;
  
  for (let i = 0; i < sortedCuts.length; i++) {
    const mood = i === 0 ? "dynamic" : "neutral";
    scenes.push({
      id: `scene-${i + 1}`,
      start_time: lastStart,
      end_time: sortedCuts[i],
      original_start_time: lastStart,
      original_end_time: sortedCuts[i],
      playbackRate: 1.0,
      description: i === 0 ? "Eröffnung" : `Szene ${i + 1}`,
      mood,
      suggested_effects: generateDefaultEffectsForMood(mood),
      ai_suggestions: ["Automatisch aus Pixel-Analyse erkannt"],
    });
    lastStart = sortedCuts[i];
  }
  
  // Final scene
  scenes.push({
    id: `scene-${sortedCuts.length + 1}`,
    start_time: lastStart,
    end_time: duration,
    original_start_time: lastStart,
    original_end_time: duration,
    playbackRate: 1.0,
    description: sortedCuts.length === 0 ? "Gesamtes Video" : "Abschluss",
    mood: "calm",
    suggested_effects: generateDefaultEffectsForMood("calm"),
    ai_suggestions: ["Automatisch aus Pixel-Analyse erkannt"],
  });
  
  return scenes;
}

// Conservative fallback: exactly 1 scene covering the whole video
function generateSingleScene(duration: number): SceneAnalysis[] {
  return [{
    id: "scene-1",
    start_time: 0,
    end_time: duration,
    original_start_time: 0,
    original_end_time: duration,
    playbackRate: 1.0,
    description: "Gesamtes Video",
    mood: "neutral",
    suggested_effects: generateDefaultEffectsForMood("neutral"),
    ai_suggestions: ["Keine harten Schnitte erkannt", "Video als eine Szene behandelt"],
  }];
}
