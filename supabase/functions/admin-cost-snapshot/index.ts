import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

// Pricing must mirror src/lib/cost/pricing.ts
const PRICING: Record<string, number> = {
  replicate: 0.0017,
  gemini: 0.0005,
  elevenlabs: 0.003,
  openai: 0.0015,
  'lovable-ai': 0.001,
  resend: 0.0004,
  stripe: 0,
};
const LAMBDA_PER_MINUTE = 0.0167;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin check
    const { data: adminRow } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!adminRow) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '7', 10) || 7, 1), 90);
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
    const prevSinceIso = new Date(Date.now() - days * 2 * 86400_000).toISOString();

    const admin = createClient(supabaseUrl, serviceKey);

    // Parallel queries
    const [providerRes, dcRes, vrRes, emailRes, prevProviderRes] = await Promise.all([
      admin.from('provider_quota_log')
        .select('provider, endpoint, success, response_time_ms, created_at')
        .gte('created_at', sinceIso)
        .limit(50_000),
      admin.from('director_cut_renders')
        .select('status, started_at, completed_at, created_at')
        .gte('created_at', sinceIso)
        .limit(10_000),
      admin.from('video_renders')
        .select('status, started_at, completed_at, created_at')
        .gte('created_at', sinceIso)
        .limit(10_000),
      admin.from('email_send_log')
        .select('id, status, created_at')
        .gte('created_at', sinceIso)
        .limit(10_000),
      admin.from('provider_quota_log')
        .select('provider')
        .gte('created_at', prevSinceIso)
        .lt('created_at', sinceIso)
        .limit(50_000),
    ]);

    const providerLogs = providerRes.data ?? [];
    const dcRenders = dcRes.data ?? [];
    const vrRenders = vrRes.data ?? [];
    const emails = emailRes.data ?? [];
    const prevProviderLogs = prevProviderRes.data ?? [];

    // Aggregate per-provider
    const byProvider = new Map<string, { calls: number; failures: number; totalMs: number }>();
    for (const r of providerLogs) {
      const p = r.provider ?? 'unknown';
      const cur = byProvider.get(p) ?? { calls: 0, failures: 0, totalMs: 0 };
      cur.calls += 1;
      if (r.success === false) cur.failures += 1;
      cur.totalMs += r.response_time_ms ?? 0;
      byProvider.set(p, cur);
    }

    const providerBreakdown = Array.from(byProvider.entries()).map(([provider, v]) => {
      const perCall = PRICING[provider] ?? 0;
      const estCostUSD = v.calls * perCall;
      return {
        provider,
        calls: v.calls,
        failures: v.failures,
        avg_response_ms: v.calls ? Math.round(v.totalMs / v.calls) : 0,
        est_cost_usd: Number(estCostUSD.toFixed(4)),
      };
    }).sort((a, b) => b.est_cost_usd - a.est_cost_usd);

    // Top endpoints (functions)
    const byEndpoint = new Map<string, { calls: number; totalMs: number; provider: string }>();
    for (const r of providerLogs) {
      const key = r.endpoint || 'unknown';
      const cur = byEndpoint.get(key) ?? { calls: 0, totalMs: 0, provider: r.provider ?? 'unknown' };
      cur.calls += 1;
      cur.totalMs += r.response_time_ms ?? 0;
      byEndpoint.set(key, cur);
    }
    const topEndpoints = Array.from(byEndpoint.entries())
      .map(([endpoint, v]) => {
        const perCall = PRICING[v.provider] ?? 0;
        return {
          endpoint,
          provider: v.provider,
          calls: v.calls,
          avg_response_ms: v.calls ? Math.round(v.totalMs / v.calls) : 0,
          est_cost_usd: Number((v.calls * perCall).toFixed(4)),
        };
      })
      .sort((a, b) => b.est_cost_usd - a.est_cost_usd)
      .slice(0, 5);

    // Lambda renders combined
    const allRenders = [...dcRenders, ...vrRenders];
    let lambdaSeconds = 0;
    let lambdaCount = 0;
    let lambdaActive = 0;
    for (const r of allRenders) {
      if (r.status === 'processing' || r.status === 'rendering' || r.status === 'queued') lambdaActive += 1;
      if (r.started_at && r.completed_at) {
        const dur = (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000;
        if (dur > 0 && dur < 3600) {
          lambdaSeconds += dur;
          lambdaCount += 1;
        }
      }
    }
    const lambdaMinutes = lambdaSeconds / 60;
    const lambdaCostUSD = lambdaMinutes * LAMBDA_PER_MINUTE;

    // Email cost
    const emailCount = emails.length;
    const emailCostUSD = emailCount * (PRICING.resend ?? 0);

    // Total cloud (excludes lovable-ai which is a separate $1 tier)
    const cloudCostUSD = providerBreakdown
      .filter((p) => p.provider !== 'lovable-ai')
      .reduce((sum, p) => sum + p.est_cost_usd, 0) + lambdaCostUSD + emailCostUSD;
    const aiCostUSD = providerBreakdown
      .filter((p) => p.provider === 'lovable-ai')
      .reduce((sum, p) => sum + p.est_cost_usd, 0);

    // Daily trend
    const dailyMap = new Map<string, { cloud: number; ai: number; calls: number }>();
    for (const r of providerLogs) {
      const day = (r.created_at ?? '').slice(0, 10);
      if (!day) continue;
      const cur = dailyMap.get(day) ?? { cloud: 0, ai: 0, calls: 0 };
      const perCall = PRICING[r.provider ?? ''] ?? 0;
      if (r.provider === 'lovable-ai') cur.ai += perCall;
      else cur.cloud += perCall;
      cur.calls += 1;
      dailyMap.set(day, cur);
    }
    const trend = Array.from(dailyMap.entries())
      .map(([date, v]) => ({
        date,
        cloud_usd: Number(v.cloud.toFixed(4)),
        ai_usd: Number(v.ai.toFixed(4)),
        calls: v.calls,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Forecast
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dailyAvgCloud = cloudCostUSD / days;
    const dailyAvgAi = aiCostUSD / days;
    const forecastCloudUSD = dailyAvgCloud * daysInMonth;
    const forecastAiUSD = dailyAvgAi * daysInMonth;
    const cloudPercent = (forecastCloudUSD / 25) * 100;
    const aiPercent = (forecastAiUSD / 1) * 100;

    // Spike detection
    const prevByProvider = new Map<string, number>();
    for (const r of prevProviderLogs) {
      prevByProvider.set(r.provider ?? 'unknown', (prevByProvider.get(r.provider ?? 'unknown') ?? 0) + 1);
    }
    const spikes = providerBreakdown
      .map((p) => {
        const prev = prevByProvider.get(p.provider) ?? 0;
        if (prev === 0) return null;
        const change = ((p.calls - prev) / prev) * 100;
        return { provider: p.provider, current: p.calls, previous: prev, change_percent: Math.round(change) };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.change_percent >= 50);

    // Alerts
    const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; message: string }> = [];
    if (cloudPercent >= 80) {
      alerts.push({ severity: 'critical', message: `Cloud-Verbrauch hochgerechnet bei ${cloudPercent.toFixed(0)}% des $25 Free-Tiers (~$${forecastCloudUSD.toFixed(2)}/Monat)` });
    } else if (cloudPercent >= 50) {
      alerts.push({ severity: 'warning', message: `Cloud-Verbrauch hochgerechnet bei ${cloudPercent.toFixed(0)}% — beobachten` });
    }
    if (aiPercent >= 80) {
      alerts.push({ severity: 'critical', message: `AI-Gateway-Verbrauch bei ${aiPercent.toFixed(0)}% des $1 Free-Tiers` });
    }
    if (lambdaActive >= 3) {
      alerts.push({ severity: 'warning', message: `Lambda-Kapazität voll: ${lambdaActive}/3 Renders aktiv` });
    }
    for (const s of spikes) {
      alerts.push({ severity: 'warning', message: `${s.provider}: +${s.change_percent}% API-Calls vs Vorperiode (${s.previous} → ${s.current})` });
    }
    if (alerts.length === 0) {
      alerts.push({ severity: 'info', message: 'Alle Kosten im grünen Bereich ✓' });
    }

    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      window_days: days,
      summary: {
        cloud_cost_usd: Number(cloudCostUSD.toFixed(4)),
        ai_cost_usd: Number(aiCostUSD.toFixed(4)),
        lambda_minutes: Number(lambdaMinutes.toFixed(2)),
        lambda_cost_usd: Number(lambdaCostUSD.toFixed(4)),
        lambda_render_count: lambdaCount,
        lambda_active_now: lambdaActive,
        email_count: emailCount,
        email_cost_usd: Number(emailCostUSD.toFixed(4)),
        forecast_cloud_usd: Number(forecastCloudUSD.toFixed(2)),
        forecast_ai_usd: Number(forecastAiUSD.toFixed(2)),
        cloud_percent_of_free: Number(cloudPercent.toFixed(1)),
        ai_percent_of_free: Number(aiPercent.toFixed(1)),
      },
      providers: providerBreakdown,
      top_endpoints: topEndpoints,
      trend,
      alerts,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin-cost-snapshot error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
