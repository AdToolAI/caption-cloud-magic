import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScriptRequest {
  idea: string;
  targetDuration: 30 | 60 | 120;
  aspectRatio: string;
  tone?: string;
  language?: 'de' | 'en';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, targetDuration, aspectRatio, tone = 'professional', language = 'de' } = await req.json() as ScriptRequest;

    if (!idea) {
      return new Response(
        JSON.stringify({ error: "Idea is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sceneCount = Math.ceil(targetDuration / 12);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `Du bist ein professioneller Video-Skript-Autor für KI-generierte Videos.

WICHTIGE EINSCHRÄNKUNGEN:
- Jede Szene darf MAXIMAL 12 Sekunden lang sein (Sora 2 Limit)
- Du musst genau ${sceneCount} Szenen erstellen für ein ${targetDuration}-Sekunden Video
- Jede Szene braucht einen detaillierten visuellen Prompt für Sora 2

SORA 2 PROMPT-REGELN:
- Beschreibe in ENGLISCH für beste Ergebnisse
- Fokus auf: Kamerawinkel, Beleuchtung, Bewegung, Atmosphäre
- Vermeide: Text im Video, komplexe menschliche Aktionen, unrealistische Szenarien
- Gut: Naturszenen, Architektur, abstrakte Visualisierungen, einfache Bewegungen

AUSGABEFORMAT (JSON):
{
  "title": "Video-Titel",
  "synopsis": "Kurze Beschreibung des gesamten Videos",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 12,
      "visualPrompt": "Englischer Sora 2 Prompt mit visuellen Details...",
      "narration": "Was diese Szene vermittelt (${language === 'de' ? 'auf Deutsch' : 'in English'})",
      "suggestedTransition": "crossfade"
    }
  ],
  "totalDuration": ${targetDuration}
}

ÜBERGANGSOPTIONEN: none, fade, crossfade, slide, zoom, wipe

Ton: ${tone}
Seitenverhältnis: ${aspectRatio} (berücksichtige dies bei der visuellen Komposition)`;

    const userPrompt = `Erstelle ein ${targetDuration}-Sekunden Video-Skript basierend auf dieser Idee:

"${idea}"

Erstelle genau ${sceneCount} Szenen mit jeweils max. 12 Sekunden. 
Antworte NUR mit dem JSON-Objekt, keine zusätzlichen Erklärungen.`;

    console.log(`[Long-Form Script] Generating ${sceneCount} scenes for ${targetDuration}s video`);

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
      console.error("[Long-Form Script] AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse JSON from response (handle markdown code blocks)
    let scriptData;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      scriptData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("[Long-Form Script] JSON parse error:", parseError, "Content:", content);
      throw new Error("Failed to parse AI response as JSON");
    }

    // Validate and normalize scenes
    if (!scriptData.scenes || !Array.isArray(scriptData.scenes)) {
      throw new Error("Invalid script format: missing scenes array");
    }

    // Ensure each scene has valid duration (4, 8, or 12)
    scriptData.scenes = scriptData.scenes.map((scene: any, index: number) => ({
      sceneNumber: index + 1,
      duration: [4, 8, 12].includes(scene.duration) ? scene.duration : 12,
      visualPrompt: scene.visualPrompt || scene.prompt || "",
      narration: scene.narration || "",
      suggestedTransition: ['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe'].includes(scene.suggestedTransition) 
        ? scene.suggestedTransition 
        : 'crossfade',
    }));

    console.log(`[Long-Form Script] Generated ${scriptData.scenes.length} scenes`);

    return new Response(
      JSON.stringify(scriptData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Long-Form Script] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
