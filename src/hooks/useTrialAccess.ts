import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useCredits } from "@/hooks/useCredits";

/**
 * Central helper for "is this user effectively a paying customer?"
 *
 * During an **active trial** we unlock everything so the user can fully
 * configure their workspace (Brand Kit, social connections, AI Studios, …).
 * Upgrade modals only fire once the trial enters grace / expired.
 */
export function useTrialAccess() {
  const trial = useTrialStatus();
  const { balance } = useCredits();
  const planCode = balance?.plan_code ?? "free";

  const isTrialActive = trial.status === "active";
  const isPaid = planCode === "pro" || planCode === "enterprise" || planCode === "basic";

  return {
    isTrialActive,
    isPaid,
    /** True = bypass all upgrade walls. */
    hasFullAccess: isTrialActive || isPaid,
    trial,
    planCode,
  };
}
