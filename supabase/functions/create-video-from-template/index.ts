import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateVideoRequest {
  template_id: string;
  customizations: Record<string, string | number>;
}

interface RenderingOptions {
  quality: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  framerate: 24 | 30 | 60;
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

    const { template_id, customizations }: CreateVideoRequest = await req.json();

    if (!template_id || !customizations) {
      throw new Error('Missing required fields: template_id, customizations');
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('video_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found');
    }

    // Validate required fields
    const requiredFields = template.customizable_fields.filter((f: any) => f.required);
    for (const field of requiredFields) {
      if (!customizations[field.key]) {
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

    // Parse rendering options
    let renderingOptions: RenderingOptions = {
      quality: '1080p',
      format: 'mp4',
      aspectRatio: '16:9',
      framerate: 30
    };
    
    if (customizations._renderingOptions) {
      try {
        renderingOptions = JSON.parse(String(customizations._renderingOptions));
      } catch (e) {
        console.error('Failed to parse rendering options:', e);
      }
    }

    // Calculate credits based on rendering options
    let creditsRequired = 50; // Base cost
    if (renderingOptions.quality === '4k') creditsRequired = 100;
    else if (renderingOptions.quality === '720p') creditsRequired = 30;
    
    if (renderingOptions.format === 'webm') creditsRequired += 10;
    if (renderingOptions.framerate === 60) creditsRequired += 20;

    // Check credits
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
          message: `Nicht genügend Credits. ${creditsRequired} Credits benötigt für Video-Generierung.`
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create video_creation record
    const { data: creation, error: creationError } = await supabase
      .from('video_creations')
      .insert({
        user_id: user.id,
        template_id,
        customizations,
        status: 'pending',
        credits_used: creditsRequired,
        quality: renderingOptions.quality,
        format: renderingOptions.format,
        aspect_ratio: renderingOptions.aspectRatio,
        framerate: renderingOptions.framerate
      })
      .select()
      .single();

    if (creationError) {
      throw new Error(`Failed to create video record: ${creationError.message}`);
    }

    // Replace placeholders in template config
    let configStr = JSON.stringify(template.template_config);
    for (const [key, value] of Object.entries(customizations)) {
      const placeholder = `{{${key}}}`;
      configStr = configStr.replaceAll(placeholder, String(value));
    }
    const shotstackConfig = JSON.parse(configStr);

    // Call Shotstack API
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackApiKey) {
      throw new Error('SHOTSTACK_API_KEY not configured');
    }

    const shotstackResponse = await fetch('https://api.shotstack.io/v1/render', {
      method: 'POST',
      headers: {
        'x-api-key': shotstackApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shotstackConfig)
    });

    if (!shotstackResponse.ok) {
      const errorText = await shotstackResponse.text();
      console.error('Shotstack API error:', errorText);
      
      await supabase
        .from('video_creations')
        .update({
          status: 'failed',
          error_message: `Shotstack API Fehler: ${errorText.substring(0, 200)}`
        })
        .eq('id', creation.id);

      throw new Error('Fehler bei Video-Render');
    }

    const shotstackData = await shotstackResponse.json();
    console.log('Shotstack render started:', shotstackData);

    // Update video_creation with render_id and status
    await supabase
      .from('video_creations')
      .update({
        render_id: shotstackData.response.id,
        status: 'rendering'
      })
      .eq('id', creation.id);

    // Deduct credits
    await supabase
      .from('wallets')
      .update({
        balance: wallet.balance - 50,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    console.log(`[Video Render] User ${user.id} | Template: ${template.name} | Render ID: ${shotstackData.response.id}`);

    return new Response(
      JSON.stringify({
        ok: true,
        creation_id: creation.id,
        render_id: shotstackData.response.id,
        status: 'rendering'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Create video error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
