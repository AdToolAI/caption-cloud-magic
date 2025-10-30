/**
 * Analytics utility for PostHog event tracking
 * 
 * To enable PostHog analytics:
 * 1. Sign up at https://posthog.com
 * 2. Get your Project API Key from Settings > Project > Project API Key
 * 3. Set VITE_POSTHOG_API_KEY in your .env file (or project settings)
 */

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (typeof window !== 'undefined' && (window as any).posthog) {
    (window as any).posthog.capture(eventName, properties);
  }
};

export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  if (typeof window !== 'undefined' && (window as any).posthog) {
    (window as any).posthog.identify(userId, properties);
  }
};

export const resetUser = () => {
  if (typeof window !== 'undefined' && (window as any).posthog) {
    (window as any).posthog.reset();
  }
};

// Event constants for type safety
export const ANALYTICS_EVENTS = {
  SIGNUP_COMPLETED: 'signup_completed',
  FIRST_POST_SCHEDULED: 'first_post_scheduled',
  UPGRADE_CLICKED: 'upgrade_clicked',
  POST_GENERATED: 'post_generated',
  CALENDAR_VIEWED: 'calendar_viewed',
  BRAND_KIT_CREATED: 'brand_kit_created',
  PAYMENT_COMPLETED: 'payment_completed',
} as const;
