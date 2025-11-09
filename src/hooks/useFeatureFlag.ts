import { usePostHog } from 'posthog-js/react';
import { useState, useEffect } from 'react';

/**
 * Hook to check if a PostHog feature flag is enabled
 * @param flagKey - The feature flag key to check
 * @returns boolean | undefined - true if enabled, false if disabled, undefined while loading
 */
export function useFeatureFlag(flagKey: string): boolean | undefined {
  const posthog = usePostHog();
  const [flagValue, setFlagValue] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!posthog) return;

    const checkFlag = () => {
      const value = posthog.isFeatureEnabled(flagKey);
      setFlagValue(value ?? false);
    };

    // Initial check
    checkFlag();

    // Listen for flag updates
    posthog.onFeatureFlags(checkFlag);

    return () => {
      // Cleanup if needed
    };
  }, [posthog, flagKey]);

  return flagValue;
}

/**
 * Hook to get feature flag variant (for multivariate tests)
 * @param flagKey - The feature flag key
 * @returns string | boolean | undefined - The variant value
 */
export function useFeatureFlagVariant(flagKey: string): string | boolean | undefined {
  const posthog = usePostHog();
  const [variant, setVariant] = useState<string | boolean | undefined>(undefined);

  useEffect(() => {
    if (!posthog) return;

    const checkVariant = () => {
      const value = posthog.getFeatureFlag(flagKey);
      setVariant(value);
    };

    checkVariant();
    posthog.onFeatureFlags(checkVariant);

    return () => {
      // Cleanup if needed
    };
  }, [posthog, flagKey]);

  return variant;
}
