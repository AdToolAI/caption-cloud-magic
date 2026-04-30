// generate-avatar-portrait
// Takes a brand character's reference image, asks Gemini Image to restyle it as a
// frontal Hedra-friendly portrait, uploads to brand-characters bucket under
// {user_id}/portraits/{uuid}.png, updates brand_characters.portrait_url.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const PORTRAIT_PROMPT =
  'Restyle this person as a centered frontal portrait, eye-level camera, neutral soft background, shoulders visible, looking directly into camera, photorealistic, soft studio lighting. Preserve the exact facial identity, hair style and color, skin tone, and any distinguishing features. Square 1:1 framing.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();
    if (authErr || !user) throw new Error('Unauthorized');

    const { character_id } = await req.json();
    if (!character_id) throw new Error('character_id required');

    // Fetch character
    const { data: character, error: chErr } = await supabaseAdmin
      .from('brand_characters')
      .select('id, user_id, reference_image_url, storage_path')
      .eq('id', character_id)
      .single();
    if (chErr || !character) throw new Error('Avatar not found');
    if (character.user_id !== user.id) throw new Error('Forbidden');

    // Build a fresh signed URL for the source image
    let sourceUrl = character.reference_image_url;
    if (character.storage_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(character.storage_path, 60 * 10);
      if (signed?.signedUrl) sourceUrl = signed.signedUrl;
    }

    console.log('[generate-avatar-portrait] start', { character_id, user_id: user.id });

    // Call Gemini Image (Flash 3.1 Image) via Lovable AI Gateway
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PORTRAIT_PROMPT },
              { type: 'image_url', image_url: { url: sourceUrl } },
            ],
          },
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('[generate-avatar-portrait] gemini error', aiResp.status, txt);
      if (aiResp.status === 429) throw new Error('Rate limited — try again in a minute');
      if (aiResp.status === 402) throw new Error('AI credits exhausted — top up Lovable AI');
      throw new Error(`Portrait generation failed: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const dataUri: string | undefined =
      aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUri || !dataUri.startsWith('data:image/')) {
      throw new Error('No image returned from model');
    }

    // Decode the base64 image
    const base64 = dataUri.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // Upload to brand-characters bucket — RLS requires user_id as first segment
    const portraitPath = `${user.id}/portraits/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from('brand-characters')
      .upload(portraitPath, bytes, { contentType: 'image/png', upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signedPortrait } = await supabaseAdmin.storage
      .from('brand-characters')
      .createSignedUrl(portraitPath, 60 * 60 * 24 * 365 * 5); // ~5 years
    const portraitUrl = signedPortrait?.signedUrl;
    if (!portraitUrl) throw new Error('Could not create signed URL for portrait');

    // Update DB
    const { error: updErr } = await supabaseAdmin
      .from('brand_characters')
      .update({
        portrait_url: portraitUrl,
        portrait_mode: 'auto_generated',
      })
      .eq('id', character_id);
    if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

    console.log('[generate-avatar-portrait] success', { portraitPath });

    return new Response(
      JSON.stringify({
        success: true,
        portrait_url: portraitUrl,
        portrait_mode: 'auto_generated',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-avatar-portrait] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
