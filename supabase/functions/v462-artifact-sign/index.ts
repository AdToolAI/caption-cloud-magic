import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * V462 — Audit-Helfer: signiert Lip-Sync-Artefakte (private Buckets) für
 * Plattform-Admins, damit Success-vs-NOOP-Vergleiche ohne Rerender möglich sind.
 * Reiner Lesezugriff: nur createSignedUrl, keine Schreibpfade.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'missing_authorization' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'invalid_token' }, 401);

    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const bucket = typeof body?.bucket === 'string' ? body.bucket : '';
    const paths: string[] = Array.isArray(body?.paths)
      ? body.paths.filter((p: unknown) => typeof p === 'string').slice(0, 50)
      : [];
    if (!bucket || paths.length === 0) return json({ error: 'bucket_and_paths_required' }, 400);

    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, 3600);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, urls: data });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
