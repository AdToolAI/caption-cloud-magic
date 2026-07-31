import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import { PlanId } from "@/config/pricing";

/**
 * Detects "heavy users on a lower tier" — e.g. a Basic user who has generated
 * 5+ pieces of content in the last 7 days — and surfaces a Pro upsell.
 * Runs at most once per session (and is gated by useUpgradeTrigger cooldown).
 */
const HEAVY_USAGE_THRESHOLD = 5;

/**
 * Disabled during Beta: there is only one paid plan (14,99€), so the
 * "heavy user should upgrade" nudge has nothing to recommend.
 * Re-enable once tiered plans (Autopilot etc.) launch post-Beta.
 */
export const UsageRecommendationWatcher = () => {
  // Keep unused imports referenced so tree-shaking removes them cleanly
  void useAuth;
  void useCredits;
  void useUpgradeTrigger;
  void supabase;
  void useEffect;
  void useRef;
  void HEAVY_USAGE_THRESHOLD;
  return null;
};
