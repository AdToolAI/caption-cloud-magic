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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Support both formats: { template, mode } OR direct fields
    const body = await req.json();
    const template = body.template || body;
    const mode = body.mode || (body.id ? 'update' : 'create');

    // Build template_config from scenes or use existing
    const template_config = template.template_config || {
      scenes: template.scenes || [],
      background_music: template.background_music || null,
      transitions: template.transitions || [],
    };

    // Ensure both platform (singular) and platforms (array) are set correctly
    const platforms = Array.isArray(template.platforms) 
      ? template.platforms 
      : (template.platform ? [template.platform] : ['instagram']);
    const platform = platforms[0] || 'instagram';

    const templateData = {
      name: template.name,
      description: template.description || '',
      content_type: template.content_type || 'ad',
      category: template.category || 'custom',
      platform: platform,
      platforms: platforms,
      aspect_ratios: template.aspect_ratios || [template.aspect_ratio || '9:16'],
      duration_min: template.duration_min || template.duration_range?.min || 10,
      duration_max: template.duration_max || template.duration_range?.max || 30,
      template_data: template.template_data || template_config || {},
      customizable_fields: template.customizable_fields || [],
      ai_features: template.ai_features || [],
      is_public: template.is_public ?? false,
      created_by: user.id,
      user_id: user.id,
    };

    if (mode === 'create') {
      const { data, error } = await supabase
        .from('content_templates')
        .insert(templateData)
        .select()
        .single();

      if (error) throw error;
      
      return new Response(
        JSON.stringify({ ok: true, template: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const { data, error } = await supabase
        .from('content_templates')
        .update(templateData)
        .eq('id', template.id)
        .eq('created_by', user.id)
        .select()
        .single();

      if (error) throw error;
      
      return new Response(
        JSON.stringify({ ok: true, template: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Save template error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
