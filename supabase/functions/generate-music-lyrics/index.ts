import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LyricsRequest {
  prompt: string;       // theme / topic
  genre?: string;
  mood?: string;
  language?: 'en' | 'de' | 'es';
}

const LANG_INSTRUCTION: Record<string, string> = {
  en: 'Write the lyrics in English.',
  de: 'Schreibe den Songtext auf Deutsch.',
  es: 'Escribe la letra en español.',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI Gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json() as LyricsRequest;
    const { prompt, genre, mood, language = 'en' } = body;

    if (!prompt?.trim() || prompt.length > 300) {
      return new Response(JSON.stringify({ error: "Prompt is required (max 300 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const systemMsg = `You are a professional songwriter. ${LANG_INSTRUCTION[language] || LANG_INSTRUCTION.en}
Write a short, singable song with this exact structure (no intro text, no commentary):

[Verse 1]
(4 lines)

[Chorus]
(4 lines, catchy + repeatable hook)

[Verse 2]
(4 lines)

[Chorus]
(repeat the same chorus)

[Bridge]
(2 lines, emotional twist)

[Chorus]
(repeat)

Keep lines short (max ~8 words). Make it memorable. No explanations, just the lyrics with the bracketed section markers.`;

    const userMsg = [
      `Theme: ${prompt.trim()}`,
      genre && genre !== 'any' ? `Genre: ${genre}` : null,
      mood ? `Mood: ${mood}` : null,
    ].filter(Boolean).join('\n');

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[generate-music-lyrics] AI error:', aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please retry shortly.", code: "RATE_LIMIT" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings.", code: "AI_CREDITS_EXHAUSTED" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: `AI lyrics generation failed (${aiRes.status})` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await aiRes.json();
    const lyrics = data?.choices?.[0]?.message?.content?.trim() || '';

    if (!lyrics) {
      return new Response(JSON.stringify({ error: "No lyrics returned" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true, lyrics }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[generate-music-lyrics] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
