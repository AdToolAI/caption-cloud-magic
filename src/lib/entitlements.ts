import { PRICING_V21, PlanId } from '@/config/pricing';

/**
 * Check if a plan has access to Quick Calendar Post (Auto-Schedule)
 */
export const canQuickCalendarPost = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  return PRICING_V21[plan].features.quickCalendarPost;
};

/**
 * Check if a plan has access to team features
 */
export const canUseTeamFeatures = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  return PRICING_V21[plan].features.team;
};

/**
 * Check if a plan has access to white-label features
 */
export const canUseWhiteLabel = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  return PRICING_V21[plan].features.whiteLabel;
};

/**
 * Check if a plan has API access
 */
export const canUseApi = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  return PRICING_V21[plan].features.api;
};

/**
 * Check if a plan has X/Twitter access
 */
export const canUseXTwitter = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  return PRICING_V21[plan].features.xTwitterAccess;
};

/**
 * Get all features for a plan
 */
export const getPlanFeatures = (plan: PlanId | null | undefined) => {
  if (!plan) return null;
  return PRICING_V21[plan].features;
};

/**
 * Get plan details including pricing
 */
export const getPlanDetails = (plan: PlanId | null | undefined) => {
  if (!plan) return null;
  return PRICING_V21[plan];
};

/**
 * Check if a plan has access to AI Video Generation
 */
export const canUseAIVideoGeneration = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  return plan === 'pro' || plan === 'enterprise';
};
