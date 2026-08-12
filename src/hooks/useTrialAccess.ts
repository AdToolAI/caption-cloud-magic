import { useAuth } from "@/hooks/useAuth";
import { useTrialStatus } from "@/hooks/useTrialStatus";

/**
 * useTrialAccess — Beta 2026 (Open Access).
 *
 * Es gibt keine Feature-Sperren mehr: weder Trial-Ablauf noch fehlendes Abo
 * blockieren eine Funktion. `hasFullAccess` ist konstant `true`; einzige
 * Voraussetzung bleibt die Anmeldung (Route-Guards).
 *
 * `isTrialActive` / `isPaid` bleiben als reine Statusinformation erhalten
 * (Badges, Abrechnung, Analytics) — sie steuern keinen Zugang mehr.
 */
export function useTrialAccess() {
  const trial = useTrialStatus();
  const { subscribed } = useAuth();

  const isTrialActive = trial.status === "active";
  const isPaid = subscribed === true;

  return {
    isTrialActive,
    isPaid,
    /** Open Access: immer true — keine Upgrade-Wände mehr. */
    hasFullAccess: true as const,
    trial,
    planCode: isPaid ? "basic" : "free",
  };
}
