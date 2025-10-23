import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const postUrn = url.searchParams.get('post_urn');

    if (!postUrn) {
      throw new Error('post_urn parameter is required');
    }

    // Get LinkedIn connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'linkedin')
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      throw new Error('LinkedIn account not connected');
    }

    // Decrypt access token
    const accessToken = await decryptToken(connection.access_token_hash);

    // Fetch social actions (metrics)
    const metricsResponse = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': '202405',
      },
    });

    if (!metricsResponse.ok) {
      const errorData = await metricsResponse.json();
      throw new Error(`Failed to fetch metrics: ${JSON.stringify(errorData)}`);
    }

    const metricsData = await metricsResponse.json();
    
    const metrics = {
      likes: metricsData.likesSummary?.totalLikes || 0,
      comments: metricsData.commentsSummary?.totalFirstLevelComments || 0,
      reshares: metricsData.sharesSummary?.totalShares || 0,
    };

    // Update post_metrics table
    const { error: updateError } = await supabase
      .from('post_metrics')
      .upsert({
        user_id: user.id,
        platform: 'linkedin',
        platform_post_id: postUrn,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.reshares,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'platform,platform_post_id',
      });

    if (updateError) {
      console.warn('⚠️ Failed to update post_metrics:', updateError);
    }

    console.log(`✅ LinkedIn metrics fetched for ${postUrn}:`, metrics);

    return new Response(
      JSON.stringify({
        ok: true,
        metrics,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ LinkedIn metrics error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'LINKEDIN_METRICS_FAILED',
          message: error.message,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
