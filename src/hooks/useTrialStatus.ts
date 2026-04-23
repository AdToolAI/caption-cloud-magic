import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type TrialStatus = "active" | "grace" | "expired" | "converted" | "cancelled";

export interface TrialInfo {
  status: TrialStatus;
  trialEndsAt: string | null;
  daysRemaining: number;
  inGracePeriod: boolean;
  graceDaysRemaining: number;
  accountPaused: boolean;
  loading: boolean;
}

const GRACE_PERIOD_DAYS = 14;

const DEFAULT: TrialInfo = {
  status: "converted",
  trialEndsAt: null,
  daysRemaining: 0,
  inGracePeriod: false,
  graceDaysRemaining: 0,
  accountPaused: false,
  loading: true,
};

/**
 * Reads the current user's trial / pause state from `profiles`.
 * Computes a 3-day grace period after `trial_ends_at` before account pause.
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

      const dbStatus = (data.trial_status as TrialStatus) || "converted";
      const endsAt = data.trial_ends_at as string | null;
      const accountPaused = !!data.account_paused;

      let status: TrialStatus = dbStatus;
      let days = 0;
      let inGrace = false;
      let graceDays = 0;

      if (endsAt && (dbStatus === "active" || dbStatus === "grace")) {
        const endMs = new Date(endsAt).getTime();
        const now = Date.now();
        const graceEndMs = endMs + GRACE_PERIOD_DAYS * 86400000;

        if (now < endMs) {
          // Trial still active
          status = "active";
          days = Math.max(0, Math.ceil((endMs - now) / 86400000));
        } else if (now < graceEndMs) {
          // In grace period — trial expired but account not yet paused
          status = "grace";
          inGrace = true;
          graceDays = Math.max(0, Math.ceil((graceEndMs - now) / 86400000));
        } else {
          // Past grace — should be paused by edge function shortly
          status = "expired";
        }
      }

      setInfo({
        status,
        trialEndsAt: endsAt,
        daysRemaining: days,
        inGracePeriod: inGrace,
        graceDaysRemaining: graceDays,
        accountPaused,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return info;
}
