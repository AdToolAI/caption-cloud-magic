// generate-location-props
// Generates 4 prop/dressing variants for a brand_location via Gemini Image.
// Inserts rows into location_prop_variants. Idempotent per (location_id, prop_id).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const PROPS: { id: string; label: string; modifier: string }[] = [
  { id: 'empty', label: 'Empty', modifier: 'completely empty and clean, no props or furniture, pristine staging-ready space' },
  { id: 'product-hero', label: 'Product Hero', modifier: 'a single hero product on a clean pedestal at center, museum-style spotlight on the product' },
  { id: 'lifestyle', label: 'Lifestyle', modifier: 'tasteful lifestyle dressing: plants, books, ceramics, soft fabrics, lived-in but curated' },
  { id: 'event', label: 'Event', modifier: 'event setup: subtle string lights, a small table arrangement, ambient atmosphere ready for guests' },
];

const GEOMETRY_LOCK =
  'CRITICAL: Preserve the EXACT camera angle, walls, floor, ceiling, windows, doors and overall room geometry of the reference image. Only re-dress the set with the requested props. Photorealistic.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", imageUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", predictionId: "qa-mock-image", status: "succeeded" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) throw new Error('Unauthorized');

    const { location_id } = await req.json();
    if (!location_id) throw new Error('location_id required');

    const { data: loc, error: lErr } = await supabaseAdmin
      .from('brand_locations')
      .select('id, user_id, reference_image_url, storage_path, name')
      .eq('id', location_id).single();
    if (lErr || !loc) throw new Error('Location not found');
    if (loc.user_id !== user.id) throw new Error('Forbidden');

    let sourceUrl = loc.reference_image_url;
    if (loc.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from('brand-locations')
        .createSignedUrl(loc.storage_path, 60 * 10);
      if (signed?.signedUrl) sourceUrl = signed.signedUrl;
    }

    console.log('[generate-location-props] start', { location_id });

    const results = await Promise.allSettled(PROPS.map(async (prop) => {
      const prompt = `Re-dress this location: ${prop.modifier}. ${GEOMETRY_LOCK} Cinematic 16:9 framing.`;
      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-image-preview',
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: sourceUrl } },
          ]}],
          modalities: ['image', 'text'],
        }),
      });
      if (!aiResp.ok) {
        const txt = await aiResp.text();
        throw new Error(`Gemini ${aiResp.status}: ${txt.slice(0, 120)}`);
      }
      const aiData = await aiResp.json();
      const dataUri: string | undefined = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUri?.startsWith('data:image/')) throw new Error('No image returned');

      const base64 = dataUri.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `${user.id}/props/${location_id}/${prop.id}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('brand-locations')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);
      const { data: signedNew } = await supabaseAdmin.storage
        .from('brand-locations')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedNew?.signedUrl;
      if (!url) throw new Error('Sign URL failed');

      await supabaseAdmin.from('location_prop_variants').upsert({
        location_id, prop_id: prop.id, label: prop.label, image_url: url, storage_path: path,
      }, { onConflict: 'location_id,prop_id' });

      return { prop_id: prop.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-location-props] done', { ok, failed: failed.length });

    return new Response(JSON.stringify({ success: true, generated: ok, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-location-props] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
