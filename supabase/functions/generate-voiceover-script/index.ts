import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, targetDuration = 30, tone = 'friendly', language = 'de' } = await req.json();

    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'idea is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const toneMapping = {
      friendly: 'Freundlich: Warmherzig, einladend, persönlich',
      professional: 'Professionell: Sachlich, klar, kompetent',
      energetic: 'Energetisch: Dynamisch, motivierend, begeistert'
    };

    const systemPrompt = `Du bist ein Experte für Voice-over-Texte und natürliche Sprechtexte.

Deine Aufgabe:
- Verwandle einfache Ideen in natürliche, gut sprechbare Texte
- Schreibe so, als würde jemand direkt zur Kamera sprechen
- Vermeide komplizierte Wörter oder lange Schachtelsätze
- KEINE visuellen Beschreibungen (kein "Man sieht...", "Im Bild...")
- Nur das, was gesprochen wird
- Optimale Länge: 150-160 Wörter pro Minute
- Natürliche Pausen durch Satzzeichen
- Direkte Ansprache ("Du", nicht "Man")
- Ziel-Sprechdauer: ${targetDuration} Sekunden

Ton-Anpassung: ${toneMapping[tone as keyof typeof toneMapping] || toneMapping.friendly}

Beispiele:

Input: "Tutorial über Social Media Marketing"
Output: "Social Media Marketing kann überwältigend sein. Aber keine Sorge! Ich zeige dir heute die drei wichtigsten Grundlagen. Erstens: Kenne deine Zielgruppe. Zweitens: Erstelle konsistent Content. Und drittens: Interagiere mit deiner Community. Das war's schon! Mit diesen drei Schritten legst du ein solides Fundament."

Input: "Produktvorstellung einer Fitness-App"
Output: "Hey! Ich stelle dir heute meine liebste Fitness-App vor. Sie trackt nicht nur deine Workouts, sondern gibt dir auch personalisierte Trainingspläne. Das Beste? Die App passt sich deinem Fortschritt an. Du wirst stärker, die Übungen werden anspruchsvoller. So bleibst du motiviert und erreichst deine Ziele!"

Erstelle einen natürlichen Sprechtext der etwa ${targetDuration} Sekunden Sprechzeit entspricht (ca. ${Math.floor(targetDuration * 2.5)} Wörter).

Antworte im JSON-Format:
{
  "script": "dein natürlicher Sprechtext hier",
  "tips": ["Tipp 1", "Tipp 2", "Tipp 3"]
}`;

    const userPrompt = `Erstelle einen Voice-over-Text für: "${idea}"`;

    console.log('Calling Lovable AI for script generation...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    console.log('AI response received');

    // Parse JSON response
    let parsedResult;
    try {
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : aiContent;
      parsedResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('Failed to parse AI response');
    }

    const script = parsedResult.script;
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.round(wordCount / 2.5); // ~150 Wörter/Minute = 2.5 Wörter/Sekunde

    return new Response(
      JSON.stringify({
        script,
        wordCount,
        estimatedDuration,
        tips: parsedResult.tips || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-voiceover-script:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate script' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
