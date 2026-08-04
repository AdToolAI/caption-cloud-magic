import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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
    const coverHeadline = String(body?.headline ?? '').slice(0, 300);
    const brief = String(body?.brief ?? '').slice(0, 2000);
    const language = String(body?.language ?? 'de');
    const count = Math.min(8, Math.max(2, Number(body?.count ?? 4)));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-3.6-flash',
        messages: [
          {
            role: 'system',
            content: `Du schreibst Karussell-Posts für Social Media. Der erste Slide ist das Cover.
Liefere genau ${count} Folgeslides: inhaltliche Punkte, die das Cover-Versprechen einlösen, plus einen klaren Abschluss-CTA im letzten Slide.
Titel maximal 5 Wörter, Text maximal 18 Wörter. Keine Emojis. Sprache: ${language}.`,
          },
          { role: 'user', content: `Cover-Headline: ${coverHeadline}\nBriefing: ${brief}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'carousel_slides',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                slides: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { title: { type: 'string' }, text: { type: 'string' } },
                    required: ['title', 'text'],
                  },
                },
              },
              required: ['slides'],
            },
          },
        },
      }),
    });

    if (response.status === 429 || response.status === 402) {
      return new Response(
        JSON.stringify({ error: response.status === 429 ? 'Zu viele Anfragen — bitte kurz warten.' : 'AI-Guthaben aufgebraucht.' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: `AI-Fehler: ${text.slice(0, 300)}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await response.json();
    const parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? '{"slides":[]}');

    return new Response(JSON.stringify({ ok: true, slides: parsed.slides ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
