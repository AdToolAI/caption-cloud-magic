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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, duration, frames } = await req.json();

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

    console.log(`[analyze-video-scenes] Analyzing video: ${video_url}, duration: ${videoDuration}s, frames: ${frames?.length || 0}`);

    // Use Vision AI if frames are provided
    if (frames && frames.length > 0) {
      console.log(`[analyze-video-scenes] Using Vision AI with ${frames.length} frames`);
      
      // Frames sind alle 0.1 Sekunden extrahiert (hochpräzise Schnitterkennung)
      const FRAME_INTERVAL = 0.1;
      const frameTimings = frames.map((_: string, i: number) => {
        const time = (i * FRAME_INTERVAL).toFixed(1);
        return `Frame ${i + 1}: Sekunde ${time}`;
      }).join('\n');

      const systemPrompt = `Du bist ein präziser Video-Schnitt-Analyst. Deine Aufgabe ist es, EXAKTE Schnittpunkte zu identifizieren.

FRAME-ZEITSTEMPEL:
${frames.length} Frames wurden alle 0.1 Sekunden extrahiert:
Frame 1 = 0.0s, Frame 2 = 0.1s, Frame 3 = 0.2s, Frame 4 = 0.3s, usw.
Formel: Frame N entspricht Sekunde (N-1) × 0.1

KRITISCHE ANWEISUNG - CHRONOLOGISCHE REIHENFOLGE:
⚠️ Du MUSST die Szenen STRIKT IN CHRONOLOGISCHER REIHENFOLGE beschreiben!
⚠️ Szene 1 = was du in den ERSTEN Frames siehst (beginnend bei Frame 1)
⚠️ Szene 2 = was du NACH dem ersten Schnitt siehst
⚠️ Szene 3 = was du NACH dem zweiten Schnitt siehst
⚠️ NIEMALS Szenen nach Ähnlichkeit oder Inhalt gruppieren/sortieren!
⚠️ Die Reihenfolge im JSON muss EXAKT der Zeit-Reihenfolge im Video entsprechen!

FRAME-FÜR-FRAME VERGLEICH:
1. Schaue Frame 1 an, dann Frame 2. SIND SIE VISUELL UNTERSCHIEDLICH?
2. Schaue Frame 2 an, dann Frame 3. SIND SIE VISUELL UNTERSCHIEDLICH?
3. Wiederhole für ALLE ${frames.length} Frames!

WAS IST EIN SCHNITT (neue Szene)?
- Deutlicher Wechsel des Kamerawinkels
- Anderes Hauptobjekt/Produkt im Fokus
- Sprung in der Position/Perspektive
- Wechsel von Nahaufnahme zu Totale oder umgekehrt

WAS IST KEIN SCHNITT (gleiche Szene)?
- Leichte Kamerabewegung
- Gleiche Perspektive mit kleiner Änderung
- Objekt bewegt sich minimal

SZENENGRENZE BERECHNUNG:
Wenn Frame N und Frame N+1 UNTERSCHIEDLICH sind:
→ Schnitt passiert bei (N - 1) × 0.1 Sekunden
→ Diese Szene endet dort, nächste Szene beginnt dort

REGELN:
- Erste Szene startet IMMER bei 0.0s (frame_start: 1)
- Letzte Szene endet IMMER bei ${videoDuration}s
- Szenenzeiten auf 0.1s genau angeben!
- Erwarte 2-5 Szenen für ein ${videoDuration}s Video

JSON FORMAT für jede Szene (MIT FRAME-NUMMERN!):
{
  "id": "scene-1",
  "frame_start": number (Frame-Nummer wo Szene beginnt, z.B. 1),
  "frame_end": number (Frame-Nummer wo Szene endet, z.B. 7),
   "start_time": number (= (frame_start - 1) × 0.1),
   "end_time": number (= (frame_end - 1) × 0.1),
  "description": "string (MAXIMAL 50 Zeichen! z.B. 'Parfümflaschen nebeneinander')",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    // ⚠️ PFLICHT: Generiere IMMER genau 2 Effekte!
    { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant|noir|muted|highkey", "reason": "Kurze Begründung", "confidence": 0.8 },
    { "type": "color", "name": "brightness-110|contrast-115|saturation-120|vignette-40", "reason": "Kurze Begründung", "confidence": 0.8 }
  ],
  "ai_suggestions": ["Vorschlag 1", "Vorschlag 2"]
}

KRITISCH - EFFEKTE PRO SZENE:
Für JEDE Szene MUSST du genau 2 suggested_effects generieren:
1. Einen FILTER-Effekt (type: 'filter') passend zur Stimmung:
   - dynamic → vibrant oder cinematic
   - calm → muted oder warm
   - energetic → vibrant oder highkey
   - emotional → cinematic oder vintage
   - neutral → cinematic oder warm
2. Einen COLOR-Effekt (type: 'color') für Feinabstimmung:
   - brightness-105 bis brightness-120 (heller)
   - contrast-110 bis contrast-130 (mehr Kontrast)
   - saturation-80 bis saturation-140 (Sättigung)
   - vignette-30 bis vignette-60 (Randabdunkelung)

Antworte NUR mit einem validen JSON-Array!`;

      const userContent: any[] = [
         { 
          type: "text", 
          text: `FRAME-ZEITSTEMPEL (alle 0.1 Sekunden):
${frameTimings}

⚠️ WICHTIG: Beschreibe die Szenen IN CHRONOLOGISCHER REIHENFOLGE!
Szene 1 = was in den ersten Frames zu sehen ist
Szene 2 = was nach dem ersten Schnitt zu sehen ist
usw.

⚠️ BESCHREIBUNGEN MÜSSEN KURZ SEIN (max 50 Zeichen)!
❌ Schlecht: "Zwei Parfümflaschen, eine mit goldenen Akzenten und 'ck' in Gold..."
✅ Gut: "Parfümflaschen nebeneinander"

SCHRITT-FÜR-SCHRITT ANALYSE:

1. Schaue Frame 1 an. Was siehst du?
2. Vergleiche Frame 1 mit Frame 2: Gleich oder SCHNITT?
3. Vergleiche Frame 2 mit Frame 3: Gleich oder SCHNITT?
... und so weiter für alle ${frames.length} Frames!

Für jeden gefundenen SCHNITT:
- Notiere die Frame-Nummer VOR dem Schnitt (frame_end der aktuellen Szene)
- Notiere die Frame-Nummer NACH dem Schnitt (frame_start der nächsten Szene)
- Berechne start_time = (frame_start - 1) × 0.1
- Berechne end_time = (frame_end - 1) × 0.1

BEISPIEL für 200 Frames (20s Video bei 0.1s Intervall):
- Frames 1-70: Produkt von vorne → Szene 1: frame_start=1, frame_end=70, start=0.0s, end=6.9s, description="Produkt Frontansicht"
- Frame 71 ist ANDERS → SCHNITT!
- Frames 71-140: Produkt von der Seite → Szene 2: frame_start=71, frame_end=140, start=7.0s, end=13.9s, description="Produkt Seitenansicht"
- Frame 141 ist ANDERS → SCHNITT!
- usw.

GIB FRAME-NUMMERN AN! Das ist wichtig für die Validierung.

Antworte NUR mit dem JSON-Array!`
        }
      ];

      // Add frames as images with high detail for precise analysis
      for (const frame of frames) {
        userContent.push({
          type: "image_url",
          image_url: { 
            url: frame,
            detail: "high"  // Höhere Qualität für bessere Schnitterkennung
          }
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
          temperature: 0.4,
          max_tokens: 4096, // Prevent truncated responses
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[analyze-video-scenes] Vision AI error:", response.status, errorText);
        
        // Fallback to non-vision analysis
        return new Response(
          JSON.stringify({ scenes: generateFallbackScenes(videoDuration) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const aiResponse = await response.json();
      const content = aiResponse.choices?.[0]?.message?.content || "";

      console.log("[analyze-video-scenes] Vision AI response:", content.substring(0, 800));

      // Parse AI response
      let scenes: SceneAnalysis[];
      try {
        let cleanContent = content.trim();
        if (cleanContent.startsWith("```json")) {
          cleanContent = cleanContent.slice(7);
        }
        if (cleanContent.startsWith("```")) {
          cleanContent = cleanContent.slice(3);
        }
        if (cleanContent.endsWith("```")) {
          cleanContent = cleanContent.slice(0, -3);
        }
        
        scenes = JSON.parse(cleanContent.trim());
        
        if (!Array.isArray(scenes)) {
          throw new Error("Response is not an array");
        }
        
        // Log raw AI response for debugging
        console.log(`[analyze-video-scenes] Raw AI scenes: ${JSON.stringify(scenes.map(s => ({
          id: s.id,
          frame_start: s.frame_start,
          frame_end: s.frame_end,
          start_time: s.start_time,
          end_time: s.end_time,
          desc: s.description?.substring(0, 30)
        })))}`);
        
        // CRITICAL: Sort scenes by frame_start (most reliable) or start_time
        scenes = scenes.sort((a, b) => {
          const aStart = a.frame_start || (a.start_time * 10 + 1) || 1;
          const bStart = b.frame_start || (b.start_time * 10 + 1) || 1;
          return aStart - bStart;
        });
        
        console.log(`[analyze-video-scenes] Scenes after sorting: ${scenes.map(s => `${s.id}:frame${s.frame_start}-${s.frame_end}`).join(', ')}`);
        
        // Validate and fix timestamps using frame numbers
        scenes = scenes.map((scene, index) => {
          // If frame_start/frame_end are provided, use them to calculate times
          let fixedStartTime: number;
          let fixedEndTime: number;
          
          if (scene.frame_start !== undefined && scene.frame_start !== null) {
            // Calculate time from frame number: time = (frame - 1) * 0.1
            const FRAME_INTERVAL = 0.1;
            const calculatedStartTime = Math.round((scene.frame_start - 1) * FRAME_INTERVAL * 10) / 10;
            
            // Check if AI's start_time matches the calculated value
            if (scene.start_time !== undefined && Math.abs(scene.start_time - calculatedStartTime) > 0.2) {
              console.warn(`[analyze-video-scenes] Scene ${scene.id}: start_time mismatch! AI said ${scene.start_time}s but frame_start=${scene.frame_start} suggests ${calculatedStartTime}s. Using frame-based time.`);
            }
            
            fixedStartTime = calculatedStartTime;
          } else {
            // Fallback to AI's start_time (no rounding to 0.5s anymore)
            fixedStartTime = Math.round((scene.start_time || 0) * 10) / 10;
          }
          
          if (scene.frame_end !== undefined && scene.frame_end !== null) {
            // Calculate time from frame number
            const FRAME_INTERVAL = 0.1;
            const calculatedEndTime = Math.round((scene.frame_end - 1) * FRAME_INTERVAL * 10) / 10;
            
            if (scene.end_time !== undefined && Math.abs(scene.end_time - calculatedEndTime) > 0.2) {
              console.warn(`[analyze-video-scenes] Scene ${scene.id}: end_time mismatch! AI said ${scene.end_time}s but frame_end=${scene.frame_end} suggests ${calculatedEndTime}s. Using frame-based time.`);
            }
            
            fixedEndTime = calculatedEndTime;
          } else {
            fixedEndTime = Math.round((scene.end_time || videoDuration) * 10) / 10;
          }
          
          // Boundary corrections: First scene at 0, last scene at videoDuration
          if (index === 0 && fixedStartTime !== 0) {
            console.log(`[analyze-video-scenes] Fixing scene 1 start from ${fixedStartTime} to 0`);
            fixedStartTime = 0;
          }
          if (index === scenes.length - 1) {
            fixedEndTime = videoDuration;
          }
          
          // Safety: end_time must be after start_time
          if (fixedEndTime <= fixedStartTime) {
            fixedEndTime = fixedStartTime + 2;
          }
          
          const mood = scene.mood || "neutral";
          // Ensure we always have 2 effects per scene
          let effects = Array.isArray(scene.suggested_effects) && scene.suggested_effects.length > 0 
            ? scene.suggested_effects 
            : [];
          
          // If AI didn't provide enough effects, generate defaults based on mood
          if (effects.length < 2) {
            effects = generateDefaultEffectsForMood(mood);
          }
          
          return {
            id: `scene-${index + 1}`,
            start_time: fixedStartTime,
            end_time: fixedEndTime,
            // CRITICAL: Set original_* fields for time remapping support
            original_start_time: fixedStartTime,
            original_end_time: fixedEndTime,
            playbackRate: 1.0,
            description: scene.description || `Szene ${index + 1}`,
            mood: mood,
            suggested_effects: effects,
            ai_suggestions: Array.isArray(scene.ai_suggestions) && scene.ai_suggestions.length > 0 
              ? scene.ai_suggestions 
              : ["Farbkorrektur empfohlen", "Leichte Kontrastverstärkung"],
          };
        });
        
      // Stabilize scenes: merge micro-scenes and cap max count
      scenes = stabilizeScenes(scenes, videoDuration);
      
      console.log(`[analyze-video-scenes] Final stabilized scenes: ${scenes.map(s => `${s.id}:${s.start_time}-${s.end_time}s "${s.description?.substring(0, 40)}..."`).join(', ')}`);
        
      } catch (parseError) {
        console.error("[analyze-video-scenes] Parse error:", parseError);
        scenes = generateFallbackScenes(videoDuration);
      }

      console.log(`[analyze-video-scenes] Vision analysis returned ${scenes.length} scenes`);

      return new Response(
        JSON.stringify({ scenes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No client-side frames — send video URL directly to Gemini Vision for analysis
    console.log("[analyze-video-scenes] No client-side frames, sending video_url directly to Vision AI");

    const videoAnalysisPrompt = `Du bist ein präziser Video-Schnitt-Analyst. Analysiere dieses Video und identifiziere die exakten Schnittpunkte.

KRITISCHE ANWEISUNG:
- Beschreibe was du TATSÄCHLICH im Video siehst
- Szenen in CHRONOLOGISCHER REIHENFOLGE
- Beschreibungen MAXIMAL 50 Zeichen
- Erwarte 2-5 Szenen für ein ${videoDuration}s Video

JSON FORMAT für jede Szene:
{
  "id": "scene-1",
  "start_time": number (Sekunden),
  "end_time": number (Sekunden),
  "description": "string (MAXIMAL 50 Zeichen! Beschreibe was du siehst)",
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
- Antworte NUR mit einem validen JSON-Array!`;

    // Build user content with video URL for Gemini Vision
    const userContent: any[] = [
      {
        type: "text",
        text: `Analysiere dieses ${videoDuration}-sekündige Video und finde die Schnittpunkte. Beschreibe was du in jeder Szene TATSÄCHLICH siehst. Antworte NUR mit dem JSON-Array!`
      },
      {
        type: "image_url",
        image_url: {
          url: video_url,
        }
      }
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
        temperature: 0.4,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[analyze-video-scenes] AI API error:", response.status, errorText);
      
      return new Response(
        JSON.stringify({ scenes: generateFallbackScenes(videoDuration) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("[analyze-video-scenes] AI response:", content.substring(0, 500));

    let scenes: SceneAnalysis[];
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      
      scenes = JSON.parse(cleanContent.trim());
      
      if (!Array.isArray(scenes)) {
        throw new Error("Response is not an array");
      }
      
      // Sort by start_time and normalize
      scenes = scenes
        .sort((a, b) => (a.start_time || 0) - (b.start_time || 0))
        .map((scene, index) => ({
          id: `scene-${index + 1}`,
          start_time: scene.start_time || 0,
          end_time: scene.end_time || videoDuration,
          // CRITICAL: Set original_* fields
          original_start_time: scene.start_time || 0,
          original_end_time: scene.end_time || videoDuration,
          playbackRate: 1.0,
          description: scene.description || `Szene ${index + 1}`,
          mood: scene.mood || "neutral",
          suggested_effects: scene.suggested_effects || [],
          ai_suggestions: scene.ai_suggestions || [],
        }));
      
      // Stabilize scenes: merge micro-scenes and cap max count
      scenes = stabilizeScenes(scenes, videoDuration);
      
    } catch (parseError) {
      console.error("[analyze-video-scenes] Parse error:", parseError);
      scenes = generateFallbackScenes(videoDuration);
    }

    console.log(`[analyze-video-scenes] Returning ${scenes.length} scenes`);

    return new Response(
      JSON.stringify({ scenes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-video-scenes] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Generate default effects based on scene mood
function generateDefaultEffectsForMood(mood: string): { type: string; name: string; reason: string; confidence: number }[] {
  const moodEffects: Record<string, { type: string; name: string; reason: string; confidence: number }[]> = {
    dynamic: [
      { type: "filter", name: "vibrant", reason: "Verstärkt dynamische Energie", confidence: 0.85 },
      { type: "color", name: "saturation-130", reason: "Lebendige Farben für Dynamik", confidence: 0.8 }
    ],
    calm: [
      { type: "filter", name: "muted", reason: "Ruhige, gedämpfte Stimmung", confidence: 0.85 },
      { type: "color", name: "brightness-105", reason: "Sanfte Aufhellung", confidence: 0.8 }
    ],
    energetic: [
      { type: "filter", name: "highkey", reason: "Helle, energiegeladene Optik", confidence: 0.85 },
      { type: "color", name: "contrast-120", reason: "Verstärkter Kontrast für Energie", confidence: 0.8 }
    ],
    emotional: [
      { type: "filter", name: "cinematic", reason: "Filmische Tiefe für Emotion", confidence: 0.85 },
      { type: "color", name: "saturation-90", reason: "Leicht reduzierte Farben", confidence: 0.8 }
    ],
    neutral: [
      { type: "filter", name: "cinematic", reason: "Professioneller Look", confidence: 0.8 },
      { type: "color", name: "contrast-110", reason: "Leicht erhöhter Kontrast", confidence: 0.75 }
    ]
  };
  
  return moodEffects[mood] || moodEffects.neutral;
}

// Stabilize scenes: merge micro-scenes (<1.5s) and cap max count based on video length
function stabilizeScenes(scenes: any[], videoDuration: number): any[] {
  if (scenes.length <= 1) return scenes;
  
  const MIN_SCENE_DURATION = 1.5; // seconds
  const MAX_SCENES_PER_10S = 2; // max 2 scenes per 10 seconds of video
  const maxScenes = Math.max(2, Math.ceil(videoDuration / 10 * MAX_SCENES_PER_10S));
  
  // Step 1: Merge micro-scenes into their neighbors
  let stabilized: any[] = [];
  for (const scene of scenes) {
    const duration = (scene.end_time || 0) - (scene.start_time || 0);
    if (duration < MIN_SCENE_DURATION && stabilized.length > 0) {
      // Merge into previous scene
      const prev = stabilized[stabilized.length - 1];
      prev.end_time = scene.end_time;
      prev.original_end_time = scene.original_end_time ?? scene.end_time;
      // Keep the longer description
      if ((scene.description || '').length > (prev.description || '').length) {
        prev.description = scene.description;
      }
      console.log(`[stabilizeScenes] Merged micro-scene (${duration.toFixed(1)}s) into previous`);
    } else {
      stabilized.push({ ...scene });
    }
  }
  
  // Step 2: If still too many scenes, merge shortest ones
  while (stabilized.length > maxScenes) {
    // Find the shortest scene (not first or last)
    let shortestIdx = -1;
    let shortestDur = Infinity;
    for (let i = 1; i < stabilized.length - 1; i++) {
      const dur = stabilized[i].end_time - stabilized[i].start_time;
      if (dur < shortestDur) {
        shortestDur = dur;
        shortestIdx = i;
      }
    }
    if (shortestIdx < 0) break;
    
    // Merge into previous
    stabilized[shortestIdx - 1].end_time = stabilized[shortestIdx].end_time;
    stabilized[shortestIdx - 1].original_end_time = stabilized[shortestIdx].original_end_time;
    stabilized.splice(shortestIdx, 1);
    console.log(`[stabilizeScenes] Reduced scene count to ${stabilized.length} (merged shortest)`);
  }
  
  // Re-index
  stabilized = stabilized.map((s, i) => ({
    ...s,
    id: `scene-${i + 1}`,
  }));
  
  console.log(`[stabilizeScenes] Final: ${stabilized.length} scenes (max allowed: ${maxScenes})`);
  return stabilized;
}

function generateFallbackScenes(duration: number): SceneAnalysis[] {
  // More scenes for short videos: 15-30s gets 3 scenes instead of 2
  const sceneCount = duration < 15 ? 2 : duration < 30 ? 3 : duration < 60 ? 4 : 5;
  const sceneDuration = duration / sceneCount;
  
  const moods = ["dynamic", "calm", "energetic", "neutral"];
  
  return Array.from({ length: sceneCount }, (_, i) => {
    const startTime = Math.round(i * sceneDuration);
    const endTime = Math.round((i + 1) * sceneDuration);
    const mood = moods[i % moods.length];
    
    return {
      id: `scene-${i + 1}`,
      start_time: startTime,
      end_time: endTime,
      // CRITICAL: Set original_* fields
      original_start_time: startTime,
      original_end_time: endTime,
      playbackRate: 1.0,
      description: i === 0 ? "Eröffnung" : i === sceneCount - 1 ? "Abschluss" : `Szene ${i + 1}`,
      mood: mood,
      suggested_effects: generateDefaultEffectsForMood(mood),
      ai_suggestions: [
        "Farbkorrektur für besseren Kontrast",
        "Leichte Schärfung empfohlen",
      ],
    };
  });
}
