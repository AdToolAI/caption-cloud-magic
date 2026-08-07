import { PRICING_V21, PlanId } from '@/config/pricing';

/**
 * Check if a plan has access to Quick Calendar Post (Auto-Schedule)
 */
export const canQuickCalendarPost = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return false;
  return planConfig.features.quickCalendarPost;
};

/**
 * Check if a plan has access to team features
 */
export const canUseTeamFeatures = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return false;
  return planConfig.features.team;
};

/**
 * Check if a plan has access to white-label features
 */
export const canUseWhiteLabel = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return false;
  return planConfig.features.whiteLabel;
};

/**
 * Check if a plan has API access
 */
export const canUseApi = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return false;
  return planConfig.features.api;
};

/**
 * Check if a plan has X/Twitter access
 */
export const canUseXTwitter = (plan: PlanId | null | undefined): boolean => {
  if (!plan) return false;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return false;
  return planConfig.features.xTwitterAccess;
};

/**
 * Get all features for a plan
 */
export const getPlanFeatures = (plan: PlanId | null | undefined) => {
  if (!plan) return null;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return null;
  return planConfig.features;
};

/**
 * Get plan details including pricing
 */
export const getPlanDetails = (plan: PlanId | null | undefined) => {
  if (!plan) return null;
  const planConfig = PRICING_V21[plan as keyof typeof PRICING_V21];
  if (!planConfig) return null;
  return planConfig;
};

/* `canUseAIVideoGeneration` entfernt (Beta 2026): die alte pro/enterprise-Regel
   sperrte Beta-Basic- und Trial-Nutzer aus dem AI Video Studio aus. Zugang läuft
   jetzt überall über `useTrialAccess()` (aktives Abo oder laufende Testphase). */
