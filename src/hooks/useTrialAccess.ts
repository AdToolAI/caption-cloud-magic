import { useAuth } from "@/hooks/useAuth";
import { useTrialStatus } from "@/hooks/useTrialStatus";

/**
 * useTrialAccess — Beta 2026.
 *
 * Zugang zu Premium-Features basiert ausschließlich auf dem Stripe-
 * Subscription-Status (`useAuth().subscribed`). Das alte Credit-System
 * ist abgeschafft.
 *
 * Trial bleibt als Übergangsfenster für Neu-User erhalten (definiert über
 * `useTrialStatus`), damit sie die Plattform vor der ersten Zahlung
 * ausprobieren können.
 */
export function useTrialAccess() {
  const trial = useTrialStatus();
  const { subscribed } = useAuth();

  const isTrialActive = trial.status === "active";
  const isPaid = subscribed === true;

  return {
    isTrialActive,
    isPaid,
    /** True = bypass all upgrade walls. */
    hasFullAccess: isTrialActive || isPaid,
    trial,
    planCode: isPaid ? "basic" : "free",
  };
}
