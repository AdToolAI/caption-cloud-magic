// supabase/functions/generate-image-prompt/index.ts
//
// Universal Prompt-Helper for the Picture Studio (and reusable for any
// image/video studio later). Takes a free-text user wish (+ optional
// reference image + optional filters) and returns a model-optimised
// English master prompt, alternatives, and a recommended model/mode/strength.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PictureMode = 'create' | 'transform' | 'restyle';
type QualityTier = 'standard' | 'fast' | 'pro' | 'ultra';

interface Body {
  userText: string;
  referenceImageUrl?: string | null;
  currentMode?: PictureMode;
  currentTier?: QualityTier;
  filters?: {
    goal?: string;       // e.g. "Werbung", "Portrait"
    style?: string;      // e.g. "Fotorealistisch"
    mood?: string;       // e.g. "Episch"
  };
}

interface Output {
  masterPrompt: string;
  alternatives: string[];
  recommendedTier: QualityTier;
  recommendedMode: PictureMode;
  recommendedStrength: number; // 0..100, only meaningful for transform
  reasoning: string;
  /** Short list of things the helper sees in the reference image */
  referenceSummary?: string;
}

const SYSTEM_PROMPT = `You are an elite prompt engineer for AI image generators.
You serve users of "Picture Studio" — a multi-model image tool. Your job:
turn a user's casual wish (any language) into ONE excellent English master prompt
plus 2 shorter alternatives, and recommend the best model/mode/strength.

Models available (with strengths):
- standard = Gemini 2.5 Flash Image (free, fast drafts, weak at photo-real i2i)
- fast = Seedream 4 (stylised scenes, mood-boards)
- pro = Imagen 4 Ultra (BEST for text→image hero shots, WEAK at i2i with many subjects)
- ultra = Nano Banana 2 (BEST for i2i, restyle, photo-realism, preserving composition)

Modes:
- create = pure text → image (no reference)
- transform = reference image is the SCENE TEMPLATE; preserve composition & subjects, change style/details
- restyle = reference image only donates colour palette + mood for a NEW subject

When a reference image is provided AND the user wants the same scene rendered differently:
- recommend mode = "transform"
- recommend tier = "ultra" (Nano Banana 2)
- recommend strength = 30..50 (low strength = stays close to reference)
- IN THE PROMPT, explicitly list what to preserve (subjects, composition, lighting, background)

When the user wants a fresh image inspired by a reference style:
- recommend mode = "restyle", tier = "ultra" or "fast", strength = 70

When no reference is provided:
- recommend mode = "create", tier = "pro" (Imagen 4 Ultra) for photo-real heroes,
  or "standard"/"fast" for drafts.

Master-prompt structure (English only):
"[Subject] + [Composition / what to preserve from reference if any] +
 [Style: photorealistic/cinematic/illustration/etc.] + [Lighting] +
 [Camera/Lens: e.g. 85mm, shallow DoF] + [Detail level] + [Negative hints if helpful]"

Keep the master prompt 60-120 words, alternatives 20-40 words each.
Return ONLY via the tool call — no plain text.`;

function buildUserMessage(body: Body): unknown[] {
  const filterLines = body.filters
    ? Object.entries(body.filters)
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : '';

  const parts: any[] = [
    {
      type: 'text',
      text: [
        `User wish (any language, translate yourself):\n"${body.userText.trim()}"`,
        body.currentMode ? `\nCurrent UI mode: ${body.currentMode}` : '',
        body.currentTier ? `\nCurrent UI tier: ${body.currentTier}` : '',
        filterLines ? `\nOptional filters:\n${filterLines}` : '',
        body.referenceImageUrl
          ? '\nA reference image is attached. Analyse it: list main subjects, composition, lighting, location, dominant colours. Use this in your master prompt to preserve composition.'
          : '\nNo reference image attached.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  if (body.referenceImageUrl) {
    parts.push({
      type: 'image_url',
      image_url: { url: body.referenceImageUrl },
    });
  }

  return parts;
}

const TOOL_DEF = {
  type: 'function',
  function: {
    name: 'emit_prompt_plan',
    description: 'Return the optimised master prompt and recommendations.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        masterPrompt: { type: 'string', description: '60-120 word English master prompt.' },
        alternatives: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 2,
          description: 'Two shorter (20-40 word) alternative prompts.',
        },
        recommendedTier: { type: 'string', enum: ['standard', 'fast', 'pro', 'ultra'] },
        recommendedMode: { type: 'string', enum: ['create', 'transform', 'restyle'] },
        recommendedStrength: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: '0 = stay near reference, 100 = ignore reference. Only meaningful for transform.',
        },
        reasoning: { type: 'string', description: 'One short sentence in German explaining the choice.' },
        referenceSummary: {
          type: 'string',
          description: 'If a reference image was given, one sentence summarising what is in it. Otherwise empty.',
        },
      },
      required: [
        'masterPrompt',
        'alternatives',
        'recommendedTier',
        'recommendedMode',
        'recommendedStrength',
        'reasoning',
      ],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth — require logged-in user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.userText || !body.userText.trim()) {
      return new Response(JSON.stringify({ error: 'userText is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(body) },
        ],
        tools: [TOOL_DEF],
        tool_choice: { type: 'function', function: { name: 'emit_prompt_plan' } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text().catch(() => '');
      console.error('[generate-image-prompt] AI gateway error', aiResp.status, txt);
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI-Guthaben aufgebraucht. Bitte aufladen.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte gleich nochmal versuchen.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error('[generate-image-prompt] no tool call in response', JSON.stringify(aiData).slice(0, 500));
      throw new Error('AI returned no structured output');
    }

    let parsed: Output;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      throw new Error('AI returned malformed JSON');
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-image-prompt] error', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
