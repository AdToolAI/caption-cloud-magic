import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Character Sheet Generator
 * --------------------------------------------------------------
 * Two modes:
 *   • mode = "explainer" (legacy)  → cartoon/flat/3D animation reference
 *   • mode = "realistic" (Library) → cinematic 4-view sheet for AI Video Studio
 *                                     (Front · ¾ · Profile · Expression)
 *                                     The first/largest view is best suited as
 *                                     i2v reference image (Kling/Hailuo/Wan).
 */

type Mode = 'explainer' | 'realistic';

interface RequestBody {
  mode?: Mode;
  // realistic mode
  name?: string;
  description?: string;
  signatureItems?: string;
  // explainer mode (legacy)
  gender?: string;
  ageRange?: string;
  appearance?: string;
  clothing?: string;
  style?: string;
}

const EXPLAINER_STYLES: Record<string, string> = {
  'flat-design': 'flat design style, simple geometric shapes, no shadows, vibrant solid colors, vector art',
  'isometric': 'isometric 3D illustration, clean geometric shapes, professional look, subtle shadows',
  'whiteboard': 'hand-drawn whiteboard sketch style, black marker on white, simple line art',
  'comic': 'cartoon comic book style, bold outlines, expressive features, dynamic poses',
  'corporate': 'professional corporate illustration, muted colors, business appropriate, clean lines',
  'modern-3d': 'modern 3D rendered character, soft lighting, glassmorphism elements, gradient colors',
};

const AGE_DESCRIPTIONS: Record<string, string> = {
  'child': 'young child (6-12 years old)',
  'young-adult': 'young adult (18-30 years old)',
  'adult': 'adult (30-50 years old)',
  'senior': 'senior adult (50+ years old)',
};

function buildExplainerPrompt(b: RequestBody): string {
  const styleDesc = EXPLAINER_STYLES[b.style || 'flat-design'] || EXPLAINER_STYLES['flat-design'];
  const genderDesc =
    b.gender === 'female' ? 'female character' :
    b.gender === 'male' ? 'male character' : 'gender-neutral character';
  const ageDesc = AGE_DESCRIPTIONS[b.ageRange || 'adult'] || 'adult';

  return `Create a character reference sheet for an explainer video featuring a ${genderDesc}, ${ageDesc}.
${b.appearance ? `Physical appearance: ${b.appearance}` : ''}
${b.clothing ? `Clothing: ${b.clothing}` : ''}

Style: ${styleDesc}

The character sheet should show:
- Front view (main, larger)
- Side profile view (smaller)
- A few expression variations (happy, neutral, explaining)

The character should look friendly, approachable, and professional.
Maintain perfect consistency across all views.
White or light gray clean background.
High quality, suitable for animation reference.`;
}

function buildRealisticPrompt(b: RequestBody): string {
  const desc = (b.description || '').trim();
  const sig = (b.signatureItems || '').trim();
  const name = (b.name || 'character').trim();

  return `Photorealistic CHARACTER REFERENCE SHEET for an AI video pipeline.
Subject (${name}): ${desc || 'cinematic protagonist'}.
${sig ? `Signature wardrobe & objects (must repeat in every view): ${sig}.` : ''}

Layout (single composite image, equally sized panels on a clean light-grey studio background, soft cinematic key light, 50mm lens, neutral expression unless noted):
1) FRONT VIEW — full body, looking at camera, arms relaxed at sides
2) THREE-QUARTER VIEW — slight turn (~30°), full body, same outfit, same lighting
3) PROFILE VIEW — strict side profile, full body, same outfit
4) EXPRESSION CLOSE-UP — head & shoulders, gentle confident smile

CRITICAL CONSISTENCY RULES:
- Identical face structure, hair, skin tone, body proportions across all 4 views
- Identical wardrobe, accessories, colors and materials across all 4 views
- Same lighting setup and background tone in every panel
- Photorealistic, sharp focus, no stylization, no text, no logos, no watermarks

Output: one high-resolution composite image, wide aspect ratio, suitable for image-to-video reference.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const body = (await req.json()) as RequestBody;
    const mode: Mode = body.mode === 'realistic' ? 'realistic' : 'explainer';

    const prompt = mode === 'realistic'
      ? buildRealisticPrompt(body)
      : buildExplainerPrompt(body);

    console.log(`[character-sheet] mode=${mode} prompt=${prompt.slice(0, 200)}…`);

    // Pro -> Flash fallback chain (matches platform reliability policy)
    const models = mode === 'realistic'
      ? ['google/gemini-3-pro-image-preview', 'google/gemini-3.1-flash-image-preview', 'google/gemini-2.5-flash-image-preview']
      : ['google/gemini-2.5-flash-image-preview'];

    let imageData: string | null = null;
    let lastError: string | null = null;

    for (const model of models) {
      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            modalities: ['image', 'text'],
          }),
        });
        if (!response.ok) {
          lastError = `${model}: ${response.status}`;
          console.warn('[character-sheet] model failed, trying next:', lastError);
          continue;
        }
        const data = await response.json();
        const candidate = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (candidate) {
          imageData = candidate;
          console.log(`[character-sheet] success with ${model}`);
          break;
        }
        lastError = `${model}: no image in response`;
      } catch (err) {
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (!imageData) {
      throw new Error(lastError || 'No image generated');
    }

    const styleSeed = crypto.randomUUID();

    return new Response(
      JSON.stringify({
        imageUrl: imageData,
        styleSeed,
        prompt,
        mode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('[character-sheet] error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
