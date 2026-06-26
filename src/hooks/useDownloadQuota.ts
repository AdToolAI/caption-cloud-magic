/**
 * useDownloadQuota — Creator-Library plan-gate.
 *
 * Strategy:
 *   - Free plan: 10 library downloads per calendar month.
 *   - Starter / Pro / Business / Enterprise: unlimited.
 *
 * Counts INSERTs into `user_video_library` + `user_audio_library`
 * (these are the two tables where any "Save / Use in Composer / DC"
 * action lands; both are RLS-scoped to auth.uid()). Generation of
 * AI music tracks is NOT counted — that path is metered via credits.
 *
 * Cheap, deterministic, no extra table needed.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const FREE_MONTHLY_DOWNLOADS = 10;
const PAID_PLANS = new Set([
  'starter',
  'pro',
  'business',
  'enterprise',
  'trial', // trial users see the full experience
]);

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export interface DownloadQuotaState {
  loading: boolean;
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
  plan: string;
  exceeded: boolean;
  refresh: () => Promise<void>;
}

export function useDownloadQuota(): DownloadQuotaState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>('free');
  const [used, setUsed] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const since = startOfMonthIso();
      const [{ data: profile }, vidCount, audCount] = await Promise.all([
        supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
        supabase
          .from('user_video_library')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', since),
        supabase
          .from('user_audio_library')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', since),
      ]);
      setPlan((profile?.plan as string) ?? 'free');
      setUsed((vidCount.count ?? 0) + (audCount.count ?? 0));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unlimited = PAID_PLANS.has(plan.toLowerCase());
  const limit = unlimited ? Infinity : FREE_MONTHLY_DOWNLOADS;
  const remaining = unlimited ? Infinity : Math.max(0, FREE_MONTHLY_DOWNLOADS - used);
  const exceeded = !unlimited && used >= FREE_MONTHLY_DOWNLOADS;

  return { loading, unlimited, used, limit, remaining, plan, exceeded, refresh };
}
