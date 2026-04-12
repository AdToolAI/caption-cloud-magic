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

    const toneMappings: Record<string, Record<string, string>> = {
      de: {
        friendly: 'Freundlich: Warmherzig, einladend, persönlich',
        professional: 'Professionell: Sachlich, klar, kompetent',
        energetic: 'Energetisch: Dynamisch, motivierend, begeistert'
      },
      en: {
        friendly: 'Friendly: Warm, inviting, personal',
        professional: 'Professional: Factual, clear, competent',
        energetic: 'Energetic: Dynamic, motivating, enthusiastic'
      },
      es: {
        friendly: 'Amigable: Cálido, acogedor, personal',
        professional: 'Profesional: Objetivo, claro, competente',
        energetic: 'Enérgico: Dinámico, motivador, entusiasta'
      }
    };

    const toneMapping = toneMappings[language] || toneMappings.de;

    const systemPrompts: Record<string, string> = {
      de: `Du bist ein Experte für Voice-over-Texte und natürliche Sprechtexte.

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

Ton-Anpassung: ${toneMapping[tone as string] || toneMapping.friendly}

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
}`,

      en: `You are an expert in voice-over scripts and natural speaking texts.

Your task:
- Transform simple ideas into natural, easy-to-speak texts
- Write as if someone is speaking directly to the camera
- Avoid complicated words or long nested sentences
- NO visual descriptions (no "You can see...", "In the image...")
- Only what is spoken
- Optimal length: 150-160 words per minute
- Natural pauses through punctuation
- Direct address ("you", not "one")
- Target speaking duration: ${targetDuration} seconds

Tone adjustment: ${toneMapping[tone as string] || toneMapping.friendly}

Examples:

Input: "Tutorial about Social Media Marketing"
Output: "Social media marketing can feel overwhelming. But don't worry! Today I'm showing you the three most important basics. First: Know your target audience. Second: Create content consistently. And third: Engage with your community. That's it! With these three steps, you're building a solid foundation."

Input: "Product introduction of a fitness app"
Output: "Hey! Today I'm introducing you to my favorite fitness app. It doesn't just track your workouts, it also gives you personalized training plans. The best part? The app adapts to your progress. You get stronger, the exercises get more challenging. That's how you stay motivated and reach your goals!"

Create a natural speaking script that corresponds to approximately ${targetDuration} seconds of speaking time (about ${Math.floor(targetDuration * 2.5)} words).

Reply in JSON format:
{
  "script": "your natural speaking text here",
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}`,

      es: `Eres un experto en guiones de voice-over y textos naturales para hablar.

Tu tarea:
- Transforma ideas simples en textos naturales y fáciles de hablar
- Escribe como si alguien hablara directamente a la cámara
- Evita palabras complicadas o frases largas y anidadas
- SIN descripciones visuales (nada de "Se ve...", "En la imagen...")
- Solo lo que se habla
- Longitud óptima: 150-160 palabras por minuto
- Pausas naturales mediante puntuación
- Dirección directa ("tú", no "uno")
- Duración objetivo: ${targetDuration} segundos

Ajuste de tono: ${toneMapping[tone as string] || toneMapping.friendly}

Ejemplos:

Input: "Tutorial sobre marketing en redes sociales"
Output: "El marketing en redes sociales puede parecer abrumador. ¡Pero no te preocupes! Hoy te muestro los tres fundamentos más importantes. Primero: Conoce a tu audiencia. Segundo: Crea contenido de forma consistente. Y tercero: Interactúa con tu comunidad. ¡Eso es todo! Con estos tres pasos estás construyendo una base sólida."

Input: "Presentación de una app de fitness"
Output: "¡Hola! Hoy te presento mi app de fitness favorita. No solo rastrea tus entrenamientos, sino que también te da planes de entrenamiento personalizados. ¿Lo mejor? La app se adapta a tu progreso. Te vuelves más fuerte, los ejercicios se vuelven más desafiantes. Así te mantienes motivado y alcanzas tus metas."

Crea un guión natural que corresponda a aproximadamente ${targetDuration} segundos de tiempo de habla (aproximadamente ${Math.floor(targetDuration * 2.5)} palabras).

Responde en formato JSON:
{
  "script": "tu texto natural para hablar aquí",
  "tips": ["Consejo 1", "Consejo 2", "Consejo 3"]
}`,
    };

    const systemPrompt = systemPrompts[language] || systemPrompts.de;

    const userPrompts: Record<string, string> = {
      de: `Erstelle einen Voice-over-Text für: "${idea}"`,
      en: `Create a voice-over script for: "${idea}"`,
      es: `Crea un guión de voice-over para: "${idea}"`,
    };
    const userPrompt = userPrompts[language] || userPrompts.de;

    console.log('Calling Lovable AI for script generation...', { language, tone });
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
    const estimatedDuration = Math.round(wordCount / 2.5); // ~150 words/minute = 2.5 words/second

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
