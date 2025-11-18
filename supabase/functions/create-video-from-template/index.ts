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

// Clean invalid assets from timeline (for optional media fields that weren't provided)
function cleanInvalidAssets(config: any, customizations: any, template: any): any {
  const optionalMediaFields = template.customizable_fields
    .filter((f: any) => 
      (f.type === 'images' || f.type === 'videos' || f.type === 'image') && 
      !f.required
    )
    .map((f: any) => f.key);
  
  // Identify missing optional media fields
  const missingFields = optionalMediaFields.filter(
    (key: string) => !customizations[key] || 
           customizations[key] === '' ||
           (Array.isArray(customizations[key]) && customizations[key].length === 0)
  );
  
  if (missingFields.length === 0) return config;
  
  console.log('Cleaning timeline - missing optional media fields:', missingFields);
  
  let removedClipsCount = 0;
  
  // Clean tracks by removing clips with invalid assets
  config.timeline.tracks = config.timeline.tracks
    .map((track: any) => {
      const validClips = track.clips.filter((clip: any) => {
        if (!clip.asset) return true;
        
        const src = clip.asset.src || '';
        
        // Check if src contains unreplaced placeholder for missing field
        const isPlaceholder = missingFields.some(
          (field: string) => src.includes(`{{${field}}}`)
        );
        const isEmpty = src.trim() === '';
        
        const isValid = !isPlaceholder && !isEmpty;
        if (!isValid) removedClipsCount++;
        
        return isValid;
      });
      
      return {
        ...track,
        clips: validClips
      };
    })
    .filter((track: any) => track.clips && track.clips.length > 0);
  
  console.log(`Removed ${removedClipsCount} clips with invalid assets`);
  
  return config;
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

    // Calculate credits based on rendering options and multi-video
    let creditsRequired = 50; // Base cost
    if (renderingOptions.quality === '4k') creditsRequired = 100;
    else if (renderingOptions.quality === '720p') creditsRequired = 30;
    
    if (renderingOptions.format === 'webm') creditsRequired += 10;
    if (renderingOptions.framerate === 60) creditsRequired += 20;

    // Add credits for multi-video fields
    template.customizable_fields.forEach((field: any) => {
      if (field.type === 'videos' && customizations[field.key]) {
        try {
          const videoUrls = JSON.parse(String(customizations[field.key]));
          const videoCount = Array.isArray(videoUrls) ? videoUrls.length : 0;
          if (videoCount > 1) {
            creditsRequired += (videoCount - 1) * 5; // +5 credits per additional video
          }
        } catch (e) {
          console.error('Failed to parse video URLs:', e);
        }
      }
    });

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
    
    // Skip multi-image/video fields - they're handled separately below
    const multiMediaFields = new Set(
      template.customizable_fields
        .filter((f: any) => f.type === 'images' || f.type === 'videos')
        .map((f: any) => f.key)
    );
    
    for (const [key, value] of Object.entries(customizations)) {
      // Skip fields that are arrays of media URLs
      if (multiMediaFields.has(key)) continue;
      
      const placeholder = `{{${key}}}`;
      // JSON-safe escaping: escape special characters like \n, ", \ etc.
      const escaped = JSON.stringify(String(value)).slice(1, -1);
      configStr = configStr.replaceAll(placeholder, escaped);
    }
    
    let shotstackConfig: any;
    try {
      shotstackConfig = JSON.parse(configStr);
    } catch (parseError) {
      console.error('Failed to parse Shotstack config after placeholder replacement:', {
        error: parseError,
        template_id,
        configStrPreview: configStr.slice(0, 500),
      });
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'TEMPLATE_PARSE_ERROR',
          message: 'Das Template konnte nicht verarbeitet werden. Bitte versuche es erneut.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process multi-video fields - add clips to timeline
    template.customizable_fields.forEach((field: any, fieldIndex: number) => {
      if (field.type === 'videos' && customizations[field.key]) {
        try {
          const videoUrls = JSON.parse(String(customizations[field.key]));
          if (Array.isArray(videoUrls) && videoUrls.length > 0) {
            // Get transition style from customizations or use default
            const transitionStyle = customizations.transition_style || field.default || 'fade';
            
            // Add video clips to the timeline
            videoUrls.forEach((url: string, index: number) => {
              const videoClip = {
                asset: {
                  type: 'video',
                  src: url
                },
                start: index * 5, // 5 seconds per clip
                length: 5,
                fit: 'cover',
                transition: {
                  in: transitionStyle,
                  out: transitionStyle
                }
              };
              
              // Ensure tracks array exists
              if (!shotstackConfig.timeline.tracks) {
                shotstackConfig.timeline.tracks = [{ clips: [] }];
              }
              if (!shotstackConfig.timeline.tracks[0]) {
                shotstackConfig.timeline.tracks[0] = { clips: [] };
              }
              
              // Add clip to first track
              shotstackConfig.timeline.tracks[0].clips.push(videoClip);
            });
          }
        } catch (e) {
          console.error('Failed to process multi-video field:', e);
        }
      }
    });

    // Clean invalid assets from timeline (for optional media fields not provided)
    shotstackConfig = cleanInvalidAssets(shotstackConfig, customizations, template);
    
    // Validate that we still have content to render
    if (!shotstackConfig.timeline.tracks || 
        shotstackConfig.timeline.tracks.length === 0 ||
        !shotstackConfig.timeline.tracks.some((t: any) => t.clips?.length > 0)) {
      console.error('No valid clips remaining after cleaning timeline');
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'NO_VALID_CONTENT',
          message: 'Keine gültigen Medien für Video-Erstellung vorhanden. Bitte lade mindestens ein Bild oder Video hoch.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
