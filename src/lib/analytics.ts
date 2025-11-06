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
import { supabase } from '@/integrations/supabase/client';

/**
 * Calculate days since user signup
 */
const getDaysSinceSignup = (): number | null => {
  try {
    const signupDate = localStorage.getItem('signup_date');
    if (!signupDate) return null;
    
    const daysSince = Math.floor((Date.now() - new Date(signupDate).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince;
  } catch {
    return null;
  }
};

/**
 * Track an event with automatic enrichment
 */
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (posthog?.capture) {
    try {
      const enrichedProperties = {
        ...properties,
        days_since_signup: getDaysSinceSignup(),
        timestamp: new Date().toISOString(),
      };
      
      posthog.capture(eventName, enrichedProperties);
    } catch (error) {
      console.error('PostHog tracking error:', error);
    }
  }
};

/**
 * Identify a user with enriched properties
 */
export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  if (posthog?.identify) {
    try {
      // Store signup date if not already stored
      if (!localStorage.getItem('signup_date')) {
        localStorage.setItem('signup_date', new Date().toISOString());
      }

      const allProperties = {
        ...properties,
        signup_date: localStorage.getItem('signup_date'),
        days_since_signup: getDaysSinceSignup(),
      };

      posthog.identify(userId, allProperties);
    } catch (error) {
      console.error('PostHog identify error:', error);
    }
  }
};

/**
 * Update user properties (call this when plan changes, posts created, etc.)
 */
export const updateUserProperties = (properties: Record<string, any>) => {
  if (posthog?.people?.set) {
    try {
      posthog.people.set(properties);
    } catch (error) {
      console.error('PostHog update properties error:', error);
    }
  }
};

export const resetUser = () => {
  if (posthog?.reset) {
    posthog.reset();
  }
};

// Event constants for type safety
export const ANALYTICS_EVENTS = {
  // Onboarding & Auth
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_FINISHED: 'onboarding_finished',
  
  // Content Creation
  POST_GENERATED: 'post_generated',
  FIRST_POST_SCHEDULED: 'first_post_scheduled',
  CAMPAIGN_GENERATED: 'campaign_generated',
  CAPTION_COPIED: 'caption_copied',
  HOOK_COPIED: 'hook_copied',
  CONTENT_EXPORTED: 'content_exported',
  
  // Calendar & Planning
  CALENDAR_VIEWED: 'calendar_viewed',
  CALENDAR_EVENT_CREATED: 'calendar_event_created',
  
  // Brand & Workspace
  BRAND_KIT_CREATED: 'brand_kit_created',
  BRAND_KIT_DELETED: 'brand_kit_deleted',
  WORKSPACE_CREATED: 'workspace_created',
  
  // Monetization
  UPGRADE_CLICKED: 'upgrade_clicked',
  PAYMENT_COMPLETED: 'payment_completed',
  
  // Performance & Limits
  USAGE_LIMIT_REACHED: 'usage_limit_reached',
} as const;
