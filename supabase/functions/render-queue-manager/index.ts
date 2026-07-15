// render-queue-manager
// Tick scheduler for the render queue. Runs every ~10s via pg_cron.
// Enforces a global Lambda-slot budget (default 60) shared across all users.
// Founders (priority=3) jump ahead of standard beta users (priority=5).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { RENDER_SLOT_BUDGET_DEFAULT } from "../_shared/render-concurrency.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const STALE_MINUTES = 15;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "render-queue-manager" });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const result = { dispatched: 0 as number, staleReclaimed: 0 as number, slotsUsed: 0, slotBudget: RENDER_SLOT_BUDGET_DEFAULT, enabled: true };

  try {
    // 1. Feature flag + slot budget from system_config (single source of truth).
    const { data: cfgRows } = await supabase
      .from('system_config')
      .select('key,value')
      .in('key', ['render_queue_enabled', 'render_queue_slot_budget']);

    const cfg = new Map((cfgRows ?? []).map((r: any) => [r.key, r.value]));
    const enabled = cfg.get('render_queue_enabled') !== false;
    const slotBudget = Number(cfg.get('render_queue_slot_budget') ?? RENDER_SLOT_BUDGET_DEFAULT) || RENDER_SLOT_BUDGET_DEFAULT;
    result.enabled = enabled;
    result.slotBudget = slotBudget;

    if (!enabled) {
      return json({ ...result, message: 'render_queue disabled (feature flag)' });
    }

    // 2. Reclaim stale running jobs — fail-safe if a render never called back.
    const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
    const { data: staleJobs } = await supabase
      .from('render_queue')
      .select('id,user_id')
      .in('status', ['processing', 'rendering'])
      .lt('started_at', staleCutoff);

    for (const job of staleJobs ?? []) {
      await supabase.from('render_queue').update({
        status: 'failed',
        error_message: `Stale after ${STALE_MINUTES}m — auto-reclaimed by scheduler`,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
      result.staleReclaimed++;
    }

    // 3. Current slot usage after reclaim.
    const { data: usage } = await supabase.rpc('render_queue_running_workers');
    let used = Number(usage ?? 0);
    result.slotsUsed = used;

    if (used >= slotBudget) {
      return json({ ...result, message: 'slot budget saturated — no dispatch this tick' });
    }

    // 4. Fetch queued jobs by priority then age; dispatch until budget hit.
    const { data: queued } = await supabase
      .from('render_queue')
      .select('id,user_id,project_id,template_id,config,engine,estimated_workers,priority,is_founder,estimated_duration_sec')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(20);

    for (const job of queued ?? []) {
      const need = Math.max(1, Number(job.estimated_workers ?? 5));
      if (used + need > slotBudget) continue; // skip; a smaller job later may still fit

      // Claim the slot atomically (only dispatch if still queued).
      const { data: claimed, error: claimErr } = await supabase
        .from('render_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();

      if (claimErr || !claimed) continue;

      used += need;
      result.dispatched++;

      // Fire-and-forget: hand off to render pipeline. Failures are reported back
      // by the render function itself; we don't await here so one slow user
      // can't stall the whole tick.
      supabase.functions.invoke('process-video-render', { body: { job } }).then((r) => {
        if (r.error) {
          console.error(`[queue-tick] job ${job.id} dispatch failed:`, r.error);
          void supabase.from('render_queue').update({
            status: 'failed',
            error_message: `Dispatch error: ${r.error.message ?? 'unknown'}`,
            completed_at: new Date().toISOString(),
          }).eq('id', job.id);
        }
      }).catch((e) => {
        console.error(`[queue-tick] job ${job.id} threw:`, e);
      });
    }

    result.slotsUsed = used;

    // Self-ping: if we still have queued jobs and free slots, chain another
    // tick in ~10s so ETAs feel responsive (pg_cron min. resolution is 1 min).
    try {
      const remainingQueued = (queued?.length ?? 0) - result.dispatched;
      if (remainingQueued > 0 && used < slotBudget) {
        const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/render-queue-manager`;
        const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        // Fire-and-forget delayed self-invoke via edge waitUntil-like pattern.
        (async () => {
          await new Promise((r) => setTimeout(r, 10_000));
          try {
            await fetch(selfUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: anon },
              body: JSON.stringify({ trigger: 'chain' }),
            });
          } catch (_e) { /* ignore */ }
        })();
      }
    } catch (_e) { /* ignore */ }

    return json(result);
  } catch (err) {
    console.error('[queue-tick] fatal:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ ...result, error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
