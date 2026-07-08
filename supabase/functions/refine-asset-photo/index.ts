// refine-asset-photo
// ---------------------------------------------------------------
// Takes a user-uploaded photo (any quality) of a character, prop,
// building or location, and produces a clean studio-grade reference
// image via Nano Banana 2. For character/prop/building the image is
// rendered on a solid pure-white background so the frontend can
// alpha-cut it into a transparent PNG using
// `src/lib/backgroundRemoval.ts`. For location the cleaned scene is
// returned as JPG (no cutout).
//
// The endpoint uploads the refined image into the correct brand
// bucket and inserts a row in `brand_characters` / `brand_props` /
// `brand_buildings` / `brand_locations` with the caller as owner.
// Postgres assigns the canonical UUID that flows through the v202/v211
// Cast & World ID pipeline.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { fetchWithTimeout, isTimeoutError } from '../_shared/timeout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Kind = 'character' | 'prop' | 'building' | 'location';

const TABLE: Record<Kind, string> = {
  character: 'brand_characters',
  prop: 'brand_props',
  building: 'brand_buildings',
  location: 'brand_locations',
};

const TARGET_BUCKET: Record<Kind, string> = {
  character: 'brand-characters',
  prop: 'brand-locations',
  building: 'brand-locations',
  location: 'brand-locations',
};

// Kind-specific restage prompts. Visual prompts stay in English (Core rule).
const REFINE_PROMPT: Record<Kind, string> = {
  character:
    'Re-render the main person from this photo as a clean full-body studio portrait. Preserve their exact identity, face, hair, body proportions and outfit. Place them on a solid pure white background, remove all background clutter, use soft even studio lighting, sharp focus, standing pose, 3:4 framing, no text, no logos, no props unless they were held in the original.',
  prop:
    'Re-render the main object from this photo as a clean studio product photograph. Preserve its exact shape, colors, materials and branding. Place it on a solid pure white background, remove any hands or clutter, soft even lighting, centered, sharp focus, 1:1 framing, no text overlays, no watermarks.',
  building:
    'Re-render the main building from this photo as a clean architectural hero shot. Preserve its exact geometry, facade, materials and character. Full structure visible, eye-level or slight low angle, clean plain sky, no people, no cars, no text, no logos, photorealistic, sharp focus.',
  location:
    'Re-render this environment as a clean cinematic establishing shot. Preserve the exact space, layout, lighting mood and defining features. Photorealistic, 16:9 framing, natural depth, no people, no text, no logos, professional color grading.',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) throw new Error('LOVABLE_API_KEY not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const kind = body.kind as Kind;
    const sourceImageUrl = (body.sourceImageUrl ?? '').toString().trim();
    const name = (body.name ?? '').toString().trim();
    const description = body.description ? body.description.toString().trim() : null;
    const extraPrompt = body.extraPrompt ? body.extraPrompt.toString().trim() : '';

    if (!TABLE[kind]) {
      return new Response(JSON.stringify({ error: 'Invalid kind' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!sourceImageUrl || !name) {
      return new Response(JSON.stringify({ error: 'sourceImageUrl and name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch source image and inline as data URL for the AI request. The
    // gateway model must be able to see the pixels — a signed URL from a
    // private bucket won't be reachable from the provider side.
    const srcRes = await fetch(sourceImageUrl);
    if (!srcRes.ok) throw new Error(`Failed to fetch source image (${srcRes.status})`);
    const srcBlob = await srcRes.blob();
    const srcBuf = new Uint8Array(await srcBlob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < srcBuf.length; i++) bin += String.fromCharCode(srcBuf[i]);
    const srcB64 = btoa(bin);
    const srcMime = srcBlob.type || 'image/jpeg';
    const srcDataUrl = `data:${srcMime};base64,${srcB64}`;

    const promptText = extraPrompt
      ? `${REFINE_PROMPT[kind]} Additional user notes: ${extraPrompt}`
      : REFINE_PROMPT[kind];

    // Call Nano Banana 2 via AI Gateway. Chat-shape body with image_url
    // input block. Non-streaming — we need the final image bytes to
    // upload to storage.
    let imageDataUrl: string | undefined;
    let lastErr = '';
    const models = [
      'google/gemini-3.1-flash-image',
      'google/gemini-2.5-flash-image',
    ];

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        let res: Response;
        try {
          res = await fetchWithTimeout(
            'https://ai.gateway.lovable.dev/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: `IMPORTANT: Output an image, not a description. ${promptText}` },
                      { type: 'image_url', image_url: { url: srcDataUrl } },
                    ],
                  },
                ],
                modalities: ['image', 'text'],
              }),
            },
            90_000,
            `ai-gateway ${model}`,
          );
        } catch (e) {
          if (isTimeoutError(e)) {
            lastErr = `Timeout after 90s (${model})`;
            continue;
          }
          throw e;
        }
        if (res.status === 429 || res.status === 402) {
          return new Response(
            JSON.stringify({
              error:
                res.status === 429
                  ? 'Rate limit exceeded — try again shortly.'
                  : 'AI credits exhausted — please add credits.',
            }),
            {
              status: res.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
        if (!res.ok) {
          lastErr = `${res.status} ${await res.text()}`;
          continue;
        }
        const data = await res.json();
        imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageDataUrl) break;
        lastErr = 'Model returned no image';
      }
      if (imageDataUrl) break;
    }

    if (!imageDataUrl) {
      console.error('refine-asset-photo failed:', lastErr);
      return new Response(
        JSON.stringify({ error: 'Refinement failed. Try a clearer photo or another image.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Upload the refined image (still with solid-white bg for cutout kinds).
    // Frontend will run the client-side background-removal pass and overwrite
    // this file via `update_asset_reference_image` for character/prop/building.
    const admin = createClient(supabaseUrl, serviceKey);
    const refinedBlob = await (await fetch(imageDataUrl)).blob();
    const bucket = TARGET_BUCKET[kind];
    const path = `${user.id}/${crypto.randomUUID()}.png`;

    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, refinedBlob, { contentType: 'image/png', upsert: false });
    if (upErr) throw upErr;

    const { data: signed } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const refinedUrl = signed?.signedUrl;
    if (!refinedUrl) throw new Error('Could not sign refined URL');

    // Insert canonical brand row with the refined url. UUID is auto-issued.
    const insertPayload: Record<string, any> = {
      user_id: user.id,
      name,
      description: description ?? null,
      reference_image_url: refinedUrl,
      storage_path: path,
      tags: ['photo-upload', kind],
    };
    if (kind !== 'character') {
      insertPayload.visual_identity_json = { source: 'photo-refined', kind };
    } else {
      insertPayload.visual_identity_json = { source: 'photo-refined' };
    }

    const { data: row, error: insErr } = await admin
      .from(TABLE[kind])
      .insert(insertPayload)
      .select()
      .single();
    if (insErr) throw insErr;

    return new Response(
      JSON.stringify({
        asset: row,
        kind,
        bucket,
        storage_path: path,
        refined_url: refinedUrl,
        needs_client_cutout: kind !== 'location',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('refine-asset-photo error:', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Refinement failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
