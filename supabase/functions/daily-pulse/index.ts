// Daily Pulse — one short morning email with yesterday's numbers.
// Runs via pg_cron at 06:00 UTC (08:00 Europe/Berlin). Sends even at zero,
// so silence becomes information instead of a gap.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { sendAdminEmail } from '../_shared/admin-mail.ts';
import { ADMIN_ALERT_EMAIL } from '../_shared/admin-config.ts';

const LAUNCH_DATE = '2026-07-26T00:00:00Z';
const GOLD = '#F5C76A';
const INK = '#050816';

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const since = new Date(now - day).toISOString();
    const prevSince = new Date(now - 2 * day).toISOString();

    const countSince = async (
      table: string,
      column: string,
      from: string,
      to?: string,
    ): Promise<number> => {
      let q = supabase.from(table).select('*', { count: 'exact', head: true }).gte(column, from);
      if (to) q = q.lt(column, to);
      const { count, error } = await q;
      if (error) {
        console.error(`[DAILY-PULSE] count ${table} failed:`, error.message);
        return 0;
      }
      return count ?? 0;
    };

    const [signups, signupsPrev, videos, videosPrev, events, totalUsers] = await Promise.all([
      countSince('profiles', 'created_at', since),
      countSince('profiles', 'created_at', prevSince, since),
      countSince('video_creations', 'created_at', since),
      countSince('video_creations', 'created_at', prevSince, since),
      countSince('app_events', 'occurred_at', since),
      countSince('profiles', 'created_at', '1970-01-01T00:00:00Z'),
    ]);

    const { data: payingRows } = await supabase
      .from('profiles')
      .select('id')
      .eq('subscription_status', 'active');
    const payingCount = payingRows?.length ?? 0;

    const daysSinceLaunch = Math.max(
      0,
      Math.floor((now - new Date(LAUNCH_DATE).getTime()) / day),
    );

    const { data: lastSignup } = await supabase
      .from('profiles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSinceLastSignup = lastSignup?.created_at
      ? Math.floor((now - new Date(lastSignup.created_at as string).getTime()) / day)
      : null;

    const delta = (a: number, b: number) => {
      const d = a - b;
      if (d === 0) return '±0';
      return d > 0 ? `+${d}` : String(d);
    };

    const rows: Array<[string, string]> = [
      ['Registrierungen', `${signups} (${delta(signups, signupsPrev)} ggü. Vortag)`],
      ['Erstellte Videos', `${videos} (${delta(videos, videosPrev)} ggü. Vortag)`],
      ['App-Ereignisse', String(events)],
      ['Zahlende Kunden', String(payingCount)],
      ['Nutzer gesamt', String(totalUsers)],
    ];

    const headline =
      signups === 0
        ? `Tag ${daysSinceLaunch} seit Launch — keine neue Registrierung`
        : `Tag ${daysSinceLaunch} seit Launch — ${signups} neue Registrierung${signups === 1 ? '' : 'en'}`;

    const note =
      daysSinceLastSignup != null && signups === 0
        ? `Letzte Registrierung vor ${daysSinceLastSignup} Tag${daysSinceLastSignup === 1 ? '' : 'en'}.`
        : '';

    const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,sans-serif">
      <div style="max-width:520px;margin:0 auto;padding:28px 24px">
        <div style="display:inline-block;background:${GOLD};color:${INK};font-size:11px;font-weight:700;letter-spacing:1px;padding:4px 10px;border-radius:999px;margin-bottom:14px">DAILY PULSE</div>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${INK}">${headline}</h1>
        <table style="border-collapse:collapse;width:100%">
          ${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:6px 14px 6px 0;color:#8b8b8b;font-size:13px;white-space:nowrap">${k}</td><td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600">${v}</td></tr>`,
            )
            .join('')}
        </table>
        ${note ? `<p style="margin:18px 0 0;font-size:13px;color:#8b8b8b">${note}</p>` : ''}
        <p style="margin:24px 0 0;font-size:12px;color:#9a9a9a">AdTool AI · Launch Radar</p>
      </div></body></html>`;

    const stamp = new Date(now).toISOString().slice(0, 10);
    const result = await sendAdminEmail({
      to: ADMIN_ALERT_EMAIL,
      subject: `Daily Pulse · ${headline}`,
      html,
      label: `daily_pulse_${stamp}`,
    });

    if (!result.ok) {
      console.error('[DAILY-PULSE] email failed:', result.error);
    }


    return json({ ok: true, signups, videos, events, payingCount, daysSinceLaunch });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[DAILY-PULSE] error:', msg);
    return json({ error: msg }, 500);
  }
});
