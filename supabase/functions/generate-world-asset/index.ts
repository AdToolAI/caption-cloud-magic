// Stage 3 — Central "Generate your own" world asset endpoint.
//
// Accepts a free-text prompt + asset kind ('location' | 'building' | 'prop'),
// renders a high-fidelity reference image via Nano Banana 2
// (google/gemini-3.1-flash-image-preview), stores it in the brand-locations
// bucket (shared by all three world tables), runs identity extraction so the
// asset behaves identically to user-uploaded refs, and inserts a row in the
// matching brand_* table. The returned row is immediately picked up by
// useUnifiedMentionLibrary → Toolkit, Composer & Vidu/Hailuo i2v.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

type Kind = 'location' | 'building' | 'prop';

const TABLE: Record<Kind, string> = {
  location: 'brand_locations',
  building: 'brand_buildings',
  prop: 'brand_props',
};

// English-only style locks (Core rule: visual prompts stay EN).
const STYLE_LOCK: Record<Kind, string> = {
  location:
    'Cinematic establishing shot, photorealistic environment, 16:9 framing, natural depth, no people, no text, no logos, professional color grading.',
  building:
    'Architectural hero shot of the building, photorealistic, eye-level or slight low angle, full structure visible, clean sky, no people, no text, no logos.',
  prop:
    'Studio product photograph of the object on a clean neutral background, soft even lighting, sharp focus, 1:1 framing, no people, no text, no logos.',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", imageUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", predictionId: "qa-mock-image", status: "succeeded" });


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
    const name = (body.name ?? '').toString().trim();
    const userPrompt = (body.prompt ?? '').toString().trim();
    const description = body.description?.toString().trim() || null;

    if (!TABLE[kind]) {
      return new Response(JSON.stringify({ error: 'Invalid kind' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!name || !userPrompt) {
      return new Response(JSON.stringify({ error: 'name and prompt are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalPrompt =
      `IMPORTANT: You MUST output an image, not a description. ` +
      `${userPrompt}. ${STYLE_LOCK[kind]}`;

    // Render via Nano Banana 2 with one fallback to original Nano Banana.
    let imageData: string | undefined;
    let lastErr = '';
    const models = [
      'google/gemini-3.1-flash-image-preview',
      'google/gemini-2.5-flash-image-preview',
    ];

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: finalPrompt }],
            modalities: ['image'],
          }),
        });
        if (res.status === 429 || res.status === 402) {
          return new Response(
            JSON.stringify({
              error: res.status === 429
                ? 'Rate limit exceeded — try again shortly.'
                : 'AI credits exhausted — please add credits.',
            }),
            { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        if (!res.ok) { lastErr = `${res.status} ${await res.text()}`; continue; }
        const data = await res.json();
        imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageData) break;
        lastErr = 'Model returned no image';
      }
      if (imageData) break;
    }

    if (!imageData) {
      console.error('generate-world-asset failed:', lastErr);
      return new Response(
        JSON.stringify({ error: 'Image generation failed. Please refine your prompt.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Upload — fetch→Blob avoids base64 binary corruption.
    const admin = createClient(supabaseUrl, serviceKey);
    const blob = await (await fetch(imageData)).blob();
    const path = `${user.id}/${crypto.randomUUID()}.png`;

    const { error: upErr } = await admin.storage
      .from('brand-locations')
      .upload(path, blob, { contentType: 'image/png', upsert: false });
    if (upErr) throw upErr;

    const { data: signed } = await admin.storage
      .from('brand-locations')
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const imageUrl = signed?.signedUrl;
    if (!imageUrl) throw new Error('Could not sign URL');

    // Identity extraction (shared extractor — works for env/building/prop).
    let identity: any = {};
    try {
      const { data: extracted } = await admin.functions.invoke(
        'extract-location-identity',
        { body: { image_url: imageUrl } },
      );
      if ((extracted as any)?.identity) identity = (extracted as any).identity;
    } catch (e) {
      console.warn('Identity extraction failed:', e);
    }

    const { data: row, error: insErr } = await admin
      .from(TABLE[kind])
      .insert({
        user_id: user.id,
        name,
        description: description ?? userPrompt.slice(0, 240),
        reference_image_url: imageUrl,
        storage_path: path,
        visual_identity_json: { ...identity, source: 'ai-generated', source_prompt: userPrompt },
        tags: ['ai-generated', kind],
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ asset: row, kind }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('generate-world-asset error:', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Generation failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
