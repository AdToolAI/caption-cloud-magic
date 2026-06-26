// Phase 5.6 — Composer Undo Edge Function
// Restores a single undo-stack entry: writes `before_state` back to the
// affected scene (or recreates it if deleted), optionally refunds credits
// to the user's wallet via the existing `refund-credits` function, then
// removes the consumed entry from the stack.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface UndoRow {
  id: string;
  project_id: string;
  scene_id: string | null;
  user_id: string;
  action_type: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  credits_charged: number;
  refundable: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "composer-undo" });


  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate caller via anon-key client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const { entryId, projectId } = body as { entryId?: string; projectId?: string };
    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role for cross-table writes & refund hop
    const admin = createClient(supabaseUrl, serviceKey);

    // Pop newest entry for this project & user (or specific entryId)
    let q = admin
      .from('composer_undo_stack')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (entryId) q = q.eq('id', entryId);

    const { data: rows, error: fetchErr } = await q;
    if (fetchErr) throw fetchErr;
    const entry = rows?.[0] as UndoRow | undefined;
    if (!entry) {
      return new Response(JSON.stringify({ ok: true, restored: false, reason: 'nothing to undo' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Restore scene state
    if (entry.scene_id && entry.before_state) {
      // before_state is a snake_case row snapshot — upsert it
      const snapshot = { ...entry.before_state, id: entry.scene_id, project_id: entry.project_id };
      const { error: upsertErr } = await admin
        .from('composer_scenes')
        .upsert(snapshot, { onConflict: 'id' });
      if (upsertErr) console.error('[composer-undo] upsert failed:', upsertErr);
    } else if (entry.scene_id && !entry.before_state) {
      // Action was "create" — undoing means delete
      await admin.from('composer_scenes').delete().eq('id', entry.scene_id);
    }

    // Optional credit refund
    let refunded = 0;
    if (entry.refundable && entry.credits_charged > 0) {
      try {
        const { error: refErr } = await admin.functions.invoke('refund-credits', {
          body: {
            user_id: userId,
            amount: entry.credits_charged,
            reason: `composer-undo:${entry.action_type}`,
            idempotency_key: `undo-${entry.id}`,
          },
        });
        if (!refErr) refunded = entry.credits_charged;
      } catch (err) {
        console.warn('[composer-undo] refund failed (non-fatal):', err);
      }
    }

    // Pop entry
    await admin.from('composer_undo_stack').delete().eq('id', entry.id);

    return new Response(
      JSON.stringify({ ok: true, restored: true, actionType: entry.action_type, refunded }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[composer-undo] fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
