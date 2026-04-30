import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

// Average natural narration speed: ~150 words per minute = 2.5 words/second.
const WORDS_PER_SECOND = 2.5;

interface SceneInput {
  order: number;
  durationSeconds: number;
  description?: string;
  sceneType?: string;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      idea,
      targetDuration = 30,
      tone = 'friendly',
      language = 'de',
      mode = 'from_idea',
      scenes,
    } = body as {
      idea?: string;
      targetDuration?: number;
      tone?: string;
      language?: string;
      mode?: 'from_idea' | 'from_scenes';
      scenes?: SceneInput[];
    };

    const hasScenes = Array.isArray(scenes) && scenes.length > 0;

    if (!hasScenes && !idea) {
      return new Response(
        JSON.stringify({ error: 'idea is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // ── Compute per-scene word budgets when scenes are present ──────────
    const sortedScenes = hasScenes
      ? [...scenes!].sort((a, b) => a.order - b.order).map((s, idx) => ({
          ...s,
          order: typeof s.order === 'number' ? s.order : idx,
          durationSeconds: Math.max(0.5, Number(s.durationSeconds) || 0),
        }))
      : [];

    const sceneBudgets = sortedScenes.map((s) => ({
      order: s.order,
      durationSeconds: s.durationSeconds,
      targetWords: clamp(Math.round(s.durationSeconds * WORDS_PER_SECOND), 4, 80),
      description: s.description,
      sceneType: s.sceneType,
    }));

    const sceneTotalDuration = sceneBudgets.reduce((a, s) => a + s.durationSeconds, 0);

    // Effective target: if scenes are present, derive from their total minus the outro buffer.
    const OUTRO_BUFFER = 2.5;
    const targetSec = hasScenes
      ? Math.max(5, Math.round(sceneTotalDuration - OUTRO_BUFFER))
      : Math.max(5, Math.round(Number(targetDuration) || 30));

    const idealWords = hasScenes
      ? sceneBudgets.reduce((a, s) => a + s.targetWords, 0)
      : Math.round(targetSec * WORDS_PER_SECOND);
    const minWords = hasScenes
      ? Math.max(8, Math.round(idealWords * 0.85))
      : Math.max(8, Math.round(targetSec * 2.3));
    const maxWords = hasScenes
      ? Math.round(idealWords * 1.15)
      : Math.round(targetSec * 2.7);

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
    const tm = toneMapping[tone as string] || toneMapping.friendly;

    // ── Scene table for the prompt ──────────────────────────────────────
    const buildSceneTable = (lang: string) => {
      const header = lang === 'en'
        ? 'Storyboard scenes (the script MUST follow this order, hook in scene 1, CTA / resolution in the last scene):'
        : lang === 'es'
        ? 'Escenas del guion gráfico (el guion DEBE seguir este orden, gancho en la escena 1, CTA / resolución en la última):'
        : 'Storyboard-Szenen (das Skript MUSS diese Reihenfolge einhalten, Hook in Szene 1, CTA / Auflösung in der letzten Szene):';
      const rows = sceneBudgets.map((s, i) => {
        const num = i + 1;
        const desc = s.description ? ` — ${s.description.slice(0, 140)}` : '';
        const type = s.sceneType ? ` [${s.sceneType}]` : '';
        return lang === 'en'
          ? `Scene ${num}${type}: ${s.durationSeconds.toFixed(1)}s → ~${s.targetWords} words${desc}`
          : lang === 'es'
          ? `Escena ${num}${type}: ${s.durationSeconds.toFixed(1)}s → ~${s.targetWords} palabras${desc}`
          : `Szene ${num}${type}: ${s.durationSeconds.toFixed(1)}s → ~${s.targetWords} Wörter${desc}`;
      });
      return [header, ...rows].join('\n');
    };

    const buildSceneRules = (lang: string) => {
      if (lang === 'en') {
        return `SCENE-MATCHING RULES (critical):
- Write ONE single, flowing voice-over script that tells a coherent story across all scenes.
- Stick to each scene's word budget (±15%). Total: ${minWords}–${maxWords} words.
- Mark each scene transition in your output with the literal token [[scene:N]] (N = 0-indexed scene order from the table; e.g. [[scene:0]] before scene 1 text). These tokens are stripped before TTS — they only structure the output.
- Begin with [[scene:${sceneBudgets[0].order}]] before the first sentence.
- Hook in scene 1, build/explain in middle scenes, CTA or resolution in the LAST scene.
- Do NOT describe what is visible on screen — only the spoken words.`;
      }
      if (lang === 'es') {
        return `REGLAS DE ALINEACIÓN CON ESCENAS (críticas):
- Escribe UN único guion fluido que cuente una historia coherente a través de todas las escenas.
- Respeta el presupuesto de palabras de cada escena (±15%). Total: ${minWords}–${maxWords} palabras.
- Marca cada transición de escena con el token literal [[scene:N]] (N = orden de escena de la tabla, indexado desde 0; p. ej. [[scene:0]] antes del texto de la escena 1). Estos tokens se eliminan antes del TTS — solo estructuran la salida.
- Empieza con [[scene:${sceneBudgets[0].order}]] antes de la primera frase.
- Gancho en la escena 1, desarrollo/explicación en las escenas intermedias, CTA o resolución en la ÚLTIMA.
- NO describas lo que se ve en pantalla — solo lo que se dice.`;
      }
      return `SZENEN-ABSTIMMUNGS-REGELN (kritisch):
- Schreibe EINEN einzigen, flüssigen Voice-over-Text, der eine zusammenhängende Geschichte über alle Szenen hinweg erzählt.
- Halte das Wort-Budget jeder Szene ein (±15%). Gesamt: ${minWords}–${maxWords} Wörter.
- Markiere jeden Szenenwechsel im Output mit dem literalen Token [[scene:N]] (N = 0-basierter Szenen-Index aus der Tabelle; z. B. [[scene:0]] vor dem Text zu Szene 1). Diese Tokens werden vor dem TTS entfernt — sie strukturieren nur die Ausgabe.
- Beginne mit [[scene:${sceneBudgets[0].order}]] vor dem ersten Satz.
- Hook in Szene 1, Aufbau/Erklärung in den mittleren Szenen, CTA oder Auflösung in der LETZTEN Szene.
- Beschreibe NICHT, was auf dem Bildschirm zu sehen ist — nur was gesprochen wird.`;
    };

    const buildSystemPrompt = (lang: string): string => {
      const sceneSection = hasScenes
        ? `\n\n${buildSceneTable(lang)}\n\n${buildSceneRules(lang)}\n`
        : '';

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
- The script MUST contain between ${minWords} and ${maxWords} words.
${sceneSection}
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
- El guión DEBE contener entre ${minWords} y ${maxWords} palabras.
${sceneSection}
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
- Das Skript MUSS zwischen ${minWords} und ${maxWords} Wörter enthalten.
${sceneSection}
Ton-Anpassung: ${tm}

Gib deine Antwort über das bereitgestellte Tool zurück.`;
    };

    const systemPrompt = buildSystemPrompt(language);

    const effectiveIdea = (idea && idea.trim().length > 0)
      ? idea
      : (language === 'en'
          ? 'Tell a coherent story that matches the storyboard scenes.'
          : language === 'es'
          ? 'Cuenta una historia coherente que coincida con las escenas del guion gráfico.'
          : 'Erzähle eine zusammenhängende Geschichte, die zu den Storyboard-Szenen passt.');

    const userPrompts: Record<string, string> = {
      de: `Erstelle einen Voice-over-Text für: "${effectiveIdea}". Wortanzahl-Vorgabe: ${minWords}–${maxWords} Wörter (Ziel ${idealWords}).${hasScenes ? ' Halte dich strikt an die Szenen-Tabelle und füge die [[scene:N]] Marker ein.' : ''}`,
      en: `Create a voice-over script for: "${effectiveIdea}". Required word count: ${minWords}–${maxWords} words (target ${idealWords}).${hasScenes ? ' Strictly follow the scene table and insert [[scene:N]] markers.' : ''}`,
      es: `Crea un guión de voice-over para: "${effectiveIdea}". Recuento requerido: ${minWords}–${maxWords} palabras (objetivo ${idealWords}).${hasScenes ? ' Sigue estrictamente la tabla de escenas e inserta los marcadores [[scene:N]].' : ''}`,
    };
    const userPrompt = userPrompts[language] || userPrompts.de;

    const tools = [
      {
        type: "function",
        function: {
          name: "submit_voiceover_script",
          description: `Submit a voice-over script with ${minWords}-${maxWords} words. When scenes are provided, mark transitions with [[scene:N]].`,
          parameters: {
            type: "object",
            properties: {
              script: {
                type: "string",
                description: hasScenes
                  ? `The spoken voice-over text with [[scene:N]] markers between scenes. ${minWords}-${maxWords} words.`
                  : `The spoken voice-over text. MUST contain ${minWords}-${maxWords} words.`,
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
        if (aiResponse.status === 429) throw new Error('RATE_LIMIT');
        if (aiResponse.status === 402) throw new Error('PAYMENT_REQUIRED');
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
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

    console.log('Calling Lovable AI for script generation...', {
      language, tone, targetSec, minWords, maxWords, mode,
      sceneCount: hasScenes ? sceneBudgets.length : 0,
    });

    let parsedResult = await callModel(baseMessages);
    let rawScript: string = (parsedResult.script ?? '').trim();
    let wordCount = rawScript.replace(/\[\[scene:\d+\]\]/g, ' ').split(/\s+/).filter(Boolean).length;

    // Auto-retry once if too short
    const lowerBound = Math.round(minWords * 0.85);
    if (wordCount < lowerBound) {
      console.warn(`Script too short (${wordCount} words, need >=${minWords}). Retrying...`);
      const retryMessages = [
        ...baseMessages,
        { role: 'assistant', content: `Previous attempt: ${rawScript}` },
        {
          role: 'user',
          content:
            language === 'en'
              ? `Your script had only ${wordCount} words. It must be between ${minWords} and ${maxWords} words. Rewrite longer with more detail. Keep the [[scene:N]] structure.`
              : language === 'es'
              ? `Tu guión tuvo solo ${wordCount} palabras. Debe tener entre ${minWords} y ${maxWords}. Reescríbelo más largo. Mantén la estructura [[scene:N]].`
              : `Dein Skript hatte nur ${wordCount} Wörter. Es muss zwischen ${minWords} und ${maxWords} Wörter haben. Schreibe es länger. Behalte die [[scene:N]]-Struktur.`,
        },
      ];
      try {
        const retryResult = await callModel(retryMessages);
        const retryRaw: string = (retryResult.script ?? '').trim();
        const retryWords = retryRaw.replace(/\[\[scene:\d+\]\]/g, ' ').split(/\s+/).filter(Boolean).length;
        if (retryWords > wordCount) {
          parsedResult = retryResult;
          rawScript = retryRaw;
          wordCount = retryWords;
        }
      } catch (retryErr) {
        console.warn('Retry failed, keeping first attempt:', retryErr);
      }
    }

    // ── Extract per-scene scripts from [[scene:N]] markers ──────────────
    let sceneScripts: Array<{ order: number; text: string; words: number }> = [];
    if (hasScenes) {
      const markerRe = /\[\[scene:(\d+)\]\]/g;
      const matches: Array<{ order: number; index: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = markerRe.exec(rawScript)) !== null) {
        matches.push({ order: parseInt(m[1], 10), index: m.index });
      }
      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index + `[[scene:${matches[i].order}]]`.length;
          const end = i + 1 < matches.length ? matches[i + 1].index : rawScript.length;
          const text = rawScript.slice(start, end).trim();
          const words = text.split(/\s+/).filter(Boolean).length;
          sceneScripts.push({ order: matches[i].order, text, words });
        }
      } else {
        // Fallback: split proportionally to scene durations
        const cleanWords = rawScript.split(/\s+/).filter(Boolean);
        let cursor = 0;
        for (const s of sceneBudgets) {
          const take = Math.max(1, Math.round((s.durationSeconds / sceneTotalDuration) * cleanWords.length));
          const slice = cleanWords.slice(cursor, cursor + take);
          cursor += take;
          sceneScripts.push({ order: s.order, text: slice.join(' '), words: slice.length });
        }
      }
    }

    // Strip markers for the final spoken script
    const script = rawScript.replace(/\s*\[\[scene:\d+\]\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const finalWordCount = script.split(/\s+/).filter(Boolean).length;
    const estimatedDuration = Math.round(finalWordCount / WORDS_PER_SECOND);

    return new Response(
      JSON.stringify({
        script,
        wordCount: finalWordCount,
        estimatedDuration,
        targetDuration: targetSec,
        minWords,
        maxWords,
        tips: parsedResult.tips || [],
        sceneScripts,
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
