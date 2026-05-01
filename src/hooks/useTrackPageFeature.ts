import { useEffect } from "react";
import { trackFeatureUsage, PowerFeatureKey } from "@/lib/featureUsageTracker";
import { trackFeatureFirstUse } from "@/lib/analytics";

/**
 * Mounts once and increments the usage counter for a power feature.
 * Use at the top of each Studio page so the FeatureDiscoveryWatcher
 * can surface contextual upgrade prompts after repeated usage.
 *
 * Also emits a one-time `feature_first_use` PostHog event for activation funnels.
 */
export function useTrackPageFeature(feature: PowerFeatureKey) {
  useEffect(() => {
    trackFeatureUsage(feature);
    trackFeatureFirstUse(feature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
