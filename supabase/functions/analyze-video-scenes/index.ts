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
    const { video_url, duration } = await req.json();

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

    console.log(`[analyze-video-scenes] Analyzing video: ${video_url}, duration: ${videoDuration}s`);

    // Use Lovable AI to analyze the video conceptually
    const systemPrompt = `Du bist ein professioneller Video-Editor und Regisseur. Analysiere das folgende Video basierend auf seiner Dauer und erstelle eine Szenenstruktur mit Verbesserungsvorschlägen.

Für jede Szene gib an:
- Zeitbereich (start_time, end_time in Sekunden)
- Beschreibung der Szene (kurz und prägnant)
- Stimmung (mood): "dynamic", "calm", "energetic", "emotional", "neutral"
- Vorgeschlagene Effekte mit Begründung
- KI-Empfehlungen zur Verbesserung

Antworte NUR mit einem validen JSON-Array von Szenen. Keine zusätzlichen Erklärungen.`;

    const userPrompt = `Analysiere ein Video mit einer Dauer von ${videoDuration} Sekunden und erstelle eine professionelle Szenenanalyse.

Teile das Video in 3-6 logische Szenen auf, je nach Gesamtdauer:
- Videos unter 30s: 2-3 Szenen
- Videos 30-60s: 3-4 Szenen
- Videos über 60s: 4-6 Szenen

WICHTIG für suggested_effects:
- Für type "filter" verwende NUR diese Namen: cinematic, vintage, noir, warm, cool, vibrant, muted, highkey, lowkey
- Für type "color" verwende: brightness-110, contrast-115, saturation-120, vignette-40
- Für type "transition" verwende: fade-in, fade-out, crossfade (diese werden ignoriert für visuelle Effekte)

Für jede Szene erstelle ein Objekt mit dieser exakten Struktur:
{
  "id": "unique-id",
  "start_time": number,
  "end_time": number,
  "description": "Kurze Beschreibung",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    {
      "type": "filter|color|transition|speed|crop",
      "name": "exakter-effekt-name",
      "reason": "Begründung",
      "confidence": 0.0-1.0
    }
  ],
  "ai_suggestions": ["Verbesserungsvorschlag 1", "Vorschlag 2"]
}

Gib NUR das JSON-Array zurück, ohne Markdown-Formatierung.`;

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
      
      // Return fallback scenes if AI fails
      return new Response(
        JSON.stringify({ scenes: generateFallbackScenes(videoDuration) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("[analyze-video-scenes] AI response:", content.substring(0, 500));

    // Parse AI response
    let scenes: SceneAnalysis[];
    try {
      // Remove markdown code blocks if present
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
      
      // Validate structure
      if (!Array.isArray(scenes)) {
        throw new Error("Response is not an array");
      }
      
      // Ensure all required fields exist
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
