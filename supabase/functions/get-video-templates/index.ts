import { createClient } from 'npm:@supabase/supabase-js@2';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { templates: [] });
  }


  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { category } = await req.json().catch(() => ({}));

    let query = supabase
      .from('video_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
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
    console.error('Get templates error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
