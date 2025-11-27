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
      
      const systemPrompt = `Du bist ein professioneller Video-Analyst. Dir werden Frames aus einem Video gezeigt.

WICHTIGE REGELN:
1. Beschreibe NUR was du TATSÄCHLICH in den Frames siehst - KEINE Erfindungen
2. Erkenne Produkte, Marken, Personen, Objekte, Text und Logos präzise
3. Identifiziere visuelle Übergänge zwischen Frames als Szenenänderungen
4. Zähle die ECHTE Anzahl unterschiedlicher Szenen basierend auf visuellen Änderungen
5. Schätze Zeitbereiche proportional zur Frame-Position

Für jede erkannte Szene erstelle ein Objekt mit:
- id: "scene-1", "scene-2", etc.
- start_time: Geschätzte Startzeit in Sekunden
- end_time: Geschätzte Endzeit in Sekunden  
- description: PRÄZISE Beschreibung des ECHTEN Inhalts (Produkte, Objekte, Personen)
- mood: "dynamic" | "calm" | "energetic" | "emotional" | "neutral"
- suggested_effects: Array mit MINDESTENS 2 Effekten pro Szene:
  { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant", "reason": "Begründung", "confidence": 0.7-1.0 }
  { "type": "color", "name": "brightness-110|contrast-115|saturation-120", "reason": "Begründung", "confidence": 0.7-1.0 }
- ai_suggestions: Array mit 1-2 spezifischen Verbesserungsvorschlägen

Antworte NUR mit einem validen JSON-Array ohne Markdown-Formatierung.`;

      const userContent: any[] = [
        { 
          type: "text", 
          text: `Analysiere dieses ${videoDuration}-sekündige Video anhand der folgenden ${frames.length} Frames.

Die Frames sind gleichmäßig über das Video verteilt:
${frames.map((_: string, i: number) => `- Frame ${i + 1}: ca. ${((i / frames.length) * videoDuration).toFixed(1)}s`).join('\n')}

Erkenne die TATSÄCHLICHEN Szenen, beschreibe den ECHTEN Inhalt und schlage passende Effekte vor.
Achte besonders auf: Produkte, Marken, Logos, Personen, Objekte, Farben, Beleuchtung.` 
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
        
        // Validate and normalize structure
        scenes = scenes.map((scene, index) => ({
          id: scene.id || `scene-${index + 1}`,
          start_time: Math.max(0, scene.start_time || 0),
          end_time: Math.min(videoDuration, scene.end_time || videoDuration),
          description: scene.description || `Szene ${index + 1}`,
          mood: scene.mood || "neutral",
          suggested_effects: Array.isArray(scene.suggested_effects) ? scene.suggested_effects : [],
          ai_suggestions: Array.isArray(scene.ai_suggestions) ? scene.ai_suggestions : [],
        }));
        
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
