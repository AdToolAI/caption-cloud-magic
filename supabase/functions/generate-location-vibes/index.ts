// generate-location-vibes
// Generates 5 time-of-day variants for a brand_location via Gemini Image.
// Inserts rows into location_vibe_variants. Idempotent per (location_id, vibe_id).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const VIBES: { id: string; label: string; modifier: string }[] = [
  { id: 'golden-hour', label: 'Golden Hour', modifier: 'warm golden hour sunset light, long shadows, amber tones' },
  { id: 'blue-hour', label: 'Blue Hour', modifier: 'cool blue hour twilight just after sunset, soft cyan-magenta sky' },
  { id: 'overcast', label: 'Overcast Day', modifier: 'soft diffused overcast daylight, even shadowless lighting, muted colors' },
  { id: 'night-neon', label: 'Night / Neon', modifier: 'nighttime with neon practical lights, deep shadows, cinematic' },
  { id: 'foggy-dawn', label: 'Foggy Dawn', modifier: 'misty foggy dawn, atmospheric haze, low contrast pastel palette' },
];

const LOCATION_LOCK =
  'CRITICAL: Preserve the exact same location, geometry, architecture, and composition. Only change the time of day, sky and lighting. Photorealistic.';

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

    console.log('[generate-location-vibes] start', { location_id });

    const results = await Promise.allSettled(VIBES.map(async (vibe) => {
      const prompt = `Re-light this location with ${vibe.modifier}. ${LOCATION_LOCK} Cinematic 16:9 framing.`;
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
      const path = `${user.id}/vibes/${location_id}/${vibe.id}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('brand-locations')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);
      const { data: signedNew } = await supabaseAdmin.storage
        .from('brand-locations')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedNew?.signedUrl;
      if (!url) throw new Error('Sign URL failed');

      await supabaseAdmin.from('location_vibe_variants').upsert({
        location_id, vibe_id: vibe.id, label: vibe.label, image_url: url, storage_path: path,
      }, { onConflict: 'location_id,vibe_id' });

      return { vibe_id: vibe.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-location-vibes] done', { ok, failed: failed.length });

    return new Response(JSON.stringify({ success: true, generated: ok, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-location-vibes] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
