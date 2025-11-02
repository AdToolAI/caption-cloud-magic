/**
 * Feature Flags for Edge Functions
 * Uses PostHog Decide API for server-side feature flag evaluation
 */

const POSTHOG_API_KEY = Deno.env.get('VITE_PUBLIC_POSTHOG_KEY');
const POSTHOG_HOST = Deno.env.get('VITE_PUBLIC_POSTHOG_HOST') || 'https://us.i.posthog.com';

interface FeatureFlagResponse {
  featureFlags?: Record<string, boolean | string>;
  featureFlagPayloads?: Record<string, any>;
}

/**
 * Check if a feature flag is enabled for a user
 * @param flagKey - Feature flag key
 * @param userId - User ID for personalization
 * @param defaultValue - Default value if API fails
 * @returns Boolean indicating if feature is enabled
 */
export async function checkFeatureFlag(
  flagKey: string,
  userId: string,
  defaultValue: boolean = false
): Promise<boolean> {
  if (!POSTHOG_API_KEY) {
    console.warn('[FeatureFlags] PostHog API key not configured');
    return defaultValue;
  }

  try {
    const response = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        distinct_id: userId,
        person_properties: {},
        groups: {},
      }),
    });

    if (!response.ok) {
      console.error(`[FeatureFlags] API error: ${response.status}`);
      return defaultValue;
    }

    const data: FeatureFlagResponse = await response.json();
    const flagValue = data.featureFlags?.[flagKey];

    if (flagValue === undefined) {
      return defaultValue;
    }

    // Handle boolean flags
    if (typeof flagValue === 'boolean') {
      return flagValue;
    }

    // Handle string flags (treat truthy strings as enabled)
    return Boolean(flagValue);
  } catch (error) {
    console.error('[FeatureFlags] Error checking flag:', error);
    return defaultValue;
  }
}

/**
 * Get feature flag variant/payload
 * @param flagKey - Feature flag key
 * @param userId - User ID for personalization
 * @param defaultValue - Default value if API fails
 * @returns Feature flag payload value
 */
export async function getFeatureFlagPayload<T = any>(
  flagKey: string,
  userId: string,
  defaultValue: T
): Promise<T> {
  if (!POSTHOG_API_KEY) {
    console.warn('[FeatureFlags] PostHog API key not configured');
    return defaultValue;
  }

  try {
    const response = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        distinct_id: userId,
        person_properties: {},
        groups: {},
      }),
    });

    if (!response.ok) {
      return defaultValue;
    }

    const data: FeatureFlagResponse = await response.json();
    const payload = data.featureFlagPayloads?.[flagKey];

    return payload !== undefined ? payload : defaultValue;
  } catch (error) {
    console.error('[FeatureFlags] Error getting payload:', error);
    return defaultValue;
  }
}

/**
 * Check multiple feature flags at once
 * @param flagKeys - Array of feature flag keys
 * @param userId - User ID for personalization
 * @returns Record of flag keys to boolean values
 */
export async function checkMultipleFlags(
  flagKeys: string[],
  userId: string
): Promise<Record<string, boolean>> {
  if (!POSTHOG_API_KEY) {
    console.warn('[FeatureFlags] PostHog API key not configured');
    return Object.fromEntries(flagKeys.map(key => [key, false]));
  }

  try {
    const response = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        distinct_id: userId,
        person_properties: {},
        groups: {},
      }),
    });

    if (!response.ok) {
      return Object.fromEntries(flagKeys.map(key => [key, false]));
    }

    const data: FeatureFlagResponse = await response.json();
    const flags = data.featureFlags || {};

    return Object.fromEntries(
      flagKeys.map(key => [
        key,
        typeof flags[key] === 'boolean' ? flags[key] : Boolean(flags[key])
      ])
    );
  } catch (error) {
    console.error('[FeatureFlags] Error checking multiple flags:', error);
    return Object.fromEntries(flagKeys.map(key => [key, false]));
  }
}
