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

    const { template, mode } = await req.json();

    // Build template_config from scenes
    const template_config = {
      scenes: template.scenes || [],
      background_music: template.background_music || null,
      transitions: template.transitions || [],
    };

    const templateData = {
      name: template.name,
      description: template.description,
      content_type: template.content_type,
      category: template.category,
      platforms: template.platforms,
      aspect_ratios: template.aspect_ratios,
      duration_range: template.duration_range,
      template_config,
      customizable_fields: template.customizable_fields,
      ai_script_enabled: template.ai_script_enabled,
      ai_voiceover_enabled: template.ai_voiceover_enabled,
      
      // User-created templates
      is_user_created: true,
      created_by: user.id,
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
