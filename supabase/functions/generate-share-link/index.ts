import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "generate-share-link" });


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

    // Hash password if provided (PBKDF2-SHA256 with random salt)
    let password_hash = null;
    if (require_password && password) {
      const encoder = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(String(password)),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const iterations = 100_000;
      const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        keyMaterial,
        256
      );
      const b64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));
      password_hash = `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(derived))}`;
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