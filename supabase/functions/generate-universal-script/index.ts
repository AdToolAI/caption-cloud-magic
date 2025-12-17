import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Storytelling structure templates
const STORYTELLING_STRUCTURES: Record<string, { name: string; structure: string[] }> = {
  '3-act': {
    name: '3-Akt-Struktur',
    structure: ['Einleitung/Setup', 'Hauptteil/Konflikt', 'Auflösung/Schluss']
  },
  'hero-journey': {
    name: 'Heldenreise',
    structure: ['Gewöhnliche Welt', 'Ruf zum Abenteuer', 'Weigerung', 'Mentor trifft Held', 'Überschreiten der Schwelle', 'Prüfungen', 'Tiefster Punkt', 'Belohnung', 'Rückkehr', 'Transformation']
  },
  'aida': {
    name: 'AIDA',
    structure: ['Attention (Aufmerksamkeit)', 'Interest (Interesse)', 'Desire (Verlangen)', 'Action (Handlung)']
  },
  'problem-solution': {
    name: 'Problem-Lösung',
    structure: ['Problem vorstellen', 'Schmerzpunkte vertiefen', 'Lösung präsentieren', 'Benefits zeigen', 'CTA']
  },
  'feature-showcase': {
    name: 'Feature-Showcase',
    structure: ['Einleitung', 'Feature 1', 'Feature 2', 'Feature 3', 'Zusammenfassung', 'CTA']
  },
  'testimonial-arc': {
    name: 'Testimonial-Arc',
    structure: ['Vorstellung der Person', 'Problem beschreiben', 'Entdeckung der Lösung', 'Transformation', 'Empfehlung']
  },
  'before-after': {
    name: 'Vorher-Nachher',
    structure: ['Situation vorher', 'Der Wendepunkt', 'Situation nachher', 'Wie es funktioniert', 'CTA']
  },
  'comparison': {
    name: 'Vergleich',
    structure: ['Einleitung', 'Option A vorstellen', 'Option B vorstellen', 'Direkter Vergleich', 'Gewinner/Empfehlung']
  },
  'list-format': {
    name: 'Listenformat',
    structure: ['Hook', 'Punkt 1', 'Punkt 2', 'Punkt 3', 'Punkt 4', 'Punkt 5', 'Zusammenfassung']
  },
  'hook-value-cta': {
    name: 'Hook-Value-CTA',
    structure: ['Starker Hook', 'Wert liefern', 'Mehr Wert', 'CTA']
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { briefing } = await req.json();
    
    if (!briefing) {
      throw new Error('Briefing is required');
    }

    console.log(`[generate-universal-script] Category: ${briefing.category}, Structure: ${briefing.storytellingStructure}`);

    const structure = STORYTELLING_STRUCTURES[briefing.storytellingStructure] || STORYTELLING_STRUCTURES['problem-solution'];
    const scenesCount = structure.structure.length;
    const sceneDuration = Math.floor(briefing.videoDuration / scenesCount);

    const systemPrompt = `Du bist ein erfahrener Drehbuchautor für professionelle Videos. Erstelle ein Drehbuch basierend auf dem Briefing.

STORYTELLING-STRUKTUR: ${structure.name}
SZENEN: ${structure.structure.join(' → ')}

REGELN:
1. Erstelle genau ${scenesCount} Szenen entsprechend der Struktur
2. Jede Szene hat ~${sceneDuration} Sekunden
3. Schreibe den Sprechertext (voiceover) für jede Szene
4. Beschreibe die visuelle Darstellung jeder Szene (für KI-Bildgenerierung)
5. Der Text muss natürlich klingen und zum Vorlesen geeignet sein
6. Keine Füllwörter wie "Also", "Ich habe", etc.

AUSGABEFORMAT (JSON):
{
  "title": "Videotitel",
  "totalDuration": ${briefing.videoDuration},
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "intro|problem|solution|feature|cta|etc",
      "title": "Szenen-Titel",
      "voiceover": "Der gesprochene Text für diese Szene...",
      "visualDescription": "Beschreibung des Bildes: Was sieht man? Welche Elemente? Welcher Stil?",
      "durationSeconds": ${sceneDuration},
      "transitionIn": "fade|slide|zoom|none",
      "transitionOut": "fade|slide|zoom|none"
    }
  ],
  "summary": "Kurze Zusammenfassung des Videos"
}`;

    const userPrompt = `Erstelle ein ${briefing.category}-Video-Drehbuch mit folgenden Informationen:

**Projekt:** ${briefing.projectName || 'Video-Projekt'}
**Unternehmen:** ${briefing.companyName || '-'}
**Produkt/Service:** ${briefing.productName || '-'}
**Beschreibung:** ${briefing.productDescription || '-'}

**Zielgruppe:** ${briefing.targetAudience || 'Allgemein'}
**Kernproblem:** ${briefing.coreProblem || '-'}
**Lösung:** ${briefing.solution || '-'}
**USPs:** ${briefing.uniqueSellingPoints?.join(', ') || '-'}

**Kernbotschaft:** ${briefing.keyMessage || '-'}
**Gewünschte Aktion:** ${briefing.desiredAction || '-'}
**CTA-Text:** ${briefing.ctaText || '-'}

**Visueller Stil:** ${briefing.visualStyle || 'modern-3d'}
**Emotionaler Ton:** ${briefing.emotionalTone || 'professionell'}
**Markenfarben:** ${briefing.brandColors?.join(', ') || 'Standard'}

**Videolänge:** ${briefing.videoDuration} Sekunden
**Format:** ${briefing.aspectRatio || '16:9'}

${briefing.hasCharacter ? `**Charakter:** ${briefing.characterName || 'Protagonist'} - ${briefing.characterDescription || 'Sympathische Figur'}` : ''}

**Zusätzliche Infos:** ${JSON.stringify(briefing.categorySpecific || {})}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-universal-script] AI error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No script content generated');
    }

    // Parse JSON from response
    let script;
    try {
      // Handle potential markdown code blocks
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/```\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      script = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('[generate-universal-script] JSON parse error:', parseError);
      throw new Error('Failed to parse script JSON');
    }

    // Add timing to scenes
    let currentTime = 0;
    script.scenes = script.scenes.map((scene: any, index: number) => {
      const sceneWithTiming = {
        ...scene,
        startTime: currentTime,
        endTime: currentTime + scene.durationSeconds,
      };
      currentTime += scene.durationSeconds;
      return sceneWithTiming;
    });

    console.log(`[generate-universal-script] Generated ${script.scenes.length} scenes, total ${currentTime}s`);

    return new Response(JSON.stringify({ script }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-universal-script] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
