import { useState, useEffect } from 'react';
import posthog from 'posthog-js';

/**
 * React hook for PostHog feature flags
 * @param flagKey - Feature flag key from PostHog
 * @param defaultValue - Default value if flag is not loaded
 * @returns Boolean indicating if feature is enabled
 */
export function useFeatureFlag(
  flagKey: string,
  defaultValue: boolean = false
): boolean {
  const [isEnabled, setIsEnabled] = useState(defaultValue);

  useEffect(() => {
    // Check if PostHog is initialized
    if (!posthog.__loaded) {
      console.warn(`[FeatureFlag] PostHog not initialized for flag: ${flagKey}`);
      return;
    }

    // Initial check
    const initialValue = posthog.isFeatureEnabled(flagKey);
    if (initialValue !== undefined) {
      setIsEnabled(initialValue);
    }

    // Listen for feature flag changes
    const unsubscribe = posthog.onFeatureFlags(() => {
      const enabled = posthog.isFeatureEnabled(flagKey);
      if (enabled !== undefined) {
        setIsEnabled(enabled);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [flagKey]);

  return isEnabled;
}

/**
 * Hook for feature flag with variant support
 * @param flagKey - Feature flag key from PostHog
 * @param defaultVariant - Default variant value
 * @returns Current variant value
 */
export function useFeatureFlagVariant<T = string>(
  flagKey: string,
  defaultVariant: T
): T {
  const [variant, setVariant] = useState<T>(defaultVariant);

  useEffect(() => {
    if (!posthog.__loaded) {
      console.warn(`[FeatureFlag] PostHog not initialized for flag: ${flagKey}`);
      return;
    }

    const updateVariant = () => {
      const value = posthog.getFeatureFlagPayload(flagKey);
      if (value !== undefined) {
        setVariant(value as T);
      }
    };

    updateVariant();

    const unsubscribe = posthog.onFeatureFlags(updateVariant);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [flagKey]);

  return variant;
}
