import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { 
      project_id, 
      expires_in_seconds = 604800, // 7 days default
      allow_download = true,
      allow_comments = false,
      require_password = false,
      password 
    } = await req.json();

    // Verify project ownership
    const { data: project, error: projectError } = await supabaseClient
      .from('content_projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate unique token
    const share_token = crypto.randomUUID();
    
    // Calculate expiry
    const expires_at = new Date(Date.now() + expires_in_seconds * 1000).toISOString();

    // Hash password if provided
    let password_hash = null;
    if (require_password && password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Create share link
    const { data: shareLink, error: shareLinkError } = await supabaseClient
      .from('project_share_links')
      .insert({
        project_id,
        created_by: user.id,
        share_token,
        expires_at,
        allow_download,
        allow_comments,
        require_password,
        password_hash
      })
      .select()
      .single();

    if (shareLinkError) {
      console.error('Share link creation error:', shareLinkError);
      return new Response(JSON.stringify({ error: 'Failed to create share link' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const app_url = Deno.env.get('APP_URL') || 'http://localhost:5173';
    const share_url = `${app_url}/share/${share_token}`;

    return new Response(JSON.stringify({
      ok: true,
      share_url,
      share_link: shareLink
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Generate share link error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});