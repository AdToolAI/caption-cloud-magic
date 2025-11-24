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
    const { projectId, formatConfig, contentConfig, subtitleConfig } = await req.json();

    if (!projectId || !formatConfig || !contentConfig || !subtitleConfig) {
      throw new Error('Missing required parameters');
    }

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[render-universal-video] Starting render for project:', projectId);

    // Check Shotstack API key
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackApiKey) {
      console.error('[render-universal-video] SHOTSTACK_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Video-Rendering-Service nicht konfiguriert' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Shotstack configuration from project data
    const tracks: any[] = [];
    
    // Add background video/image track if available
    if (contentConfig.backgroundUrl) {
      tracks.push({
        clips: [{
          asset: {
            type: contentConfig.backgroundType === 'video' ? 'video' : 'image',
            src: contentConfig.backgroundUrl
          },
          start: 0,
          length: formatConfig.duration || contentConfig.actualVoiceoverDuration || 30
        }]
      });
    }
    
    // Add voiceover audio track if available
    if (contentConfig.voiceoverUrl) {
      tracks.push({
        clips: [{
          asset: {
            type: 'audio',
            src: contentConfig.voiceoverUrl,
            volume: 1.0
          },
          start: 0,
          length: contentConfig.actualVoiceoverDuration || formatConfig.duration || 30
        }]
      });
    }
    
    // Add subtitle track
    tracks.push({
      clips: subtitleConfig.segments.map((segment: any) => ({
        asset: {
          type: 'html',
          html: `<p>${segment.text}</p>`,
          css: `p { 
            color: ${subtitleConfig.style.color}; 
            font-size: ${subtitleConfig.style.fontSize}px; 
            font-family: ${subtitleConfig.style.font}; 
            text-align: center; 
            background: ${subtitleConfig.style.backgroundColor}; 
            padding: 10px; 
          }`,
          width: formatConfig.width,
          height: 200,
        },
        start: segment.startTime,
        length: segment.endTime - segment.startTime,
        position: subtitleConfig.style.position,
      }))
    });

    const shotstackConfig = {
      timeline: {
        background: '#000000',
        tracks: tracks
      },
      output: {
        format: 'mp4',
        size: {
          width: formatConfig.width,
          height: formatConfig.height
        },
        aspectRatio: formatConfig.aspectRatio || '9:16',
        fps: formatConfig.fps || 25,
        quality: 'high'
      }
    };

    console.log('[render-universal-video] Calling Shotstack API...');

    // Call Shotstack API
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
      console.error('[render-universal-video] Shotstack API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Video-Rendering fehlgeschlagen' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shotstackData = await shotstackResponse.json();
    const renderId = shotstackData.response?.id;

    if (!renderId) {
      console.error('[render-universal-video] No render ID in response:', shotstackData);
      return new Response(
        JSON.stringify({ error: 'Keine Render-ID erhalten' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store render job in database
    const { error: insertError } = await supabase
      .from('video_renders')
      .insert({
        render_id: renderId,
        user_id: user.id,
        project_id: projectId,
        format_config: formatConfig,
        content_config: contentConfig,
        subtitle_config: subtitleConfig,
        status: 'processing',
        started_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[render-universal-video] Error storing render job:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create render job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[render-universal-video] Success:', { projectId, renderId });

    return new Response(
      JSON.stringify({ 
        renderId,
        message: 'Render job started successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error starting render:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
