import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneAnalysis {
  id: string;
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
      
      // Frames sind alle 0.5 Sekunden extrahiert
      const frameTimings = frames.map((_: string, i: number) => {
        const time = (i * 0.5).toFixed(1);
        return `Frame ${i + 1}: Sekunde ${time}`;
      }).join('\n');

      const systemPrompt = `Du bist ein professioneller Video-Analyst. Dir werden ${frames.length} Frames gezeigt.

KRITISCH: Die Frames sind alle 0.5 SEKUNDEN extrahiert!
Frame 1 = 0.0s, Frame 2 = 0.5s, Frame 3 = 1.0s, Frame 4 = 1.5s, usw.

FRAME-FÜR-FRAME ANALYSE:
1. Vergleiche JEDEN Frame mit dem VORHERIGEN Frame
2. Wenn der Inhalt GLEICH ist → Szene läuft weiter
3. Wenn der Inhalt ANDERS ist → NEUE Szene beginnt GENAU bei diesem Frame!

SZENEN-GRENZEN BERECHNEN:
- Wenn Frame 1-6 gleich sind und Frame 7 anders ist:
  → Szene 1: 0.0s - 3.0s (Frames 1-6, da Frame 7 bei 3.0s ist)
  → Szene 2: 3.0s - ... (ab Frame 7)
- Die Szenengrenze ist bei (Frame-Nummer - 1) × 0.5 Sekunden!

SIGNIFIKANTE ÄNDERUNGEN (neue Szene):
- Komplett anderes Produkt/Objekt
- Deutlich anderer Kamerawinkel
- Andere Umgebung/Beleuchtung
- Klarer Schnitt

REGELN:
- Szene 1 startet bei 0
- Letzte Szene endet bei ${videoDuration}
- Keine Lücken, keine Überlappungen
- Erwarte 2-5 Szenen für ${videoDuration}s Video

Für jede Szene:
{
  "id": "scene-1",
  "start_time": number (GENAU bei Frame-Grenze!),
  "end_time": number,
  "description": "Präzise Beschreibung",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant", "reason": "...", "confidence": 0.8 },
    { "type": "color", "name": "brightness-110|contrast-115|saturation-120", "reason": "...", "confidence": 0.8 }
  ],
  "ai_suggestions": ["Vorschlag 1", "Vorschlag 2"]
}

Antworte NUR mit einem validen JSON-Array!`;

      const userContent: any[] = [
        { 
          type: "text", 
          text: `FRAME-ZEITSTEMPEL (alle 0.5 Sekunden):
${frameTimings}

AUFGABE:
1. Schaue Frame 1 an → Szene 1 beginnt bei 0.0s
2. Schaue Frame 2 an → Gleich wie Frame 1? Dann gehört es zu Szene 1
3. Schaue Frame 3 an → Gleich oder anders?
4. Wenn anders → NEUE Szene beginnt bei (Frame-Nummer - 1) × 0.5s

Beispiel: Wenn Frame 7 (bei 3.0s) ANDERS ist als Frame 6:
→ Szene 1 endet bei 3.0s
→ Szene 2 beginnt bei 3.0s

KRITISCH: Szenenzeiten müssen GENAU zu den Frame-Zeitstempeln passen!` 
        }
      ];

      // Add frames as images
      for (const frame of frames) {
        userContent.push({
          type: "image_url",
          image_url: { 
            url: frame,
            detail: "low"
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
        
        // CRITICAL: Sort scenes chronologically by start_time
        scenes = scenes.sort((a, b) => (a.start_time || 0) - (b.start_time || 0));
        
        console.log(`[analyze-video-scenes] Scenes before validation: ${scenes.map(s => `${s.id}:${s.start_time}-${s.end_time}`).join(', ')}`);
        
        // Validate and fix timestamps to ensure no gaps/overlaps
        let lastEndTime = 0;
        scenes = scenes.map((scene, index) => {
          let fixedStartTime = scene.start_time || 0;
          let fixedEndTime = scene.end_time || videoDuration;
          
          // First scene MUST start at 0
          if (index === 0) {
            fixedStartTime = 0;
          } else {
            // No gaps - start_time = previous end_time
            fixedStartTime = lastEndTime;
          }
          
          // Ensure end_time is after start_time
          if (fixedEndTime <= fixedStartTime) {
            fixedEndTime = fixedStartTime + (videoDuration / scenes.length);
          }
          
          // Last scene MUST end at video duration
          if (index === scenes.length - 1) {
            fixedEndTime = videoDuration;
          }
          
          lastEndTime = fixedEndTime;
          
          return {
            id: `scene-${index + 1}`, // Fix scene ID to ensure chronological naming
            start_time: Math.round(fixedStartTime * 10) / 10,
            end_time: Math.round(fixedEndTime * 10) / 10,
            description: scene.description || `Szene ${index + 1}`,
            mood: scene.mood || "neutral",
            suggested_effects: Array.isArray(scene.suggested_effects) ? scene.suggested_effects : [],
            ai_suggestions: Array.isArray(scene.ai_suggestions) ? scene.ai_suggestions : [],
          };
        });
        
        console.log(`[analyze-video-scenes] Scenes after validation: ${scenes.map(s => `${s.id}:${s.start_time}-${s.end_time} "${s.description.substring(0, 30)}..."`).join(', ')}`);
        
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

    // Fallback: No frames provided - use text-only analysis (less accurate)
    console.log("[analyze-video-scenes] No frames provided, using fallback text analysis");
    
    const systemPrompt = `Du bist ein professioneller Video-Editor. Erstelle eine hypothetische Szenenstruktur für ein Video.

Antworte NUR mit einem validen JSON-Array von Szenen. Keine zusätzlichen Erklärungen.`;

    const userPrompt = `Erstelle eine Szenenstruktur für ein ${videoDuration}-sekündiges Video.

Teile das Video in 3-5 logische Szenen auf.

Für jede Szene erstelle ein Objekt mit:
{
  "id": "scene-X",
  "start_time": number,
  "end_time": number,
  "description": "Generische Beschreibung",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    { "type": "filter", "name": "cinematic", "reason": "Begründung", "confidence": 0.8 }
  ],
  "ai_suggestions": ["Vorschlag"]
}`;

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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
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
      
      scenes = scenes.map((scene, index) => ({
        id: scene.id || `scene-${index + 1}`,
        start_time: scene.start_time || 0,
        end_time: scene.end_time || videoDuration,
        description: scene.description || `Szene ${index + 1}`,
        mood: scene.mood || "neutral",
        suggested_effects: scene.suggested_effects || [],
        ai_suggestions: scene.ai_suggestions || [],
      }));
      
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

function generateFallbackScenes(duration: number): SceneAnalysis[] {
  const sceneCount = duration < 30 ? 2 : duration < 60 ? 3 : 4;
  const sceneDuration = duration / sceneCount;
  
  const moods = ["dynamic", "calm", "energetic", "neutral"];
  const filters = ["cinematic", "vibrant", "warm", "cool"];
  
  return Array.from({ length: sceneCount }, (_, i) => ({
    id: `scene-${i + 1}`,
    start_time: Math.round(i * sceneDuration),
    end_time: Math.round((i + 1) * sceneDuration),
    description: i === 0 ? "Eröffnung" : i === sceneCount - 1 ? "Abschluss" : `Szene ${i + 1}`,
    mood: moods[i % moods.length],
    suggested_effects: [
      {
        type: "filter",
        name: filters[i % filters.length],
        reason: "Verbessert die visuelle Qualität",
        confidence: 0.75 + Math.random() * 0.2,
      },
    ],
    ai_suggestions: [
      "Farbkorrektur für besseren Kontrast",
      "Leichte Schärfung empfohlen",
    ],
  }));
}
