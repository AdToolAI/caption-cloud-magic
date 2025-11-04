/**
 * Analytics utility for PostHog event tracking
 * 
 * To enable PostHog analytics:
 * 1. Sign up at https://posthog.com
 * 2. Get your Project API Key from Settings > Project > Project API Key
 * 3. Set these environment variables:
 *    - VITE_PUBLIC_POSTHOG_KEY=phc_xxx
 *    - VITE_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com (optional, defaults to US)
 * 
 * @example
 * // Track an event
 * trackEvent('button_clicked', { button_name: 'signup' });
 * 
 * // Identify a user (after login)
 * identifyUser('user_123', { email: 'user@example.com', plan: 'pro' });
 * 
 * // Reset user (after logout)
 * resetUser();
 */

import posthog from 'posthog-js';

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  // Try window.posthog first
  if (typeof window !== 'undefined' && (window as any).posthog?.capture) {
    (window as any).posthog.capture(eventName, properties);
  } 
  // Fallback to direct import
  else if (posthog?.capture) {
    posthog.capture(eventName, properties);
  }
};

export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  if (typeof window !== 'undefined' && (window as any).posthog?.identify) {
    (window as any).posthog.identify(userId, properties);
  } else if (posthog?.identify) {
    posthog.identify(userId, properties);
  }
};

export const resetUser = () => {
  if (typeof window !== 'undefined' && (window as any).posthog?.reset) {
    (window as any).posthog.reset();
  } else if (posthog?.reset) {
    posthog.reset();
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
