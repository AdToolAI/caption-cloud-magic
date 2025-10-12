import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting automatic metrics sync cron job...');

    // Get all active social connections
    const { data: connections, error: connectionsError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('status', 'active');

    if (connectionsError) {
      console.error('Error fetching connections:', connectionsError);
      throw connectionsError;
    }

    console.log(`Found ${connections?.length || 0} active connections to sync`);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Sync metrics for each connection
    for (const connection of connections || []) {
      try {
        console.log(`Syncing metrics for ${connection.provider} - ${connection.account_id}`);
        
        const { error: syncError } = await supabase.functions.invoke('sync-social-posts', {
          body: {
            provider: connection.provider,
            connectionId: connection.id
          }
        });

        if (syncError) {
          console.error(`Sync failed for connection ${connection.id}:`, syncError);
          results.failed++;
          results.errors.push(`${connection.provider}: ${syncError.message}`);
        } else {
          results.success++;
          
          // Update last_sync_at
          await supabase
            .from('social_connections')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', connection.id);
        }
      } catch (error) {
        console.error(`Error syncing connection ${connection.id}:`, error);
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${connection.provider}: ${errorMessage}`);
      }
    }

    console.log('Cron job completed:', results);

    return new Response(
      JSON.stringify({
        message: 'Metrics sync completed',
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Cron job error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to sync metrics automatically'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});