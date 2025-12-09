import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiagnosticResult {
  category: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  action?: string;
  actionLabel?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const diagnostics: DiagnosticResult[] = [];
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Check Social Connections
    const { data: connections, error: connError } = await supabaseAdmin
      .from('social_connections')
      .select('provider, account_name, token_expires_at, last_sync_at, auto_sync_enabled')
      .eq('user_id', user.id);

    if (!connError && connections) {
      const expiredConnections = connections.filter(c => {
        if (!c.token_expires_at) return false;
        return new Date(c.token_expires_at) < now;
      });

      const expiringSoonConnections = connections.filter(c => {
        if (!c.token_expires_at) return false;
        const expiresAt = new Date(c.token_expires_at);
        return expiresAt >= now && expiresAt < sevenDaysFromNow;
      });

      if (expiredConnections.length > 0) {
        expiredConnections.forEach(c => {
          diagnostics.push({
            category: 'connections',
            status: 'error',
            message: `${c.provider} Token ist abgelaufen! Bitte neu verbinden.`,
            action: `/settings?reconnect=${c.provider}`,
            actionLabel: `${c.provider} neu verbinden`
          });
        });
      }

      if (expiringSoonConnections.length > 0) {
        expiringSoonConnections.forEach(c => {
          const daysLeft = Math.ceil((new Date(c.token_expires_at!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          diagnostics.push({
            category: 'connections',
            status: 'warning',
            message: `${c.provider} Token läuft in ${daysLeft} Tagen ab.`,
            action: `/settings?reconnect=${c.provider}`,
            actionLabel: `Jetzt erneuern`
          });
        });
      }

      if (connections.length === 0) {
        diagnostics.push({
          category: 'connections',
          status: 'warning',
          message: 'Keine Social Media Accounts verbunden. Verbinde Accounts um Posts zu veröffentlichen.',
          action: '/settings',
          actionLabel: 'Accounts verbinden'
        });
      }
    }

    // 2. Check Credit Balance
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance, plan_code, monthly_credits')
      .eq('user_id', user.id)
      .single();

    if (!walletError && wallet) {
      if (wallet.balance <= 0) {
        diagnostics.push({
          category: 'credits',
          status: 'error',
          message: 'Keine Credits mehr vorhanden! Du kannst keine KI-Features nutzen.',
          action: '/credits',
          actionLabel: 'Credits aufladen'
        });
      } else if (wallet.balance < 10) {
        diagnostics.push({
          category: 'credits',
          status: 'warning',
          message: `Nur noch ${wallet.balance} Credits übrig. Bald aufladen!`,
          action: '/credits',
          actionLabel: 'Credits kaufen'
        });
      }
    }

    // 3. Check Recent Failed Renders
    const { data: recentRenders, error: renderError } = await supabaseAdmin
      .from('director_cut_renders')
      .select('id, status, error_message, created_at')
      .eq('user_id', user.id)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(3);

    if (!renderError && recentRenders && recentRenders.length > 0) {
      diagnostics.push({
        category: 'rendering',
        status: 'warning',
        message: `${recentRenders.length} kürzlich fehlgeschlagene Video-Renders. Überprüfe deine Quelldateien.`,
        action: '/directors-cut',
        actionLabel: 'Director\'s Cut öffnen'
      });
    }

    // 3b. Check Active Rendering Jobs
    const { data: activeRenders } = await supabaseAdmin
      .from('director_cut_renders')
      .select('id, status, created_at, progress')
      .eq('user_id', user.id)
      .eq('status', 'rendering')
      .order('created_at', { ascending: false })
      .limit(5);

    if (activeRenders && activeRenders.length > 0) {
      const oldestRender = activeRenders[0];
      const minutesRunning = Math.floor((now.getTime() - new Date(oldestRender.created_at).getTime()) / 60000);
      
      if (minutesRunning > 20) {
        diagnostics.push({
          category: 'rendering',
          status: 'warning',
          message: `Video-Rendering läuft seit ${minutesRunning} Minuten. Bei Problemen Seite neu laden.`,
          action: '/directors-cut',
          actionLabel: 'Status prüfen'
        });
      } else {
        diagnostics.push({
          category: 'rendering',
          status: 'ok',
          message: `${activeRenders.length} Video${activeRenders.length > 1 ? 's werden' : ' wird'} gerendert (${minutesRunning} Min.)`,
        });
      }
    }

    // 4. Check Scheduled Posts without connected platforms
    const { data: scheduledPosts } = await supabaseAdmin
      .from('calendar_events')
      .select('id, channels, status')
      .eq('status', 'scheduled')
      .or(`created_by.eq.${user.id},owner_id.eq.${user.id}`)
      .limit(10);

    if (scheduledPosts && scheduledPosts.length > 0 && connections) {
      const connectedPlatforms = connections.map(c => c.provider.toLowerCase());
      const postsWithMissingPlatforms = scheduledPosts.filter(post => {
        return post.channels?.some((channel: string) => !connectedPlatforms.includes(channel.toLowerCase()));
      });

      if (postsWithMissingPlatforms.length > 0) {
        diagnostics.push({
          category: 'calendar',
          status: 'warning',
          message: `${postsWithMissingPlatforms.length} geplante Posts haben nicht-verbundene Plattformen.`,
          action: '/calendar',
          actionLabel: 'Kalender prüfen'
        });
      }
    }

    // Summary
    const errorCount = diagnostics.filter(d => d.status === 'error').length;
    const warningCount = diagnostics.filter(d => d.status === 'warning').length;

    return new Response(JSON.stringify({
      success: true,
      diagnostics,
      summary: {
        totalIssues: diagnostics.length,
        errors: errorCount,
        warnings: warningCount,
        status: errorCount > 0 ? 'critical' : warningCount > 0 ? 'attention_needed' : 'healthy'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Diagnose error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
