import { PRICING_V21, PlanId } from '@/config/pricing';

/**
 * Entitlements — Beta 2026 (Open Access).
 *
 * Alle Funktionen sind für jeden angemeldeten Nutzer freigeschaltet
 * (Testnutzer, Beta-Nutzer, zahlende Kunden). Die Plan-Prüfungen bleiben als
 * Shims bestehen, damit kein Consumer bricht, geben aber immer `true` zurück.
 */
export const canQuickCalendarPost = (_plan?: PlanId | null): boolean => true;
export const canUseTeamFeatures = (_plan?: PlanId | null): boolean => true;
export const canUseWhiteLabel = (_plan?: PlanId | null): boolean => true;
export const canUseApi = (_plan?: PlanId | null): boolean => true;
export const canUseXTwitter = (_plan?: PlanId | null): boolean => true;

/**
 * Get all features for a plan (informativ — steuert keinen Zugang mehr)
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

/* `canUseAIVideoGeneration` entfernt (Beta 2026). Zugang läuft überall offen —
   siehe `useTrialAccess()`. */
