// repair-brand-character-urls
// Re-signs reference_image_url (and portrait_url where possible) for all brand_characters
// of the calling user with long-lived (~5y) URLs. Idempotent.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

// Try to extract the storage object path from an existing signed URL.
// Pattern: /storage/v1/object/sign/<bucket>/<path>?token=...
function extractPathFromSignedUrl(url: string | null, bucket: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/sign/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized');

    const { data: characters, error: chErr } = await supabaseAdmin
      .from('brand_characters')
      .select('id, user_id, reference_image_url, portrait_url, storage_path')
      .eq('user_id', user.id);
    if (chErr) throw chErr;

    let repaired = 0;
    let failed = 0;
    const details: any[] = [];

    for (const c of characters ?? []) {
      const update: Record<string, string> = {};

      // reference_image_url
      const refPath =
        c.storage_path || extractPathFromSignedUrl(c.reference_image_url, 'brand-characters');
      if (refPath) {
        const { data: signed, error } = await supabaseAdmin.storage
          .from('brand-characters')
          .createSignedUrl(refPath, FIVE_YEARS);
        if (!error && signed?.signedUrl) {
          update.reference_image_url = signed.signedUrl;
          if (!c.storage_path) update.storage_path = refPath;
        }
      }

      // portrait_url (optional)
      const portraitPath = extractPathFromSignedUrl(c.portrait_url, 'brand-characters');
      if (portraitPath) {
        const { data: signed } = await supabaseAdmin.storage
          .from('brand-characters')
          .createSignedUrl(portraitPath, FIVE_YEARS);
        if (signed?.signedUrl) update.portrait_url = signed.signedUrl;
      }

      if (Object.keys(update).length === 0) {
        failed++;
        details.push({ id: c.id, status: 'no_path' });
        continue;
      }

      const { error: upErr } = await supabaseAdmin
        .from('brand_characters')
        .update(update)
        .eq('id', c.id);
      if (upErr) {
        failed++;
        details.push({ id: c.id, status: 'update_failed', error: upErr.message });
      } else {
        repaired++;
        details.push({ id: c.id, status: 'ok', fields: Object.keys(update) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: characters?.length ?? 0, repaired, failed, details }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[repair-brand-character-urls] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
