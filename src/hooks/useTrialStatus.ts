import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type TrialStatus = "active" | "expired" | "converted" | "cancelled";

export interface TrialInfo {
  status: TrialStatus;
  trialEndsAt: string | null;
  daysRemaining: number;
  accountPaused: boolean;
  loading: boolean;
}

const DEFAULT: TrialInfo = {
  status: "converted",
  trialEndsAt: null,
  daysRemaining: 0,
  accountPaused: false,
  loading: true,
};

/**
 * Reads the current user's trial / pause state from `profiles`.
 * Used by TrialBanner and AccountPausedGate.
 */
export function useTrialStatus(): TrialInfo {
  const { user } = useAuth();
  const [info, setInfo] = useState<TrialInfo>(DEFAULT);

  useEffect(() => {
    if (!user) {
      setInfo({ ...DEFAULT, loading: false });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("trial_status, trial_ends_at, account_paused")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setInfo({ ...DEFAULT, loading: false });
        return;
      }

      const status = (data.trial_status as TrialStatus) || "converted";
      const endsAt = data.trial_ends_at as string | null;
      const days = endsAt
        ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000))
        : 0;

      setInfo({
        status,
        trialEndsAt: endsAt,
        daysRemaining: days,
        accountPaused: !!data.account_paused,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return info;
}
