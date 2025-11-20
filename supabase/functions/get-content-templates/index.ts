import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { content_type, category, platform, aspect_ratio } = await req.json().catch(() => ({}));

    let query = supabase
      .from('content_templates')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('usage_count', { ascending: false });

    if (content_type) {
      query = query.eq('content_type', content_type);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (platform) {
      query = query.contains('platforms', [platform]);
    }
    if (aspect_ratio) {
      query = query.contains('aspect_ratios', [aspect_ratio]);
    }

    const { data: templates, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch templates: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        templates: templates || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get content templates error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
