import { useAuth } from "@/hooks/useAuth";
import { SmartUpgradeModal } from "./SmartUpgradeModal";

/**
 * UpgradeMount — Beta 2026.
 *
 * Credit-basierte Upsell-Watcher (CreditThresholdWatcher,
 * StreakMilestoneUpsellWatcher, UsageRecommendationWatcher,
 * TrialUpgradeWatcher, FeatureDiscoveryWatcher) sind mit Abschaffung des
 * generischen Credit-Systems deaktiviert. Alles ist im Beta-Basic-Abo
 * (14,99 €) enthalten; Zugang wird über Stripe-Subscription geregelt.
 *
 * SmartUpgradeModal bleibt gemountet, weil es weiterhin von manuellen
 * Trigger-Punkten (z. B. Founders-Slot-Flow) genutzt wird.
 */
export const UpgradeMount = () => {
  useAuth();
  return <SmartUpgradeModal />;
};
