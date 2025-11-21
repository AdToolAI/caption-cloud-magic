import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple MD5-like hash function
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

serve(async (req) => {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { templateId, config, engine } = await req.json();

    if (!templateId || !config || !engine) {
      throw new Error('Template ID, config, and engine are required');
    }

    // Generate content hash
    const hashInput = JSON.stringify({ templateId, config, engine });
    const contentHash = simpleHash(hashInput);

    console.log(`🔍 Checking cache for hash: ${contentHash}`);

    // Check cache
    const { data: cached, error: cacheError } = await supabase
      .from('render_asset_cache')
      .select('*')
      .eq('content_hash', contentHash)
      .not('expires_at', 'lt', new Date().toISOString())
      .maybeSingle();

    if (cacheError) {
      throw new Error(`Cache lookup failed: ${cacheError.message}`);
    }

    if (cached) {
      // Update hit count and last accessed
      await supabase
        .from('render_asset_cache')
        .update({
          hit_count: (cached.hit_count || 0) + 1,
          last_accessed_at: new Date().toISOString()
        })
        .eq('id', cached.id);

      console.log(`✅ Cache HIT for user ${user.id}: ${cached.id}`);

      return new Response(
        JSON.stringify({
          cached: true,
          url: cached.storage_path,
          savedCredits: engine === 'remotion' ? 5 : 10,
          cacheId: cached.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`❌ Cache MISS for user ${user.id}`);

    return new Response(
      JSON.stringify({
        cached: false,
        contentHash, // Return for saving after render
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error checking cache:', error);
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
