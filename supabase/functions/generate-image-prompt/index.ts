// supabase/functions/generate-image-prompt/index.ts
//
// Universal Prompt-Helper for the Picture Studio. Takes a free-text user
// wish (+ optional reference image + optional filters + optional intent)
// and returns a model-optimised English master prompt, alternatives, and
// a recommended model/mode/strength.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PictureMode = 'create' | 'transform' | 'restyle';
type QualityTier = 'standard' | 'fast' | 'pro' | 'ultra';
type Intent = 'enhance' | 'freeform';

interface Body {
  userText: string;
  referenceImageUrl?: string | null;
  currentMode?: PictureMode;
  currentTier?: QualityTier;
  intent?: Intent;
  filters?: {
    goal?: string;
    style?: string;
    mood?: string;
  };
}

interface Output {
  masterPrompt: string;
  alternatives: string[];
  recommendedTier: QualityTier;
  recommendedMode: PictureMode;
  recommendedStrength: number;
  reasoning: string;
  referenceSummary?: string;
}

const BASE_SYSTEM_PROMPT = `You are an elite prompt engineer for AI image generators.
You serve users of "Picture Studio" — a multi-model image tool. Your job:
turn a user's casual wish (any language) into ONE excellent English master prompt
plus 2 shorter alternatives, and recommend the best model/mode/strength.

Models available (with strengths):
- standard = Gemini 2.5 Flash Image (free, fast drafts, weak at photo-real i2i)
- fast = Seedream 4 (stylised scenes, mood-boards, tolerant content filter)
- pro = Imagen 4 Ultra (BEST for text→image hero shots, WEAK at i2i with many subjects)
- ultra = Nano Banana 2 (BEST for i2i, restyle, photo-realism, preserving composition)

Modes:
- create = pure text → image (no reference)
- transform = reference image is the SCENE TEMPLATE; preserve composition & subjects, change style/details
- restyle = reference image only donates colour palette + mood for a NEW subject

When a reference image is provided AND the user wants the same scene rendered differently:
- recommend mode = "transform"
- recommend tier = "ultra" (Nano Banana 2)
- recommend strength = 25..45 (low strength = stays close to reference)
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

const ENHANCE_SYSTEM_PROMPT = `You are an elite prompt engineer for AI image generators
in "Picture Studio". The user has clicked "Take this image and improve it" — your
single job is to deeply ANALYSE the attached reference image and emit a
high-fidelity English master prompt that lets Nano Banana 2 RE-RENDER the same
scene at much higher quality, with full preservation of content.

HARD RULES — do not break them:
- recommendedMode MUST be "transform"
- recommendedTier MUST be "ultra" (Nano Banana 2)
- recommendedStrength MUST be between 20 and 35 (stay close to the reference)
- The master prompt MUST be a single English paragraph of 120–200 words,
  containing TWO explicit blocks separated by line breaks:

  PRESERVE: <enumerate everything visible in the reference — approximate number
  of people, what each major group is doing, their clothing colours/era, props
  they carry, the central focal subject(s), foreground/midground/background layout,
  landscape (hills, vegetation, buildings, sky), lighting direction, time of day,
  dominant colour palette, camera angle, framing>.

  ENHANCE: <photorealistic skin/fabric/stone textures, consistent global lighting
  with correct cast shadows on every figure, sharp natural anatomy, no composite
  / cut-out / photo-stitching artefacts, no duplicated faces, unified colour grade,
  cinematic atmosphere, fine micro-detail, sharp focus, large-format camera look,
  natural depth of field>.

- referenceSummary MUST be 2–3 German sentences listing concretely what you see
  (rough head count, setting, lighting, mood) so the user can verify.
- alternatives: 2 shorter (30–50 word) variants of the same PRESERVE+ENHANCE idea,
  not generic prompts.
- reasoning: one short German sentence.

Return ONLY via the tool call.`;

function buildUserMessage(body: Body): unknown[] {
  const filterLines = body.filters
    ? Object.entries(body.filters)
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : '';

  const isEnhance = body.intent === 'enhance' && !!body.referenceImageUrl;

  const parts: any[] = [
    {
      type: 'text',
      text: [
        `User wish (any language, translate yourself):\n"${body.userText.trim()}"`,
        body.currentMode ? `\nCurrent UI mode: ${body.currentMode}` : '',
        body.currentTier ? `\nCurrent UI tier: ${body.currentTier}` : '',
        filterLines ? `\nOptional filters:\n${filterLines}` : '',
        isEnhance
          ? '\nINTENT = ENHANCE. A reference image is attached. Analyse it EXHAUSTIVELY: count people roughly, list their clothing/era, describe foreground vs midground vs background, landscape features (hills, buildings, vegetation, sky), lighting direction and time of day, dominant colours. Then emit the PRESERVE + ENHANCE master prompt as instructed.'
          : body.referenceImageUrl
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
        masterPrompt: { type: 'string', description: 'English master prompt.' },
        alternatives: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 2,
          description: 'Two shorter alternative prompts.',
        },
        recommendedTier: { type: 'string', enum: ['standard', 'fast', 'pro', 'ultra'] },
        recommendedMode: { type: 'string', enum: ['create', 'transform', 'restyle'] },
        recommendedStrength: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        reasoning: { type: 'string', description: 'One short German sentence.' },
        referenceSummary: {
          type: 'string',
          description: 'If a reference image was given, 1-3 German sentences. Otherwise empty.',
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
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { text: "QA mock content", script: "QA mock script", caption: "QA mock caption", variants: ["v1","v2"], status: "succeeded" });


  try {
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

    const isEnhance = body.intent === 'enhance' && !!body.referenceImageUrl;
    // Use Pro for vision — much better at counting/describing complex scenes
    const model = body.referenceImageUrl ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';
    const systemPrompt = isEnhance ? ENHANCE_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
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

    // Hard-enforce enhance recommendations regardless of model output
    if (isEnhance) {
      parsed.recommendedMode = 'transform';
      parsed.recommendedTier = 'ultra';
      if (
        typeof parsed.recommendedStrength !== 'number' ||
        parsed.recommendedStrength < 20 ||
        parsed.recommendedStrength > 35
      ) {
        parsed.recommendedStrength = 28;
      }
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
