import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

/**
 * Location Vibes Generator
 * --------------------------------------------------------------
 * Takes one source location image + a list of "vibes" (sunrise, night,
 * overcast, golden-hour …) and produces an image-to-image variant for
 * each, in parallel. Uses Gemini image-preview models with the source
 * image inlined as a multimodal input.
 *
 * Input:  { sourceImageUrl: string, vibes?: string[], description?: string }
 * Output: { variants: [{ vibe, imageUrl, seed, error }], successCount }
 */

interface RequestBody {
  sourceImageUrl?: string;
  vibes?: string[];
  description?: string;        // optional location description for context
}

const VIBE_PROMPTS: Record<string, string> = {
  sunrise:
    'soft golden sunrise light, warm pastel sky, long horizontal shadows, dewy atmosphere',
  'golden-hour':
    'cinematic golden hour, low warm sun, deep amber tones, soft directional light, magic-hour glow',
  overcast:
    'flat overcast daylight, soft diffused light, muted desaturated palette, even shadows',
  night:
    'deep night, practical lights only, cool moonlight ambient, deep shadows, neon or warm window glows where appropriate',
  'blue-hour':
    'twilight blue hour, deep cyan sky, contrast with warm artificial lights, romantic cinematic mood',
  rainy:
    'rainy weather, wet reflective surfaces, soft grey light, atmospheric haze, raindrops on surfaces',
  foggy:
    'thick atmospheric fog, low visibility, monochromatic palette, mysterious ethereal mood',
  sunny:
    'bright clear sunny day, blue sky with a few clouds, sharp natural shadows, vibrant saturated colors',
};

const DEFAULT_VIBES = ['sunrise', 'overcast', 'night'];

function buildVibePrompt(vibe: string, description: string): string {
  const vibeStyle = VIBE_PROMPTS[vibe] || vibe;
  return `Re-light this location in a new lighting condition WITHOUT changing the architecture, layout, geometry, or any objects.

LIGHTING / WEATHER VIBE: ${vibe.toUpperCase()} — ${vibeStyle}.
${description ? `Location context: ${description}.` : ''}

Strict constraints:
- Same camera angle, same composition, same framing, same lens
- Same buildings, same furniture, same objects, same materials
- Only the lighting, atmosphere, sky, and resulting color palette change
- Photorealistic, sharp focus, no text, no logos, no watermarks
- Output a single high-resolution image, suitable as image-to-video reference`;
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch source image: ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  // base64 in chunks (avoid call-stack overflow)
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000) as unknown as number[]);
  }
  const b64 = btoa(binary);
  const mime = r.headers.get('content-type') || 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

async function generateOne(
  prompt: string,
  sourceDataUrl: string,
  apiKey: string,
): Promise<string | null> {
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
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: sourceDataUrl } },
              ],
            },
          ],
          modalities: ['image', 'text'],
        }),
      });
      if (!response.ok) {
        console.warn(`[location-vibes] ${model} → HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (url) return url as string;
    } catch (err) {
      console.warn(`[location-vibes] ${model} threw`, err);
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
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const body = (await req.json()) as RequestBody;
    if (!body.sourceImageUrl) {
      return new Response(JSON.stringify({ error: 'sourceImageUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vibes = (body.vibes && body.vibes.length > 0 ? body.vibes : DEFAULT_VIBES)
      .filter((v) => typeof v === 'string')
      .slice(0, 6);

    const sourceDataUrl = await fetchImageAsDataUrl(body.sourceImageUrl);
    console.log(`[location-vibes] generating ${vibes.length} variants`);

    const results = await Promise.all(
      vibes.map(async (vibe) => {
        const prompt = buildVibePrompt(vibe, body.description || '');
        const imageUrl = await generateOne(prompt, sourceDataUrl, LOVABLE_API_KEY);
        return imageUrl
          ? { vibe, imageUrl, seed: crypto.randomUUID(), error: null }
          : { vibe, imageUrl: null, seed: null, error: 'generation failed' };
      })
    );

    const successCount = results.filter((r) => r.imageUrl).length;
    if (successCount === 0) throw new Error('All vibe generations failed');

    return new Response(
      JSON.stringify({ variants: results, successCount, totalCount: vibes.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('[location-vibes] error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
