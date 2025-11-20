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

    const { project_id, collaborator_email, role = 'viewer' } = await req.json();

    // Verify project ownership or admin role
    const { data: project, error: projectError } = await supabaseClient
      .from('content_projects')
      .select('user_id')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (project.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Only project owner can add collaborators' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find user by email (simplified - in production would send invite email)
    const { data: collaboratorUser } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('email', collaborator_email)
      .single();

    if (!collaboratorUser) {
      return new Response(JSON.stringify({ 
        error: 'User not found',
        message: 'User must sign up first before being invited'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create collaborator invitation
    const { data: collaboration, error: collabError } = await supabaseClient
      .from('project_collaborators')
      .insert({
        project_id,
        user_id: collaboratorUser.id,
        invited_by: user.id,
        role,
        status: 'pending'
      })
      .select()
      .single();

    if (collabError) {
      if (collabError.code === '23505') { // Unique violation
        return new Response(JSON.stringify({ 
          error: 'User is already a collaborator on this project' 
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.error('Collaboration creation error:', collabError);
      return new Response(JSON.stringify({ error: 'Failed to add collaborator' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // TODO: Send invitation email via Resend

    return new Response(JSON.stringify({
      ok: true,
      invitation_sent: true,
      collaboration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Add collaborator error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});