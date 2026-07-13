// clone-preset-avatar
// Clones a system preset avatar into the caller's brand_characters list.
// - Copies portrait + reference image bytes into brand-characters/{user_id}/...
//   so RLS path constraints (user_id as first segment) are satisfied.
// - Inserts a new brand_characters row owned by the caller, with cloned_from_preset set.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function copyToUserBucket(
  admin: ReturnType<typeof createClient>,
  sourceUrl: string,
  destPath: string,
  contentType = 'image/png',
): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) throw new Error(`Failed to fetch source asset (${resp.status})`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from('brand-characters')
    .upload(destPath, bytes, { contentType, upsert: false });
  if (upErr) throw new Error(`Copy failed: ${upErr.message}`);
  const { data: signed } = await admin.storage
    .from('brand-characters')
    .createSignedUrl(destPath, 60 * 60 * 24 * 365 * 5);
  if (!signed?.signedUrl) throw new Error('Signed URL creation failed');
  return signed.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "clone-preset-avatar" });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error('Unauthorized');

    const { preset_id } = await req.json();
    if (!preset_id) throw new Error('preset_id required');

    const { data: preset, error: pErr } = await admin
      .from('system_preset_avatars')
      .select('id, name, role_label, description, portrait_url, reference_image_url, visual_identity_json, default_voice_id, is_active')
      .eq('id', preset_id)
      .single();
    if (pErr || !preset) throw new Error('Preset not found');
    if (!preset.is_active) throw new Error('Preset not available');

    const cloneId = crypto.randomUUID();
    let portraitUrl: string | null = null;
    let referenceUrl: string | null = null;
    let storagePath: string | null = null;

    if (preset.reference_image_url) {
      storagePath = `${user.id}/cloned/${cloneId}-ref.png`;
      referenceUrl = await copyToUserBucket(admin, preset.reference_image_url, storagePath);
    }
    if (preset.portrait_url) {
      const portraitPath = `${user.id}/portraits/${cloneId}.png`;
      portraitUrl = await copyToUserBucket(admin, preset.portrait_url, portraitPath);
    }

    const { data: row, error: insErr } = await admin
      .from('brand_characters')
      .insert({
        user_id: user.id,
        name: preset.name,
        description: preset.description ?? preset.role_label,
        reference_image_url: referenceUrl ?? portraitUrl ?? '',
        storage_path: storagePath,
        visual_identity_json: preset.visual_identity_json ?? {},
        portrait_url: portraitUrl,
        portrait_mode: portraitUrl ? 'auto_default_outfit' : null,
        default_voice_id: preset.default_voice_id,
        cloned_from_preset: preset.id,
      })
      .select()
      .single();
    if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);

    return new Response(JSON.stringify({ success: true, character: row }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[clone-preset-avatar] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
