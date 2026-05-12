// generate-wardrobe-perspectives — Stage 24
// Generates 4 locked-identity perspective renders (front/back/side/top)
// of the avatar wearing the chosen outfit. Uses the avatar's portrait as
// identity anchor + outfit modifier from THEME_PACKS so we always preserve
// the USER's face, even when no per-user wardrobe variant exists yet.
// Idempotent per (avatar_id, theme_pack, outfit_id, perspective).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { THEME_PACKS } from '../_shared/wardrobe-themes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

function lookupOutfit(themePackComposite: string, outfitId: string) {
  const [theme, sub] = themePackComposite.split(':');
  const subs = (THEME_PACKS as any)[theme];
  if (!subs) return null;
  const outfits = subs[sub];
  if (!outfits) return null;
  return outfits.find((o: any) => o.id === outfitId) ?? null;
}

const PERSPECTIVES: { id: 'front' | 'back' | 'side' | 'top'; label: string; modifier: string }[] = [
  { id: 'front', label: 'Front', modifier: 'centered FRONTAL full-body shot, eye-level, looking straight at the camera, shoulders square, head-to-toe framing' },
  { id: 'back',  label: 'Back',  modifier: 'full-body shot from DIRECTLY BEHIND the person, showing the full back of the outfit, head-to-toe framing, person facing away from camera' },
  { id: 'side',  label: 'Side',  modifier: 'clean SIDE PROFILE full-body shot, exact 90 degree camera angle from the right side, head-to-toe framing' },
  { id: 'top',   label: 'Top',   modifier: 'TOP-DOWN bird-eye view, camera looking straight down at the person standing on a neutral floor, full body visible from above' },
];

const IDENTITY_LOCK =
  'CRITICAL: Preserve the EXACT face, age, skin tone, hair style, hair color, eye color and body proportions of the reference person. Do not alter the face or hair. Preserve the EXACT outfit, fabric, color, cut and accessories from the reference image — only the camera angle changes. Soft neutral studio background, photorealistic, head-to-toe framing.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
      console.error('[generate-wardrobe-perspectives] auth failed:', authErr?.message);
      throw new Error('Unauthorized');
    }

    const body = await req.json().catch(() => ({}));
    const { avatar_id, theme_pack, outfit_id, outfit_label, source_image_url } = body ?? {};
    if (!avatar_id || !theme_pack || !outfit_id) {
      throw new Error('avatar_id, theme_pack, outfit_id required');
    }

    // Verify avatar ownership and get identity portrait
    const { data: avatar, error: avErr } = await supabaseAdmin
      .from('brand_characters')
      .select('id, user_id, name, portrait_url, reference_image_url')
      .eq('id', avatar_id).single();
    if (avErr || !avatar) throw new Error('Avatar not found');
    if (avatar.user_id !== user.id) throw new Error('Forbidden');

    // Identity anchor: ALWAYS the avatar's own portrait (preserves user's face).
    const identityUrl: string | null =
      (avatar as any).portrait_url || (avatar as any).reference_image_url || source_image_url || null;
    if (!identityUrl) throw new Error('Avatar has no portrait — generate it first.');

    // Outfit modifier: lookup canonical wording from THEME_PACKS.
    const outfit = lookupOutfit(theme_pack, outfit_id);
    const outfitModifier = outfit?.modifier
      ?? `outfit described as: ${outfit_label ?? outfit_id}`;
    const resolvedLabel = outfit?.label ?? outfit_label ?? outfit_id;

    console.log('[generate-wardrobe-perspectives] start', { avatar_id, theme_pack, outfit_id });

    const results = await Promise.allSettled(PERSPECTIVES.map(async (p) => {
      const prompt =
        `Render the SAME person from the reference photo, now wearing ${outfitModifier}. ` +
        `Camera: ${p.modifier}. ${IDENTITY_LOCK} 3:4 portrait framing.`;
      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-image-preview',
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: identityUrl } },
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
      const path = `${user.id}/wardrobe-perspectives/${avatar_id}/${theme_pack}/${outfit_id}/${p.id}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('brand-characters')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`Upload: ${upErr.message}`);

      const { data: signedNew } = await supabaseAdmin.storage
        .from('brand-characters')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signedNew?.signedUrl;
      if (!url) throw new Error('Sign URL failed');

      await supabaseAdmin.from('wardrobe_perspective_renders').upsert({
        user_id: user.id,
        avatar_id,
        theme_pack,
        outfit_id,
        outfit_label: outfit_label ?? p.label,
        perspective: p.id,
        image_url: url,
        storage_path: path,
      }, { onConflict: 'avatar_id,theme_pack,outfit_id,perspective' });

      return { perspective: p.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-wardrobe-perspectives] done', { ok, failed: failed.length });

    return new Response(JSON.stringify({ success: true, generated: ok, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[generate-wardrobe-perspectives] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
