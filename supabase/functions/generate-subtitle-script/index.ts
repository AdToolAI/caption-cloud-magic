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
    const { idea, segments, tone, language } = await req.json();

    if (!idea || !segments || !Array.isArray(segments) || segments.length === 0) {
      return new Response(
        JSON.stringify({ error: 'idea and segments are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build segment info for the prompt
    const segmentDescriptions = segments.map((seg: { startTime: number; endTime: number }, i: number) => {
      const duration = (seg.endTime - seg.startTime).toFixed(1);
      const wordsEstimate = Math.max(1, Math.round((seg.endTime - seg.startTime) * 2.5)); // ~2.5 words/sec
      return `Segment ${i + 1}: ${duration}s (~${wordsEstimate} words)`;
    }).join('\n');

    const totalDuration = segments.reduce((sum: number, seg: { startTime: number; endTime: number }) => 
      sum + (seg.endTime - seg.startTime), 0
    ).toFixed(1);

    const toneMap: Record<string, Record<string, string>> = {
      friendly: { de: 'freundlich und nahbar', en: 'friendly and approachable', es: 'amigable y cercano' },
      professional: { de: 'professionell und seriös', en: 'professional and authoritative', es: 'profesional y serio' },
      energetic: { de: 'energetisch und begeisternd', en: 'energetic and exciting', es: 'enérgico y emocionante' },
    };

    const lang = language || 'de';
    const toneDesc = toneMap[tone]?.[lang] || toneMap.friendly[lang];

    const systemPrompts: Record<string, string> = {
      de: `Du bist ein Experte für Video-Skripte und Untertitel. Schreibe NUR das JSON-Array zurück, keine Erklärungen. Jedes Segment muss genau zur angegebenen Sprechzeit passen.`,
      en: `You are an expert for video scripts and subtitles. Return ONLY the JSON array, no explanations. Each segment must fit the specified speaking time exactly.`,
      es: `Eres un experto en guiones de video y subtítulos. Devuelve SOLO el array JSON, sin explicaciones. Cada segmento debe ajustarse exactamente al tiempo de habla indicado.`,
    };

    const userPrompts: Record<string, string> = {
      de: `Schreibe ein Skript zum Thema: "${idea}"

Ton: ${toneDesc}
Gesamtdauer: ${totalDuration} Sekunden
Anzahl Segmente: ${segments.length}

${segmentDescriptions}

Gib ein JSON-Array zurück mit genau ${segments.length} Strings, einem Text pro Segment.
Jeder Text muss zur Wortanzahl des jeweiligen Segments passen.
Format: ["Text für Segment 1", "Text für Segment 2", ...]`,
      en: `Write a script about: "${idea}"

Tone: ${toneDesc}
Total duration: ${totalDuration} seconds
Number of segments: ${segments.length}

${segmentDescriptions}

Return a JSON array with exactly ${segments.length} strings, one text per segment.
Each text must match the word count of its segment.
Format: ["Text for segment 1", "Text for segment 2", ...]`,
      es: `Escribe un guion sobre: "${idea}"

Tono: ${toneDesc}
Duración total: ${totalDuration} segundos
Número de segmentos: ${segments.length}

${segmentDescriptions}

Devuelve un array JSON con exactamente ${segments.length} strings, un texto por segmento.
Cada texto debe ajustarse al número de palabras de su segmento.
Formato: ["Texto del segmento 1", "Texto del segmento 2", ...]`,
    };

    console.log('Generating subtitle script:', { idea, segmentCount: segments.length, totalDuration, tone, language: lang });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompts[lang] || systemPrompts.de },
          { role: 'user', content: userPrompts[lang] || userPrompts.de },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit reached, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'No credits remaining.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices[0]?.message?.content || '[]';

    // Extract JSON array from response
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not parse AI response as JSON array');
    }

    const texts: string[] = JSON.parse(jsonMatch[0]);

    // Ensure we have exactly the right number of segments
    const result = segments.map((_: any, i: number) => texts[i] || '');

    return new Response(
      JSON.stringify({ texts: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-subtitle-script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
