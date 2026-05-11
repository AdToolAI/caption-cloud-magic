// generate-avatar-wardrobe
// Generates 4 locked-identity outfit variants for a brand_character via Gemini Image.
// Inserts rows into avatar_wardrobe_variants. Idempotent per (avatar_id, outfit_id).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const OUTFITS: { id: string; label: string; modifier: string }[] = [
  { id: 'casual', label: 'Casual', modifier: 'casual everyday outfit: well-fitted t-shirt or sweater, jeans, sneakers, relaxed natural styling' },
  { id: 'formal', label: 'Formal', modifier: 'formal business attire: tailored suit or blazer with crisp shirt, refined and polished, professional styling' },
  { id: 'action', label: 'Action', modifier: 'athletic action wear: technical sportswear, performance fabric, dynamic and ready-to-move styling' },
  { id: 'brand', label: 'Brand', modifier: 'on-brand outfit in clean monochrome neutrals (white, black, gray) with a single accent piece, modern minimal styling' },
];

const IDENTITY_LOCK =
  'CRITICAL: Preserve the EXACT face, age, skin tone, hair style, hair color, eye color, facial features and body proportions of the reference person. Do not alter the face or hair. Only the clothing and accessories change. Photorealistic.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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

    const { avatar_id } = await req.json();
    if (!avatar_id) throw new Error('avatar_id required');

    const { data: avatar, error: avErr } = await supabaseAdmin
      .from('brand_characters')
      .select('id, user_id, reference_image_url, storage_path, portrait_url, name')
      .eq('id', avatar_id).single();
    if (avErr || !avatar) throw new Error('Avatar not found');
    if (avatar.user_id !== user.id) throw new Error('Forbidden');

    let sourceUrl = avatar.portrait_url || avatar.reference_image_url;
    if (avatar.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(avatar.storage_path, 60 * 10);
      if (signed?.signedUrl) sourceUrl = signed.signedUrl;
    }

    console.log('[generate-avatar-wardrobe] start', { avatar_id, user_id: user.id });

    const results = await Promise.allSettled(OUTFITS.map(async (outfit) => {
      const prompt = `Restyle the same person wearing a ${outfit.modifier}. Soft neutral studio background, photorealistic. ${IDENTITY_LOCK} Square 1:1 framing.`;
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
      const path = `${user.id}/wardrobe/${avatar_id}/${outfit.id}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('brand-characters')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);
      const { data: signedNew } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedNew?.signedUrl;
      if (!url) throw new Error('Sign URL failed');

      await supabaseAdmin.from('avatar_wardrobe_variants').upsert({
        avatar_id, outfit_id: outfit.id, label: outfit.label, image_url: url, storage_path: path,
      }, { onConflict: 'avatar_id,outfit_id' });

      return { outfit_id: outfit.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-avatar-wardrobe] done', { ok, failed: failed.length });

    return new Response(JSON.stringify({ success: true, generated: ok, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-avatar-wardrobe] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
