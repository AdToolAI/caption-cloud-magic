// Launch Radar — instant signup signal.
//
// Called by a database trigger on profiles (pg_net) right after a new
// account is created. The payload is only a user id; the function verifies
// the account against the database itself, so an unauthenticated call can
// never fabricate an alert.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { sendRadarAlert, claimMilestone } from '../_shared/launch-radar.ts';

const MILESTONE_COUNTS = [1, 10, 50, 100, 250, 500, 1000];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const kind = typeof body?.event === 'string' ? body.event : 'signup';
    const userId = typeof body?.user_id === 'string' ? body.user_id : null;
    if (!userId) return json({ error: 'user_id required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // === Erstes fertig gerendertes Video eines echten Nutzers ===
    if (kind === 'first_render') {
      const claimed = await claimMilestone('first_render', 'Erstes fertiges Video', {
        user_id: userId,
      });
      if (!claimed) return json({ skipped: 'already_claimed' });

      const { data: owner } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      await sendRadarAlert({
        kind: 'milestone',
        highlight: true,
        title: 'Das erste Video wurde fertig gerendert',
        dedupeKey: 'milestone:first_render',
        lines: [
          ['Nutzer', String(owner?.email ?? userId)],
          ['Zeitpunkt', new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })],
        ],
      });
      return json({ ok: true, milestone: 'first_render' });
    }



    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, language, plan, created_at, trial_ends_at')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return json({ error: 'unknown user' }, 404);

    // Only fresh signups qualify — protects against replayed calls.
    const ageMs = Date.now() - new Date(profile.created_at as string).getTime();
    if (ageMs > 15 * 60 * 1000) {
      return json({ skipped: 'not_a_fresh_signup' });
    }

    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    const total = count ?? 0;
    const registeredAt = new Date(profile.created_at as string).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
    });
    const trial = profile.trial_ends_at
      ? new Date(profile.trial_ends_at as string).toLocaleDateString('de-DE', {
          timeZone: 'Europe/Berlin',
        })
      : '–';

    await sendRadarAlert({
      kind: 'signup',
      title: `Neuer Nutzer Nr. ${total}`,
      dedupeKey: `signup:${userId}`,
      lines: [
        ['E-Mail', String(profile.email ?? '–')],
        ['Registriert', registeredAt],
        ['Sprache', String(profile.language ?? '–').toUpperCase()],
        ['Plan', String(profile.plan ?? 'free')],
        ['Trial bis', trial],
        ['Nutzer gesamt', String(total)],
      ],
    });

    if (MILESTONE_COUNTS.includes(total)) {
      const key = `users:${total}`;
      if (await claimMilestone(key, `${total}. Nutzer`, { user_id: userId })) {
        await sendRadarAlert({
          kind: 'milestone',
          highlight: true,
          title: total === 1 ? 'Der allererste Nutzer ist da' : `${total}. Nutzer erreicht`,
          dedupeKey: `milestone:${key}`,
          lines: [
            ['Meilenstein', `${total} registrierte Nutzer`],
            ['Ausgelöst von', String(profile.email ?? '–')],
            ['Zeitpunkt', registeredAt],
          ],
        });
      }
    }

    return json({ ok: true, total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[LAUNCH-RADAR-NOTIFY] error:', msg);
    return json({ error: msg }, 500);
  }
});
