import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { PlanId } from "@/config/pricing";

/**
 * Centralized upgrade trigger system for contextual conversion prompts.
 * Different triggers (credits low, feature wall, streak milestone, heavy usage)
 * funnel into a single SmartUpgradeModal with variant-specific copy.
 */

export type UpgradeTriggerSource =
  | "credit_threshold"      // Low credit balance
  | "feature_wall"          // Locked premium feature
  | "streak_milestone"      // After 7/30 day streak
  | "usage_recommendation"  // Heavy user on lower tier
  | "manual";               // Explicit upgrade button

export interface UpgradeTriggerPayload {
  source: UpgradeTriggerSource;
  /** The plan we suggest the user upgrade to. */
  recommendedPlan: PlanId;
  /** The user's current plan (best-effort). */
  currentPlan?: PlanId | null;
  /** A short feature/context label for analytics & UI (e.g. "Sora 2", "Quick Calendar Post", "Credits"). */
  feature?: string;
  /** Optional context-specific numeric data, e.g. credits remaining, streak days. */
  contextValue?: number;
  /** Free-form metadata sent to PostHog. */
  metadata?: Record<string, any>;
}

interface UpgradeTriggerContextValue {
  /** Currently active payload, or null when modal is closed. */
  active: UpgradeTriggerPayload | null;
  /** Open the upgrade modal with a specific trigger payload. */
  trigger: (payload: UpgradeTriggerPayload) => void;
  /** Dismiss the modal. */
  dismiss: () => void;
}

const UpgradeTriggerContext = createContext<UpgradeTriggerContextValue | null>(null);

const COOLDOWN_KEY = (source: UpgradeTriggerSource) => `upgrade_trigger_cooldown_${source}`;

/** Per-source cooldown so we don't spam the user. */
const COOLDOWN_HOURS: Record<UpgradeTriggerSource, number> = {
  credit_threshold: 24,
  feature_wall: 0,            // Always show on click
  streak_milestone: 168,      // 7 days
  usage_recommendation: 72,   // 3 days
  manual: 0,
};

const isInCooldown = (source: UpgradeTriggerSource): boolean => {
  if (COOLDOWN_HOURS[source] === 0) return false;
  try {
    const last = localStorage.getItem(COOLDOWN_KEY(source));
    if (!last) return false;
    const elapsedHours = (Date.now() - parseInt(last, 10)) / (1000 * 60 * 60);
    return elapsedHours < COOLDOWN_HOURS[source];
  } catch {
    return false;
  }
};

const markShown = (source: UpgradeTriggerSource): void => {
  try {
    localStorage.setItem(COOLDOWN_KEY(source), Date.now().toString());
  } catch {
    // ignore
  }
};

export const UpgradeTriggerProvider = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState<UpgradeTriggerPayload | null>(null);

  const trigger = useCallback((payload: UpgradeTriggerPayload) => {
    if (isInCooldown(payload.source)) {
      return;
    }
    markShown(payload.source);

    trackEvent("upgrade_prompt_shown", {
      source: payload.source,
      recommended_plan: payload.recommendedPlan,
      current_plan: payload.currentPlan ?? "unknown",
      feature: payload.feature,
      context_value: payload.contextValue,
      ...payload.metadata,
    });

    setActive(payload);
  }, []);

  const dismiss = useCallback(() => {
    if (active) {
      trackEvent("upgrade_prompt_dismissed", {
        source: active.source,
        recommended_plan: active.recommendedPlan,
        feature: active.feature,
      });
    }
    setActive(null);
  }, [active]);

  const value = useMemo(() => ({ active, trigger, dismiss }), [active, trigger, dismiss]);

  return (
    <UpgradeTriggerContext.Provider value={value}>
      {children}
    </UpgradeTriggerContext.Provider>
  );
};

export const useUpgradeTrigger = (): UpgradeTriggerContextValue => {
  const ctx = useContext(UpgradeTriggerContext);
  if (!ctx) {
    // Graceful degradation: provider not mounted (e.g. during tests / public pages)
    return {
      active: null,
      trigger: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
};

/** Re-export tracking constant for callers that wire up CTA clicks. */
export const trackUpgradeClick = (payload: UpgradeTriggerPayload) => {
  trackEvent(ANALYTICS_EVENTS.UPGRADE_CLICKED, {
    from_plan: payload.currentPlan ?? "unknown",
    to_plan: payload.recommendedPlan,
    feature: payload.feature,
    source: payload.source,
    context_value: payload.contextValue,
  });
};
