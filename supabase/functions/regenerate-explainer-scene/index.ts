import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { briefing, sceneType, sceneIndex, previousScene, nextScene, currentDuration } = await req.json();

    if (!briefing || !sceneType) {
      throw new Error('Missing required parameters: briefing and sceneType');
    }

    const sceneTypePrompts: Record<string, string> = {
      'hook': 'Ein aufmerksamkeitsstarker Einstieg, der das Publikum sofort fesselt. Beginne mit einer überraschenden Frage, Statistik oder Aussage.',
      'problem': 'Zeige das Problem/die Herausforderung der Zielgruppe. Lass sie sich verstanden fühlen. Verwende emotionale Sprache.',
      'solution': 'Präsentiere das Produkt/die Lösung als Antwort auf das Problem. Zeige den Nutzen, nicht nur Features.',
      'feature': 'Erkläre wichtige Features oder Vorteile. Mache abstrakte Konzepte greifbar mit konkreten Beispielen.',
      'proof': 'Liefere Beweise: Testimonials, Statistiken, Erfolgsgeschichten. Baue Vertrauen auf.',
      'cta': 'Klarer Call-to-Action. Sage genau, was das Publikum als nächstes tun soll. Erzeuge Dringlichkeit.'
    };

    const systemPrompt = `Du bist ein professioneller Drehbuchautor für Erklärvideos im Stil von Loft-Film.
Dein Stil: ${briefing.tone}, Zielgruppe: ${briefing.targetAudience.join(', ')}.
Sprache: ${briefing.language === 'de' ? 'Deutsch' : briefing.language === 'en' ? 'Englisch' : briefing.language}.

Regeln:
- Schreibe natürlich und authentisch
- Keine Marketing-Floskeln
- Konkret und bildlich
- Passend zur Gesamtlänge von ca. ${currentDuration} Sekunden`;

    const contextInfo = [];
    if (previousScene) {
      contextInfo.push(`Vorherige Szene: "${previousScene.spokenText.slice(0, 100)}..."`);
    }
    if (nextScene) {
      contextInfo.push(`Nächste Szene: "${nextScene.spokenText.slice(0, 100)}..."`);
    }

    const userPrompt = `Regeneriere die Szene vom Typ "${sceneType}" für dieses Produkt:
${briefing.productDescription}

${sceneTypePrompts[sceneType] || 'Erstelle eine informative Szene.'}

${contextInfo.length > 0 ? `Kontext:\n${contextInfo.join('\n')}` : ''}

Antworte im JSON-Format:
{
  "voiceover": "Der gesprochene Text für diese Szene (ca. ${Math.floor(currentDuration * 2.5)} Wörter)",
  "visualDescription": "Detaillierte Beschreibung der visuellen Darstellung für die KI-Bildgenerierung",
  "mood": "Die emotionale Stimmung (z.B. aufgeregt, nachdenklich, optimistisch)",
  "keyElements": ["Element1", "Element2", "Element3"]
}`;

    console.log('Regenerating scene:', sceneType, 'for index:', sceneIndex);

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
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from AI response');
    }

    const scene = JSON.parse(jsonMatch[0]);

    console.log('Scene regenerated successfully');

    return new Response(JSON.stringify({ scene }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in regenerate-explainer-scene:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
