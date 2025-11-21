import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧹 Starting cache cleanup...');

    // Get active cache policy
    const { data: policy } = await supabase
      .from('cache_policies')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!policy) {
      console.log('❌ No active cache policy found');
      return new Response(
        JSON.stringify({ error: 'No active cache policy' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const maxAgeDays = policy.max_cache_age_days || 30;
    const minHitCount = policy.min_hit_count || 2;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    // Find expired or low-hit cache entries
    const { data: toDelete, error: fetchError } = await supabase
      .from('render_asset_cache')
      .select('id, content_hash, hit_count, created_at')
      .or(`expires_at.lt.${new Date().toISOString()},and(hit_count.lt.${minHitCount},created_at.lt.${cutoffDate.toISOString()})`);

    if (fetchError) {
      throw new Error(`Failed to fetch cache entries: ${fetchError.message}`);
    }

    if (!toDelete || toDelete.length === 0) {
      console.log('✅ No cache entries to clean');
      return new Response(
        JSON.stringify({ success: true, deletedCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete expired entries
    const idsToDelete = toDelete.map(c => c.id);
    const { error: deleteError } = await supabase
      .from('render_asset_cache')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      throw new Error(`Failed to delete cache entries: ${deleteError.message}`);
    }

    console.log(`✅ Cleaned ${toDelete.length} cache entries`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        deletedCount: toDelete.length,
        details: toDelete.map(c => ({ hash: c.content_hash, hits: c.hit_count }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error during cache cleanup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
