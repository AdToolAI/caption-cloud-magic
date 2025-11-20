import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateContentVideoRequest {
  template_id: string;
  content_type: string;
  customizations: Record<string, string | number | boolean>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { template_id, content_type, customizations }: CreateContentVideoRequest = await req.json();

    if (!template_id || !content_type || !customizations) {
      throw new Error('Missing required fields: template_id, content_type, customizations');
    }

    console.log('[create-content-video] Request:', {
      template_id,
      content_type,
      customization_keys: Object.keys(customizations),
    });

    // Fetch template from content_templates
    const { data: template, error: templateError } = await supabase
      .from('content_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      console.error('[create-content-video] Template not found:', templateError);
      throw new Error('Template nicht gefunden');
    }

    // Validate required fields
    const requiredFields = template.customizable_fields?.filter((f: any) => f.required) || [];
    for (const field of requiredFields) {
      if (!customizations[field.key]) {
        console.error('[create-content-video] Missing required field:', {
          field_key: field.key,
          field_label: field.label,
          available_fields: Object.keys(customizations),
        });
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'MISSING_REQUIRED_FIELD',
            message: `Fehlendes Pflichtfeld: ${field.label}`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check credits (1 credit for Content Studio videos)
    const creditsRequired = 1;
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!wallet || wallet.balance < creditsRequired) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'INSUFFICIENT_CREDITS',
          message: `Nicht genügend Credits. ${creditsRequired} Credit benötigt für Video-Generierung.`
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct credits
    await supabase
      .from('wallets')
      .update({ balance: wallet.balance - creditsRequired })
      .eq('user_id', user.id);

    // Create content_project record (without render_id yet)
    const { data: project, error: projectError } = await supabase
      .from('content_projects')
      .insert({
        user_id: user.id,
        template_id,
        content_type,
        project_name: customizations.PROJECT_NAME || 'Neues Video',
        customizations,
        status: 'rendering',
        credits_used: creditsRequired,
        export_formats: { mp4: true },
        export_aspect_ratios: [template.aspect_ratio || '16:9']
      })
      .select()
      .single();

    if (projectError) {
      console.error('[create-content-video] Failed to create project:', projectError);
      // Refund credits on error
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance })
        .eq('user_id', user.id);
      throw new Error(`Fehler beim Erstellen des Projekts: ${projectError.message}`);
    }

    // Replace placeholders in template config
    let configStr = JSON.stringify(template.template_config);
    for (const [key, value] of Object.entries(customizations)) {
      const placeholder = `{{${key}}}`;
      const escaped = JSON.stringify(String(value)).slice(1, -1);
      configStr = configStr.replaceAll(placeholder, escaped);
    }

    let shotstackConfig: any;
    try {
      shotstackConfig = JSON.parse(configStr);
    } catch (parseError) {
      console.error('[create-content-video] Failed to parse config:', parseError);
      // Update project to failed and refund
      await supabase
        .from('content_projects')
        .update({ status: 'failed' })
        .eq('id', project.id);
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance })
        .eq('user_id', user.id);
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'TEMPLATE_PARSE_ERROR',
          message: 'Das Template konnte nicht verarbeitet werden.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Shotstack API
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackApiKey) {
      console.error('[create-content-video] SHOTSTACK_API_KEY not configured');
      await supabase
        .from('content_projects')
        .update({ status: 'failed' })
        .eq('id', project.id);
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance })
        .eq('user_id', user.id);
      throw new Error('Video-Rendering-Service nicht konfiguriert');
    }

    console.log('[create-content-video] Calling Shotstack API...');
    const shotstackResponse = await fetch('https://api.shotstack.io/v1/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': shotstackApiKey
      },
      body: JSON.stringify(shotstackConfig)
    });

    if (!shotstackResponse.ok) {
      const errorText = await shotstackResponse.text();
      console.error('[create-content-video] Shotstack API error:', errorText);
      await supabase
        .from('content_projects')
        .update({ status: 'failed' })
        .eq('id', project.id);
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance })
        .eq('user_id', user.id);
      throw new Error('Video-Rendering fehlgeschlagen');
    }

    const shotstackData = await shotstackResponse.json();
    const renderId = shotstackData.response?.id;

    if (!renderId) {
      console.error('[create-content-video] No render ID in response:', shotstackData);
      await supabase
        .from('content_projects')
        .update({ status: 'failed' })
        .eq('id', project.id);
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance })
        .eq('user_id', user.id);
      throw new Error('Keine Render-ID erhalten');
    }

    // Update project with render_id
    await supabase
      .from('content_projects')
      .update({ render_id: renderId })
      .eq('id', project.id);

    console.log('[create-content-video] Success:', {
      project_id: project.id,
      render_id: renderId,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        project_id: project.id,
        render_id: renderId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[create-content-video] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
