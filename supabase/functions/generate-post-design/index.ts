import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface DesignCopy {
  headline: string;
  subline: string;
  cta: string;
  badge: string;
  variants: { name: string; headline: string; subline: string }[];
  caption: string;
  hashtags: string[];
  imagePrompt: string;
}

const SYSTEM = `Du bist Art Director und Werbetexter für Social-Media-Bildposts.
Du lieferst kurze, verkaufsstarke Copy für ein quadratisches Bild-Design.
Regeln:
- Headline maximal 6 Wörter, darf einen Zeilenumbruch (\\n) enthalten.
- Subline maximal 12 Wörter, ein Satz.
- CTA maximal 3 Wörter.
- Badge maximal 2 Wörter (z.B. "Neu", "Nur heute").
- Keine Emojis in Headline/Badge/CTA. Keine Anführungszeichen um die Texte.
- Sprache exakt wie angefragt.
- Liefere 8 Varianten mit unterschiedlicher Tonalität und Blickwinkel (z.B. Bold Statement, Editorial, Split Layout, Minimal Overlay, Angebot, Frage, Beweis, Ankündigung). Jede Variante braucht einen kurzen deutschen Namen.
- Zusätzlich: imagePrompt — ein englischer Bild-Prompt (max. 60 Wörter) für ein fotorealistisches, werbetaugliches Hintergrundmotiv zum Briefing.
  Der Prompt muss ruhige, texttaugliche Negativflächen enthalten ("generous empty negative space in the lower third", "clean uncluttered background") und darf KEINEN Text, keine Buchstaben, Logos oder Wasserzeichen im Bild erzeugen ("no text, no letters, no logo, no watermark").`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) {
      return new Response(JSON.stringify({ error: 'AI nicht konfiguriert' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const brief = String(body?.brief ?? '').slice(0, 2000);
    const language = String(body?.language ?? 'de');
    const platform = String(body?.platform ?? 'instagram');
    const tone = String(body?.tone ?? 'selbstbewusst, klar');
    const brandName = String(body?.brandName ?? '').slice(0, 120);

    if (!brief.trim()) {
      return new Response(JSON.stringify({ error: 'Briefing fehlt' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-3.6-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Briefing: ${brief}\nPlattform: ${platform}\nTonalität: ${tone}\nSprache: ${language}\nMarke: ${brandName || 'unbenannt'}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'post_copy',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                headline: { type: 'string' },
                subline: { type: 'string' },
                cta: { type: 'string' },
                badge: { type: 'string' },
                caption: { type: 'string' },
                hashtags: { type: 'array', items: { type: 'string' } },
                imagePrompt: { type: 'string' },
                variants: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      headline: { type: 'string' },
                      subline: { type: 'string' },
                    },
                    required: ['name', 'headline', 'subline'],
                  },
                },
              },
              required: ['headline', 'subline', 'cta', 'badge', 'caption', 'hashtags', 'imagePrompt', 'variants'],
            },
          },
        },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'Zu viele Anfragen — bitte kurz warten.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'AI-Guthaben aufgebraucht.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: `AI-Fehler: ${text.slice(0, 300)}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await response.json();
    const raw = json?.choices?.[0]?.message?.content ?? '{}';
    let copy: DesignCopy;
    try {
      copy = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: 'AI-Antwort nicht lesbar' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, copy }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
