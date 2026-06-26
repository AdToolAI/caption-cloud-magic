// generate-scene-dialog
// Generates a multi-speaker screenplay-style dialog for a single composer scene
// using Lovable AI Gateway (Gemini 2.5 Flash).
//
// Body:
//   { language: 'de'|'en'|'es',
//     sceneContext: string,
//     durationSeconds: number,
//     cast: [{ id, name, appearance }] }
//
// Returns: { script: "Sarah: ...\nMatthew: ..." }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LANG_LABEL: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "generate-scene-dialog" });

  try {
    const { language = 'en', sceneContext = '', durationSeconds = 6, cast = [] } =
      await req.json();
    if (!Array.isArray(cast) || cast.length < 1) {
      return new Response(
        JSON.stringify({ error: 'Need at least 1 cast member' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Word budget — natural speech ≈ 2.5 words per second across all speakers.
    const wordBudget = Math.max(8, Math.round(durationSeconds * 2.5));
    const langName = LANG_LABEL[language] ?? 'English';
    const isMonologue = cast.length === 1;

    const castSummary = cast
      .map(
        (c: { name: string; appearance?: string }) =>
          `- ${c.name}${c.appearance ? ` (${c.appearance})` : ''}`,
      )
      .join('\n');

    const sys = isMonologue
      ? `You are a screenwriter for short-form video. Write a natural-sounding monologue spoken DIRECTLY to camera by the single character below, in ${langName}. Strict format — every line begins with the character name:
NAME: text

Rules:
- Use ONLY the exact character name provided (case-insensitive).
- 1 to 2 blocks total, all using the SAME name.
- Total ~${wordBudget} words across all blocks.
- Concise, conversational, on-topic, addressed to the viewer. No stage directions, no parentheticals, no quotes.
- Output ONLY the script lines, nothing else.`
      : `You are a screenwriter for short-form video. Write a natural-sounding dialog between the listed characters in ${langName}. Strict format — one block per line:
NAME: text

Rules:
- Use ONLY the exact character names provided (case-insensitive match).
- 2 to ${Math.max(2, Math.ceil(durationSeconds / 2))} blocks total.
- Total ~${wordBudget} words across all blocks.
- Concise, conversational, on-topic. No stage directions, no parentheticals, no quotes.
- Output ONLY the script lines, nothing else.`;

    const user = `Scene context: ${sceneContext || '(open-ended)'}\n\nCast:\n${castSummary}\n\nWrite the ${isMonologue ? 'monologue' : 'dialog'} now.`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      const status = resp.status === 429 || resp.status === 402 ? resp.status : 502;
      return new Response(
        JSON.stringify({
          error:
            resp.status === 429
              ? 'Rate limited — try again in a moment.'
              : resp.status === 402
              ? 'AI credits exhausted — please top up Lovable AI usage.'
              : `AI gateway error: ${t}`,
        }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await resp.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    // Keep only lines matching "NAME: text"
    const cleaned = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.-]{0,40}\s*:\s*\S/.test(l))
      .join('\n');

    return new Response(JSON.stringify({ script: cleaned || raw.trim() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-scene-dialog error', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
