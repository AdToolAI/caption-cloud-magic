import { ReactNode } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

interface FeatureFlagProps {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

/**
 * Wrapper component for feature flag-gated content
 * @param flag - PostHog feature flag key
 * @param children - Content to render if flag is enabled
 * @param fallback - Content to render if flag is disabled (default: null)
 * @param loadingFallback - Content to render while loading (default: null)
 */
export function FeatureFlag({ 
  flag, 
  children, 
  fallback = null,
  loadingFallback = null 
}: FeatureFlagProps) {
  const isEnabled = useFeatureFlag(flag);

  // Loading state
  if (isEnabled === undefined) {
    return <>{loadingFallback}</>;
  }

  // Flag enabled
  if (isEnabled) {
    return <>{children}</>;
  }

  // Flag disabled
  return <>{fallback}</>;
}
