import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

/**
 * Character Sheet Generator
 * --------------------------------------------------------------
 * Modes:
 *   • mode = "explainer"   (legacy)  → cartoon/flat/3D animation reference
 *   • mode = "realistic"   (Library) → cinematic 4-view sheet for AI Video Studio
 *                                       (Front · ¾ · Profile · Expression)
 *   • mode = "multi-vibe"  (Casting) → 4 PARALLEL single-image generations,
 *                                       one per stylistic "vibe" so the user
 *                                       can pick the look they like best.
 *                                       Returns variants[{ vibe, imageUrl, seed }].
 */

type Mode = 'explainer' | 'realistic' | 'multi-vibe';

interface RequestBody {
  mode?: Mode;
  // realistic / multi-vibe
  name?: string;
  description?: string;
  signatureItems?: string;
  vibes?: string[];               // multi-vibe only — defaults to 4 standard vibes
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

/**
 * Vibe palette — each entry describes a casting "look" for the same person.
 * Keep in English only (visual prompts must stay English for model quality).
 */
const VIBE_PROMPTS: Record<string, string> = {
  realistic:
    'Photorealistic, natural daylight, candid documentary feel, neutral color grading, 50mm lens, soft skin texture, sharp focus.',
  cinematic:
    'Cinematic film still, dramatic Rembrandt lighting, shallow depth of field, anamorphic 35mm look, teal-and-orange color grade, moody atmosphere.',
  editorial:
    'High-fashion editorial portrait, polished studio lighting, glossy magazine aesthetic, refined posing, crisp tonality, premium luxury feel.',
  documentary:
    'Gritty observational documentary style, available natural light, slight film grain, muted earthy palette, honest unposed expression, lived-in textures.',
  noir:
    'Classic film noir, hard low-key chiaroscuro lighting, deep shadows, monochrome with subtle warm tint, smoke-filled atmosphere.',
  vintage:
    'Vintage 1970s analog photography, warm faded tones, light leaks, Kodachrome color science, retro wardrobe styling preserved as described.',
};

const DEFAULT_VIBES = ['realistic', 'cinematic', 'editorial', 'documentary'];

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

function buildVibePrompt(b: RequestBody, vibe: string): string {
  const desc = (b.description || '').trim();
  const sig = (b.signatureItems || '').trim();
  const name = (b.name || 'character').trim();
  const vibeStyle = VIBE_PROMPTS[vibe] || VIBE_PROMPTS.realistic;

  return `Single full-body PORTRAIT of a recurring on-screen character for an AI video pipeline.
Subject (${name}): ${desc || 'cinematic protagonist'}.
${sig ? `Signature wardrobe & objects (must always be present): ${sig}.` : ''}

VIBE: ${vibe.toUpperCase()} — ${vibeStyle}

Composition:
- Full body, three-quarter angle, looking towards camera
- Confident neutral expression
- Clean uncluttered background suitable as image-to-video reference
- Wide vertical 3:4 aspect

CRITICAL: photorealistic when vibe is realistic/cinematic/documentary; no text, no logos, no watermarks, no captions.
Same person identity should be obvious across all vibe variants if compared side-by-side.`;
}

async function generateOne(prompt: string, apiKey: string): Promise<string | null> {
  const models = [
    'google/gemini-3-pro-image-preview',
    'google/gemini-3.1-flash-image-preview',
    'google/gemini-2.5-flash-image-preview',
  ];
  for (const model of models) {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          modalities: ['image', 'text'],
        }),
      });
      if (!response.ok) {
        console.warn(`[character-sheet] ${model} → HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (url) return url as string;
    } catch (err) {
      console.warn(`[character-sheet] ${model} threw`, err);
    }
  }
  return null;
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
    const mode: Mode =
      body.mode === 'realistic' ? 'realistic' :
      body.mode === 'multi-vibe' ? 'multi-vibe' :
      'explainer';

    // ─── multi-vibe casting: parallel generation of 4 looks ───
    if (mode === 'multi-vibe') {
      const vibes = (body.vibes && body.vibes.length > 0 ? body.vibes : DEFAULT_VIBES)
        .filter((v) => typeof v === 'string')
        .slice(0, 6); // hard cap

      console.log(`[character-sheet] multi-vibe: generating ${vibes.length} variants`);

      const results = await Promise.all(
        vibes.map(async (vibe) => {
          const prompt = buildVibePrompt(body, vibe);
          const imageUrl = await generateOne(prompt, LOVABLE_API_KEY);
          return imageUrl
            ? { vibe, imageUrl, seed: crypto.randomUUID(), error: null }
            : { vibe, imageUrl: null, seed: null, error: 'generation failed' };
        })
      );

      const successCount = results.filter((r) => r.imageUrl).length;
      if (successCount === 0) {
        throw new Error('All vibe generations failed');
      }

      return new Response(
        JSON.stringify({
          mode,
          variants: results,
          successCount,
          totalCount: vibes.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ─── single composite (realistic / explainer) ───
    const prompt = mode === 'realistic'
      ? buildRealisticPrompt(body)
      : buildExplainerPrompt(body);

    console.log(`[character-sheet] mode=${mode} prompt=${prompt.slice(0, 200)}…`);

    const imageData = await generateOne(prompt, LOVABLE_API_KEY);
    if (!imageData) {
      throw new Error('No image generated');
    }

    return new Response(
      JSON.stringify({
        imageUrl: imageData,
        styleSeed: crypto.randomUUID(),
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
