// generate-avatar-wardrobe
// Generates 4 locked-identity outfit variants for a brand_character via Gemini Image.
// Inserts rows into avatar_wardrobe_variants. Idempotent per (avatar_id, outfit_id).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

type Outfit = { id: string; label: string; modifier: string };
type ThemePack = 'lifestyle' | 'historical' | 'fantasy' | 'scifi' | 'sport' | 'business';

const THEME_PACKS: Record<ThemePack, Outfit[]> = {
  lifestyle: [
    { id: 'casual', label: 'Casual', modifier: 'casual everyday outfit: well-fitted t-shirt or sweater, jeans, sneakers, relaxed natural styling' },
    { id: 'formal', label: 'Formal', modifier: 'formal business attire: tailored suit or blazer with crisp shirt, refined and polished, professional styling' },
    { id: 'action', label: 'Action', modifier: 'athletic action wear: technical sportswear, performance fabric, dynamic and ready-to-move styling' },
    { id: 'brand', label: 'Brand', modifier: 'on-brand outfit in clean monochrome neutrals (white, black, gray) with a single accent piece, modern minimal styling' },
  ],
  historical: [
    { id: 'knight', label: 'Knight', modifier: 'medieval knight in full polished steel plate armor, chainmail, heraldic surcoat, leather gauntlets, historically accurate' },
    { id: 'roman', label: 'Roman Legionary', modifier: 'Roman legionary uniform: lorica segmentata armor, red tunic, military sandals (caligae), gladius at belt, historically accurate' },
    { id: 'viking', label: 'Viking', modifier: 'Viking warrior outfit: layered wool tunic, leather harness with bronze fittings, fur mantle, braided belt, rugged historically accurate styling' },
    { id: 'edwardian', label: 'Edwardian', modifier: 'Edwardian-era formal attire: tailored three-piece suit with waistcoat and pocket watch (or long lace-trimmed dress for feminine subjects), elegant 1900s styling' },
  ],
  fantasy: [
    { id: 'wizard', label: 'Wizard', modifier: 'high-fantasy wizard robes in deep blue and gold, embroidered runes, hooded cloak, leather satchel and wooden staff' },
    { id: 'elven-ranger', label: 'Elven Ranger', modifier: 'elven ranger outfit: forest-green leather armor with silver filigree, hooded cloak, quiver of arrows, elegant high-fantasy styling' },
    { id: 'dark-knight', label: 'Dark Knight', modifier: 'dark fantasy knight: blackened plate armor with crimson trim, tattered cape, ornate pauldrons, brooding and cinematic' },
    { id: 'royal', label: 'Royal', modifier: 'royal coronation attire: ermine-trimmed velvet robe, embroidered gold brocade tunic or gown, jeweled crown, regal and opulent' },
  ],
  scifi: [
    { id: 'astronaut', label: 'Astronaut', modifier: 'modern white astronaut spacesuit (EVA style) with helmet held under arm, NASA-style patches, photorealistic spacefaring outfit' },
    { id: 'cyberpunk', label: 'Cyberpunk', modifier: 'cyberpunk streetwear: oversized techwear jacket with reflective panels, neon-trim cargo pants, chunky boots, LED accent piece, gritty future styling' },
    { id: 'mech-pilot', label: 'Mech Pilot', modifier: 'sci-fi mech pilot suit: armored flight suit with hardpoints, helmet under arm, utility harness, military-industrial future styling' },
    { id: 'holo-suit', label: 'Holo Suit', modifier: 'sleek futuristic holo-suit: form-fitting matte composite armor with subtle glowing accent lines, minimalist clean future styling' },
  ],
  sport: [
    { id: 'football', label: 'Football', modifier: 'professional football (soccer) kit: team jersey, shorts, knee-high socks, cleats, crisp athletic styling' },
    { id: 'basketball', label: 'Basketball', modifier: 'professional basketball uniform: sleeveless jersey and matching shorts, high-top sneakers, sweatband, crisp athletic styling' },
    { id: 'tennis', label: 'Tennis', modifier: 'classic tennis whites: collared polo shirt and white shorts or pleated skirt, tennis shoes, holding a racquet, clean athletic styling' },
    { id: 'mma', label: 'MMA Fighter', modifier: 'MMA fight gear: shirtless or rashguard top, fight shorts, fingerless gloves, hand wraps, athletic and intense' },
  ],
  business: [
    { id: 'executive-suit', label: 'Executive Suit', modifier: 'tailored dark navy two-piece business suit with crisp white dress shirt, silk tie or silk neck scarf, polished leather shoes, premium boardroom executive styling, gender-appropriate cut matching the subject' },
    { id: 'smart-casual', label: 'Smart Casual', modifier: 'modern smart-casual office look: fitted unstructured blazer over a clean white shirt or blouse, dark chinos or tailored trousers, leather loafers, no tie, contemporary startup-office styling, gender-appropriate cut' },
    { id: 'power-blazer', label: 'Power Blazer', modifier: 'structured charcoal power blazer with statement lapels over a fitted black turtleneck, slim tailored trousers, polished ankle boots, confident keynote-stage styling, gender-appropriate cut' },
    { id: 'founder-hoodie', label: 'Founder Hoodie', modifier: 'premium minimal heather-grey hoodie under an unstructured wool blazer, dark slim jeans, clean white sneakers, modern Silicon Valley founder aesthetic, gender-appropriate cut' },
  ],
};

const VALID_PACKS = new Set<ThemePack>(['lifestyle', 'historical', 'fantasy', 'scifi', 'sport', 'business']);

const IDENTITY_LOCK =
  'CRITICAL: Preserve the EXACT face, age, skin tone, hair style, hair color, eye color, facial features and body proportions of the reference person. Do not alter the face or hair. Only the clothing and accessories change. Full-body, head-to-toe framing on a soft neutral studio background. Photorealistic.';

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

    const body = await req.json().catch(() => ({}));
    const { avatar_id } = body;
    const themePack: ThemePack = VALID_PACKS.has(body?.theme_pack) ? body.theme_pack : 'lifestyle';
    if (!avatar_id) throw new Error('avatar_id required');

    const OUTFITS = THEME_PACKS[themePack];

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

    console.log('[generate-avatar-wardrobe] start', { avatar_id, theme_pack: themePack, user_id: user.id });

    const results = await Promise.allSettled(OUTFITS.map(async (outfit) => {
      const prompt = `Restyle the same person wearing a ${outfit.modifier}. Soft neutral studio background, full-body head-to-toe framing, photorealistic. ${IDENTITY_LOCK} 3:4 portrait framing.`;
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
      const path = `${user.id}/wardrobe/${avatar_id}/${themePack}/${outfit.id}-${crypto.randomUUID()}.png`;
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
        avatar_id, theme_pack: themePack, outfit_id: outfit.id, label: outfit.label, image_url: url, storage_path: path,
      }, { onConflict: 'avatar_id,theme_pack,outfit_id' });

      return { outfit_id: outfit.id, url };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').map((r: any) => String(r.reason));
    console.log('[generate-avatar-wardrobe] done', { ok, failed: failed.length });

    return new Response(JSON.stringify({ success: true, theme_pack: themePack, generated: ok, failed }), {
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
