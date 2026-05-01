import { useEffect } from "react";
import { trackFeatureUsage, PowerFeatureKey } from "@/lib/featureUsageTracker";

/**
 * Mounts once and increments the usage counter for a power feature.
 * Use at the top of each Studio page so the FeatureDiscoveryWatcher
 * can surface contextual upgrade prompts after repeated usage.
 */
export function useTrackPageFeature(feature: PowerFeatureKey) {
  useEffect(() => {
    trackFeatureUsage(feature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
