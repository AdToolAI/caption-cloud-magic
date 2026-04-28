import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Average natural narration speed: ~150 words per minute = 2.5 words/second.
const WORDS_PER_SECOND = 2.5;

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

    // Hard word-count window (±10% around the natural speaking rate).
    const targetSec = Math.max(5, Math.round(Number(targetDuration) || 30));
    const idealWords = Math.round(targetSec * WORDS_PER_SECOND);
    const minWords = Math.max(8, Math.round(targetSec * 2.3));
    const maxWords = Math.round(targetSec * 2.7);

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

    const buildSystemPrompt = (lang: string): string => {
      const tm = toneMapping[tone as string] || toneMapping.friendly;
      if (lang === 'en') {
        return `You are an expert in voice-over scripts and natural speaking texts.

Your task:
- Transform simple ideas into natural, easy-to-speak texts
- Write as if someone is speaking directly to the camera
- Avoid complicated words or long nested sentences
- NO visual descriptions (no "You can see...", "In the image...")
- Only what is spoken
- Speaking rate ~150 words per minute (2.5 words/second)
- Direct address ("you", not "one")

CRITICAL LENGTH REQUIREMENT:
- Target speaking duration: ${targetSec} seconds
- Ideal word count: ~${idealWords} words
- The script MUST contain between ${minWords} and ${maxWords} words. Shorter or longer answers are NOT acceptable.
- Count your words carefully before responding. If you are below ${minWords} words, expand with relevant detail, examples, or a stronger call-to-action.

Tone: ${tm}

Return your answer through the provided tool.`;
      }
      if (lang === 'es') {
        return `Eres un experto en guiones de voice-over y textos naturales para hablar.

Tu tarea:
- Transforma ideas simples en textos naturales y fáciles de hablar
- Escribe como si alguien hablara directamente a la cámara
- Evita palabras complicadas o frases largas y anidadas
- SIN descripciones visuales (nada de "Se ve...", "En la imagen...")
- Solo lo que se habla
- Velocidad de habla ~150 palabras por minuto (2.5 palabras/segundo)
- Dirección directa ("tú", no "uno")

REQUISITO CRÍTICO DE LONGITUD:
- Duración objetivo: ${targetSec} segundos
- Recuento ideal de palabras: ~${idealWords} palabras
- El guión DEBE contener entre ${minWords} y ${maxWords} palabras. Respuestas más cortas o más largas NO son aceptables.
- Cuenta tus palabras cuidadosamente. Si estás por debajo de ${minWords}, amplía con detalles, ejemplos o una llamada a la acción más fuerte.

Tono: ${tm}

Devuelve tu respuesta mediante la herramienta proporcionada.`;
      }
      return `Du bist ein Experte für Voice-over-Texte und natürliche Sprechtexte.

Deine Aufgabe:
- Verwandle einfache Ideen in natürliche, gut sprechbare Texte
- Schreibe so, als würde jemand direkt zur Kamera sprechen
- Vermeide komplizierte Wörter oder lange Schachtelsätze
- KEINE visuellen Beschreibungen (kein "Man sieht...", "Im Bild...")
- Nur das, was gesprochen wird
- Sprechgeschwindigkeit ~150 Wörter pro Minute (2,5 Wörter/Sekunde)
- Direkte Ansprache ("Du", nicht "Man")

KRITISCHE LÄNGEN-VORGABE:
- Ziel-Sprechdauer: ${targetSec} Sekunden
- Ideale Wortanzahl: ~${idealWords} Wörter
- Das Skript MUSS zwischen ${minWords} und ${maxWords} Wörter enthalten. Kürzere oder längere Antworten sind NICHT akzeptabel.
- Zähle deine Wörter sorgfältig. Bist du unter ${minWords}, ergänze mit relevanten Details, Beispielen oder einem stärkeren Call-to-Action.

Ton-Anpassung: ${tm}

Gib deine Antwort über das bereitgestellte Tool zurück.`;
    };

    const systemPrompt = buildSystemPrompt(language);

    const userPrompts: Record<string, string> = {
      de: `Erstelle einen Voice-over-Text für: "${idea}". Wortanzahl-Vorgabe: ${minWords}–${maxWords} Wörter (Ziel ${idealWords}).`,
      en: `Create a voice-over script for: "${idea}". Required word count: ${minWords}–${maxWords} words (target ${idealWords}).`,
      es: `Crea un guión de voice-over para: "${idea}". Recuento requerido: ${minWords}–${maxWords} palabras (objetivo ${idealWords}).`,
    };
    const userPrompt = userPrompts[language] || userPrompts.de;

    const tools = [
      {
        type: "function",
        function: {
          name: "submit_voiceover_script",
          description: `Submit a voice-over script that contains exactly between ${minWords} and ${maxWords} words.`,
          parameters: {
            type: "object",
            properties: {
              script: {
                type: "string",
                description: `The spoken voice-over text. MUST contain ${minWords}–${maxWords} words.`,
              },
              tips: {
                type: "array",
                items: { type: "string" },
                description: "2-3 short recording tips.",
              },
            },
            required: ["script", "tips"],
            additionalProperties: false,
          },
        },
      },
    ];

    const callModel = async (messages: Array<{ role: string; content: string }>) => {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-pro',
          messages,
          tools,
          tool_choice: { type: "function", function: { name: "submit_voiceover_script" } },
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Lovable AI error:', aiResponse.status, errorText);
        if (aiResponse.status === 429) {
          throw new Error('RATE_LIMIT');
        }
        if (aiResponse.status === 402) {
          throw new Error('PAYMENT_REQUIRED');
        }
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        // Fallback: try to parse content as JSON
        const content = aiData.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : content;
        try {
          return JSON.parse(jsonText);
        } catch {
          throw new Error('Failed to parse AI response');
        }
      }
      try {
        return JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error('Failed to parse tool call arguments');
      }
    };

    const baseMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    console.log('Calling Lovable AI for script generation...', { language, tone, targetSec, minWords, maxWords });

    let parsedResult = await callModel(baseMessages);
    let script: string = (parsedResult.script ?? '').trim();
    let wordCount = script.split(/\s+/).filter(Boolean).length;

    // Auto-retry once if the script is too short.
    const lowerBound = Math.round(minWords * 0.85);
    if (wordCount < lowerBound) {
      console.warn(`Script too short (${wordCount} words, need ≥${minWords}). Retrying...`);
      const retryMessages = [
        ...baseMessages,
        {
          role: 'assistant',
          content: `Previous attempt: ${script}`,
        },
        {
          role: 'user',
          content:
            language === 'en'
              ? `Your script had only ${wordCount} words. It must be between ${minWords} and ${maxWords} words. Rewrite the script longer with more detail, examples, or a stronger call-to-action. Stay on topic.`
              : language === 'es'
              ? `Tu guión tuvo solo ${wordCount} palabras. Debe tener entre ${minWords} y ${maxWords} palabras. Reescríbelo más largo con más detalle, ejemplos o una llamada a la acción más fuerte.`
              : `Dein Skript hatte nur ${wordCount} Wörter. Es muss zwischen ${minWords} und ${maxWords} Wörter haben. Schreibe es länger mit mehr Details, Beispielen oder einem stärkeren Call-to-Action. Bleibe beim Thema.`,
        },
      ];
      try {
        const retryResult = await callModel(retryMessages);
        const retryScript: string = (retryResult.script ?? '').trim();
        const retryWordCount = retryScript.split(/\s+/).filter(Boolean).length;
        if (retryWordCount > wordCount) {
          parsedResult = retryResult;
          script = retryScript;
          wordCount = retryWordCount;
        }
      } catch (retryErr) {
        console.warn('Retry failed, keeping first attempt:', retryErr);
      }
    }

    const estimatedDuration = Math.round(wordCount / WORDS_PER_SECOND);

    return new Response(
      JSON.stringify({
        script,
        wordCount,
        estimatedDuration,
        targetDuration: targetSec,
        minWords,
        maxWords,
        tips: parsedResult.tips || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-voiceover-script:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate script';
    const status = message === 'RATE_LIMIT' ? 429 : message === 'PAYMENT_REQUIRED' ? 402 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
