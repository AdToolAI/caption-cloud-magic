// Invite a collaborator to a Composer project by email.
// If the email belongs to an existing user, we directly create the collaborator row.
// Otherwise we create a placeholder row with invited_email so the owner can reshare later.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  projectId: string;
  email: string;
  role: 'viewer' | 'editor';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // User-scoped client (verifies caller)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);
    const callerId = userData.user.id;

    const body = (await req.json()) as RequestBody;
    if (!body?.projectId || !body?.email || !body?.role) {
      return json({ error: 'projectId, email and role are required' }, 400);
    }
    const email = body.email.trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return json({ error: 'Invalid email' }, 400);
    }
    if (!['viewer', 'editor'].includes(body.role)) {
      return json({ error: 'Invalid role' }, 400);
    }

    // Service-role client for privileged ops (lookup user, bypass RLS for insert verification)
    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller owns the project
    const { data: project, error: projErr } = await admin
      .from('composer_projects')
      .select('id, user_id, title')
      .eq('id', body.projectId)
      .maybeSingle();
    if (projErr) throw projErr;
    if (!project) return json({ error: 'Project not found' }, 404);
    if (project.user_id !== callerId) return json({ error: 'Only the project owner can invite' }, 403);

    // Try to resolve email to existing user
    const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw listErr;
    const matchedUser = usersList.users.find((u) => u.email?.toLowerCase() === email);

    if (!matchedUser) {
      // Create a placeholder row keyed by a synthetic uuid so unique(project_id, user_id) holds.
      // Pending invites without a real auth user are tracked via invited_email only.
      const placeholderId = crypto.randomUUID();
      const { error: insErr } = await admin.from('composer_collaborators').insert({
        project_id: body.projectId,
        user_id: placeholderId,
        invited_email: email,
        role: body.role,
        invited_by: callerId,
        accepted_at: null,
      });
      if (insErr) throw insErr;
      return json({ status: 'pending', email, message: 'Invitation logged. User must sign up first.' });
    }

    // Existing user → upsert membership and auto-accept
    const { error: upsertErr } = await admin
      .from('composer_collaborators')
      .upsert({
        project_id: body.projectId,
        user_id: matchedUser.id,
        invited_email: email,
        role: body.role,
        invited_by: callerId,
        accepted_at: new Date().toISOString(),
      }, { onConflict: 'project_id,user_id' });
    if (upsertErr) throw upsertErr;

    return json({ status: 'active', userId: matchedUser.id, email, projectTitle: project.title });
  } catch (e) {
    console.error('invite-composer-collaborator error', e);
    return json({ error: (e as Error).message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
