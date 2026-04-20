import { useEffect, useRef } from "react";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useCredits } from "@/hooks/useCredits";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";

/**
 * Surfaces a contextual upgrade prompt at strategic days during the
 * 14-day Enterprise trial (Day 7 / 10 / 13) and during the 3-day grace period.
 * Cooldown (48h) is enforced inside useUpgradeTrigger via the "trial_progress" source.
 */

const TRIAL_TOTAL_DAYS = 14;

export const TrialUpgradeWatcher = () => {
  const { status, daysRemaining, inGracePeriod, graceDaysRemaining, loading } =
    useTrialStatus();
  const { balance } = useCredits();
  const { trigger } = useUpgradeTrigger();
  const fired = useRef(false);

  useEffect(() => {
    if (loading || fired.current) return;
    if (!balance) return;

    // Already converted / paid → skip
    if (status === "converted") return;
    // Account paused → AccountPausedGate handles it
    if (status === "expired") return;

    const dayInTrial = TRIAL_TOTAL_DAYS - daysRemaining;

    // Grace period takes priority
    if (status === "grace" && inGracePeriod) {
      fired.current = true;
      trigger({
        source: "trial_progress",
        recommendedPlan: "pro",
        currentPlan: "enterprise",
        feature: "Trial",
        contextValue: graceDaysRemaining,
        metadata: {
          variant: "grace",
          grace_days_remaining: graceDaysRemaining,
        },
      });
      return;
    }

    if (status !== "active") return;

    // Day 13 (last day) — most urgent
    if (daysRemaining <= 1) {
      fired.current = true;
      trigger({
        source: "trial_progress",
        recommendedPlan: "pro",
        currentPlan: "enterprise",
        feature: "Trial",
        contextValue: daysRemaining,
        metadata: { variant: "last_day", trial_day: dayInTrial },
      });
      return;
    }

    // Day 10 — 4 days left
    if (daysRemaining <= 4) {
      fired.current = true;
      trigger({
        source: "trial_progress",
        recommendedPlan: "pro",
        currentPlan: "enterprise",
        feature: "Trial",
        contextValue: daysRemaining,
        metadata: { variant: "ending_soon", trial_day: dayInTrial },
      });
      return;
    }

    // Day 7 — halfway
    if (dayInTrial >= 7) {
      fired.current = true;
      trigger({
        source: "trial_progress",
        recommendedPlan: "pro",
        currentPlan: "enterprise",
        feature: "Trial",
        contextValue: daysRemaining,
        metadata: { variant: "halfway", trial_day: dayInTrial },
      });
    }
  }, [
    loading,
    status,
    daysRemaining,
    inGracePeriod,
    graceDaysRemaining,
    balance,
    trigger,
  ]);

  return null;
};
