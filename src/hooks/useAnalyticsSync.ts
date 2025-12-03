/**
 * Hook to automatically sync user properties to PostHog
 * Call this hook in components where user data changes (plan, credits, posts, etc.)
 */

import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useCredits } from './useCredits';
import { updateUserProperties } from '@/lib/analytics';

export const useAnalyticsSync = () => {
  const { user, subscribed, productId } = useAuth();
  const { balance } = useCredits();

  useEffect(() => {
    if (!user || !balance) return;

    const syncProperties = () => {
      // Only sync if tab is visible to reduce background load
      if (document.hidden) return;
      
      try {
        let plan = 'free';
        if (subscribed) {
          if (productId?.includes('pro')) plan = 'pro';
          else if (productId?.includes('basic')) plan = 'basic';
          else if (productId?.includes('enterprise')) plan = 'enterprise';
        }

        updateUserProperties({
          plan: balance?.plan_code || plan,
          credits_balance: balance?.balance || 0,
          monthly_credits: balance?.monthly_credits || 0,
          subscribed: subscribed,
          last_sync: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Analytics sync error:', error);
      }
    };

    // Sync immediately and then every 10 minutes (was 5 minutes)
    syncProperties();
    const interval = setInterval(syncProperties, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user, subscribed, productId, balance]);
};
