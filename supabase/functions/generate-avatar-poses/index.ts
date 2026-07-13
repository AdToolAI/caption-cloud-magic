// generate-avatar-poses
// Generates 4 locked-identity pose variants for a brand_character via Gemini Image.
// Inserts rows into avatar_pose_variants. Idempotent per (avatar_id, pose_id).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const POSES: { id: string; label: string; modifier: string }[] = [
  { id: 'frontal-hero', label: 'Frontal Hero', modifier: 'centered frontal hero shot, eye-level, looking straight into camera, shoulders square' },
  { id: 'three-quarter', label: '3/4 Turn', modifier: 'three-quarter body turn, head slightly angled, soft side lighting' },
  { id: 'profile', label: 'Side Profile', modifier: 'clean side profile, looking off-camera left, neutral background' },
  { id: 'action', label: 'Action / Walking', modifier: 'mid-stride walking pose, dynamic body language, slight motion blur on background' },
];

const IDENTITY_LOCK =
  'CRITICAL: Preserve the exact face, age, skin tone, hair style, hair color, eye color, and all distinguishing features of the reference person. Do not age them. Do not change face shape. Photorealistic.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", imageUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", predictionId: "qa-mock-image", status: "succeeded" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      console.error('[generate-avatar-poses] auth failed:', authErr?.message);
      throw new Error('Unauthorized');
    }

    const { avatar_id } = await req.json();
    if (!avatar_id) throw new Error('avatar_id required');

    const { data: avatar, error: avErr } = await supabaseAdmin
      .from('brand_characters')
      .select('id, user_id, reference_image_url, storage_path, portrait_url, name')
      .eq('id', avatar_id).single();
    if (avErr || !avatar) throw new Error('Avatar not found');
    if (avatar.user_id !== user.id) throw new Error('Forbidden');

    // Resolve fresh source URL
    let sourceUrl = avatar.portrait_url || avatar.reference_image_url;
    if (avatar.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(avatar.storage_path, 60 * 10);
      if (signed?.signedUrl) sourceUrl = signed.signedUrl;
    }

    console.log('[generate-avatar-poses] start', { avatar_id, user_id: user.id });

    // Generate all poses in parallel
    const results = await Promise.allSettled(POSES.map(async (pose) => {
      const prompt = `Restyle this person as a ${pose.modifier}. Soft neutral studio background, photorealistic. ${IDENTITY_LOCK} Square 1:1 framing.`;
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
      const path = `${user.id}/poses/${avatar_id}/${pose.id}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('brand-characters')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);
      const { data: signedNew } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedNew?.signedUrl;
      if (!url) throw new Error('Sign URL failed');

      // Upsert variant
      await supabaseAdmin.from('avatar_pose_variants').upsert({
        avatar_id, pose_id: pose.id, label: pose.label, image_url: url, storage_path: path,
      }, { onConflict: 'avatar_id,pose_id' });

      return { pose_id: pose.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-avatar-poses] done', { ok, failed: failed.length });

    return new Response(JSON.stringify({ success: true, generated: ok, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-avatar-poses] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
