/**
 * extract-subtitle-keywords — Lovable AI Gateway (Gemini Flash, structured output).
 * Input:  { subtitles: [{ id, text }] }
 * Output: { results: [{ id, keywords: string[] }] }
 *
 * Used by Director's Cut "Hormozi Caption" mode to decide which 1–3 power-words
 * per subtitle line get the highlight box. Falls back to empty arrays on error
 * so the renderer always has a safe shape.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible';
import { generateText, Output } from 'npm:ai';
import { z } from 'npm:zod';

const ReqSchema = z.object({
  subtitles: z
    .array(z.object({ id: z.string(), text: z.string().min(1).max(600) }))
    .min(1)
    .max(80),
  language: z.string().max(8).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'missing_lovable_api_key' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: z.infer<typeof ReqSchema>;
  try {
    body = ReqSchema.parse(await req.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid_payload', details: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const provider = createOpenAICompatible({
    name: 'lovable',
    baseURL: 'https://ai.gateway.lovable.dev/v1',
    headers: { 'Lovable-API-Key': key },
  });

  const lang = body.language ?? 'de';
  const numbered = body.subtitles.map((s, i) => `${i + 1}. ${s.text}`).join('\n');

  try {
    const { output } = await generateText({
      model: provider('google/gemini-3-flash-preview'),
      output: Output.object({
        schema: z.object({
          items: z
            .array(
              z.object({
                index: z.number().int().min(1),
                keywords: z.array(z.string()).max(3),
              }),
            )
            .max(80),
        }),
      }),
      prompt: [
        `You are a Hormozi-style caption keyword extractor. For each line below, pick 1 to 3 POWER WORDS that should be visually highlighted in a short-form vertical ad.`,
        `Pick nouns, numbers, emotional triggers, brand names, or punchlines. Skip filler words. Keep keywords EXACTLY as they appear in the source line (same case, same form).`,
        `Language: ${lang}. Return items in the same numbering as the input.`,
        ``,
        numbered,
      ].join('\n'),
    });

    const map = new Map<number, string[]>();
    for (const it of output.items ?? []) {
      map.set(it.index, (it.keywords ?? []).filter((k) => k && k.length > 0).slice(0, 3));
    }
    const results = body.subtitles.map((s, i) => ({
      id: s.id,
      keywords: map.get(i + 1) ?? [],
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const status = e?.statusCode === 402 ? 402 : e?.statusCode === 429 ? 429 : 500;
    return new Response(
      JSON.stringify({
        error: status === 402 ? 'credits_exhausted' : status === 429 ? 'rate_limited' : 'extraction_failed',
        message: String(e?.message ?? e),
        results: body.subtitles.map((s) => ({ id: s.id, keywords: [] as string[] })),
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
