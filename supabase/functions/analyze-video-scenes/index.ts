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

      const systemPrompt = `Du bist ein präziser Video-Schnitt-Analyst. Deine Aufgabe ist es, EXAKTE Schnittpunkte zu identifizieren.

FRAME-ZEITSTEMPEL:
${frames.length} Frames wurden alle 0.5 Sekunden extrahiert:
Frame 1 = 0.0s, Frame 2 = 0.5s, Frame 3 = 1.0s, Frame 4 = 1.5s, Frame 5 = 2.0s, usw.

KRITISCHE ANWEISUNG - FRAME-FÜR-FRAME VERGLEICH:
1. Schaue Frame 1 an, dann Frame 2. SIND SIE VISUELL UNTERSCHIEDLICH?
2. Schaue Frame 2 an, dann Frame 3. SIND SIE VISUELL UNTERSCHIEDLICH?
3. Wiederhole für ALLE ${frames.length} Frames!

WAS IST EIN SCHNITT (neue Szene)?
- Deutlicher Wechsel des Kamerawinkels
- Anderes Hauptobjekt/Produkt im Fokus
- Sprung in der Position/Perspektive
- Wechsel von Nahaufnahme zu Totale oder umgekehrt
- Komplett andere Beleuchtung/Hintergrund

WAS IST KEIN SCHNITT (gleiche Szene)?
- Leichte Kamerabewegung
- Gleiche Perspektive mit kleiner Änderung
- Objekt bewegt sich minimal
- Nur Beleuchtung ändert sich leicht

SZENENGRENZE BERECHNUNG:
Wenn Frame N und Frame N+1 UNTERSCHIEDLICH sind:
→ Schnitt passiert bei (N - 1) × 0.5 Sekunden
→ Szene endet bei diesem Zeitpunkt
→ Nächste Szene beginnt bei diesem Zeitpunkt

BEISPIEL für 20 Sekunden Video mit 40 Frames:
- Frames 1-7 (0s-3s): Gleich → Szene 1
- Frame 8 (3.5s): ANDERS als Frame 7 → SCHNITT bei 3.0s
- Frames 8-18 (3.5s-8.5s): Gleich → Szene 2
- Frame 19 (9s): ANDERS als Frame 18 → SCHNITT bei 8.5s
usw.

REGELN:
- Erste Szene startet IMMER bei 0.0s
- Letzte Szene endet IMMER bei ${videoDuration}s
- Szenenzeiten müssen auf 0.5s genau sein!
- Erwarte 2-5 Szenen für ein ${videoDuration}s Video

JSON FORMAT für jede Szene:
{
  "id": "scene-1",
  "start_time": number (GENAU bei Frame-Grenze auf 0.5s),
  "end_time": number (GENAU bei Frame-Grenze auf 0.5s),
  "description": "Was ist in dieser Szene zu sehen",
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

SCHRITT-FÜR-SCHRITT ANALYSE:

1. Frame 1 → Frame 2: Visuell gleich oder SCHNITT?
2. Frame 2 → Frame 3: Visuell gleich oder SCHNITT?
3. Frame 3 → Frame 4: Visuell gleich oder SCHNITT?
... und so weiter für alle ${frames.length} Frames!

Wenn du einen SCHNITT zwischen Frame N und Frame N+1 erkennst:
→ Szene endet bei (N - 1) × 0.5 Sekunden
→ Neue Szene beginnt bei (N - 1) × 0.5 Sekunden

BEISPIEL:
- Frames 1-7 ähnlich (Produkt Frontansicht) → Szene 1: 0.0s - 3.0s
- Frame 8 anders (Produkt Seitenansicht) → Szene 2 beginnt bei 3.0s
- Frames 8-14 ähnlich → Szene 2: 3.0s - 6.5s
- Frame 15 anders → Szene 3 beginnt bei 6.5s

WICHTIG: Gib die EXAKTEN Schnittpunkte zurück, die du bei deiner Frame-für-Frame Analyse gefunden hast!

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
        
        // Validate timestamps - TRUST AI-detected times, only fix boundaries
        scenes = scenes.map((scene, index) => {
          // AI-erkannte Zeiten beibehalten (auf 0.5s gerundet)
          let fixedStartTime = Math.round((scene.start_time || 0) * 2) / 2;
          let fixedEndTime = Math.round((scene.end_time || videoDuration) * 2) / 2;
          
          // NUR Randkorrektur: Erste Szene bei 0, letzte bei videoDuration
          if (index === 0 && fixedStartTime !== 0) {
            console.log(`[analyze-video-scenes] Fixing scene 1 start from ${fixedStartTime} to 0`);
            fixedStartTime = 0;
          }
          if (index === scenes.length - 1 && fixedEndTime !== videoDuration) {
            console.log(`[analyze-video-scenes] Fixing last scene end from ${fixedEndTime} to ${videoDuration}`);
            fixedEndTime = videoDuration;
          }
          
          // Sicherheit: end_time muss nach start_time sein
          if (fixedEndTime <= fixedStartTime) {
            fixedEndTime = fixedStartTime + 2;
          }
          
          return {
            id: `scene-${index + 1}`,
            start_time: fixedStartTime,
            end_time: fixedEndTime,
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
