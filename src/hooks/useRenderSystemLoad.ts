/**
 * useRenderSystemLoad — global Lambda render-queue load signal.
 *
 * Reads system_config for slot budget + calls render_queue_stats() RPC for
 * aggregate usage. Subscribes to render_queue realtime changes and re-fetches
 * on any mutation, with a 15s polling fallback.
 *
 * Used by SystemLoadPill in Motion Studio & AI Video Studio.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SLOT_BUDGET_DEFAULT = 60;
const HIGH_WATER = 50;

export type LoadState = 'idle' | 'busy' | 'founder_reserve' | 'saturated';

export interface RenderSystemLoad {
  slotsUsed: number;
  slotBudget: number;
  queuedCount: number;
  founderQueued: number;
  state: LoadState;
  loading: boolean;
}

const initial: RenderSystemLoad = {
  slotsUsed: 0,
  slotBudget: SLOT_BUDGET_DEFAULT,
  queuedCount: 0,
  founderQueued: 0,
  state: 'idle',
  loading: true,
};

function deriveState(slotsUsed: number, slotBudget: number): LoadState {
  if (slotsUsed >= slotBudget) return 'saturated';
  if (slotsUsed >= HIGH_WATER) return 'founder_reserve';
  if (slotsUsed >= Math.floor(slotBudget * 0.4)) return 'busy';
  return 'idle';
}

export function useRenderSystemLoad(): RenderSystemLoad {
  const [load, setLoad] = useState<RenderSystemLoad>(initial);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let slotBudget = SLOT_BUDGET_DEFAULT;

    const fetchStats = async () => {
      const { data, error } = await supabase.rpc('render_queue_stats');
      if (cancelled || error || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      const slotsUsed = Number(row.slots_used ?? 0);
      const queuedCount = Number(row.queued_count ?? 0);
      const founderQueued = Number(row.founder_queued ?? 0);
      setLoad({
        slotsUsed,
        slotBudget,
        queuedCount,
        founderQueued,
        state: deriveState(slotsUsed, slotBudget),
        loading: false,
      });
    };

    const scheduleFetch = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void fetchStats();
      }, 500);
    };

    // 1. Slot budget from system_config (single fetch on mount).
    (async () => {
      const { data: cfg } = await supabase
        .from('system_config')
        .select('key,value')
        .eq('key', 'render_queue_slot_budget')
        .maybeSingle();
      const parsed = Number((cfg as any)?.value ?? SLOT_BUDGET_DEFAULT);
      if (!cancelled && Number.isFinite(parsed) && parsed > 0) slotBudget = parsed;
      void fetchStats();
    })();

    // 2. Realtime subscription — bounce updates through debounce.
    const channel = supabase
      .channel('render-system-load')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'render_queue' },
        scheduleFetch,
      )
      .subscribe();

    // 3. Polling fallback every 15s.
    const poll = window.setInterval(fetchStats, 15_000);

    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  return load;
}
