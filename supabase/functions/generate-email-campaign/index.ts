const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock',
};

interface RequestBody {
  briefing: string;
  goal?: string;
  tonality?: string;
  language?: string;
  variantCount?: number;
  subjectCount?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const body: RequestBody = await req.json();
    const {
      briefing,
      goal = '',
      tonality = 'professional',
      language = 'en',
      variantCount = 2,
      subjectCount = 4,
    } = body;

    if (!briefing || briefing.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Briefing too short (min 10 chars)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const langName = language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English';

    const systemPrompt = `You are an expert email marketing copywriter. Generate compelling A/B-test ready email campaigns. ALL output MUST be in ${langName}. Return ONLY structured data via the provided tool — no prose.`;

    const userPrompt = `Briefing: ${briefing}
Campaign goal: ${goal || 'Drive engagement'}
Tonality: ${tonality}
Language: ${langName}

Generate ${subjectCount} A/B subject line variants (concise, <60 chars, varied angles: curiosity, value, urgency, personal) and ${variantCount} full email body variants. Each body should have:
- Plain text version (3-5 short paragraphs, conversational)
- Simple HTML version (single column, inline styles, max-width 600px, white background, NO unsubscribe footer, NO links to images)
- A descriptive label (e.g. "Story-driven", "Direct value")
- A primary CTA text

Make each variant meaningfully different in approach.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'emit_email_campaign',
              description: 'Emit structured email campaign with subjects and body variants',
              parameters: {
                type: 'object',
                properties: {
                  subjects: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        angle: { type: 'string' },
                      },
                      required: ['text', 'angle'],
                    },
                  },
                  variants: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        plain: { type: 'string' },
                        html: { type: 'string' },
                        cta: { type: 'string' },
                      },
                      required: ['label', 'plain', 'html', 'cta'],
                    },
                  },
                },
                required: ['subjects', 'variants'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'emit_email_campaign' } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again shortly.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'AI credits exhausted. Add funds in Settings → Workspace → Usage.' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: 'No structured output from AI' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-email-campaign error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
