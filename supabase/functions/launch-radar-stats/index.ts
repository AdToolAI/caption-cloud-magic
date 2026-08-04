// Launch Radar stats — admin-only funnel snapshot for the earliest traction.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LAUNCH_DATE = '2026-07-26T00:00:00Z';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) return json({ error: 'Admin access required' }, 403);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const since24h = new Date(now - day).toISOString();
    const since7d = new Date(now - 7 * day).toISOString();

    const count = async (table: string, column: string, from?: string) => {
      let q = admin.from(table).select('*', { count: 'exact', head: true });
      if (from) q = q.gte(column, from);
      const { count: c } = await q;
      return c ?? 0;
    };

    const [
      usersTotal,
      users24h,
      users7d,
      videos24h,
      videos7d,
      events24h,
    ] = await Promise.all([
      count('profiles', 'created_at'),
      count('profiles', 'created_at', since24h),
      count('profiles', 'created_at', since7d),
      count('video_creations', 'created_at', since24h),
      count('video_creations', 'created_at', since7d),
      count('app_events', 'occurred_at', since24h),
    ]);

    const { data: payingRows } = await admin
      .from('profiles')
      .select('id')
      .eq('subscription_status', 'active');

    const { data: milestones } = await admin
      .from('launch_milestones')
      .select('key, label, achieved_at')
      .order('achieved_at', { ascending: false })
      .limit(10);

    const { data: recentSignups } = await admin
      .from('profiles')
      .select('email, created_at, plan, language')
      .order('created_at', { ascending: false })
      .limit(8);

    const daysSinceLaunch = Math.max(
      0,
      Math.floor((now - new Date(LAUNCH_DATE).getTime()) / day),
    );

    return json({
      generated_at: new Date(now).toISOString(),
      days_since_launch: daysSinceLaunch,
      users_total: usersTotal,
      users_24h: users24h,
      users_7d: users7d,
      videos_24h: videos24h,
      videos_7d: videos7d,
      events_24h: events24h,
      paying_customers: payingRows?.length ?? 0,
      milestones: milestones ?? [],
      recent_signups: recentSignups ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[LAUNCH-RADAR-STATS] error:', msg);
    return json({ error: msg }, 500);
  }
});
