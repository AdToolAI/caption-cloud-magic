import { useEffect, useRef } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import {
  getLocalFeatureCount,
  PowerFeatureKey,
} from "@/lib/featureUsageTracker";

/**
 * Polls localStorage for power-feature usage counters. When the user has
 * opened a power feature 3+ times AND is on free / basic, surface an upgrade
 * prompt with feature-specific copy. Cooldown handled in useUpgradeTrigger
 * via the "feature_discovery" source (72h).
 */

const FEATURES: Array<{ key: PowerFeatureKey; label: string }> = [
  { key: "directors_cut", label: "Director's Cut" },
  { key: "sora_long_form", label: "Sora Long-Form" },
  { key: "video_composer", label: "Motion Studio" },
  { key: "ai_video_toolkit", label: "AI Video Toolkit" },
  { key: "picture_studio", label: "Picture Studio" },
  { key: "music_studio", label: "Music Studio" },
  { key: "talking_head", label: "Talking Head" },
  { key: "autopilot", label: "Autopilot" },
  { key: "email_director", label: "Email Director" },
  { key: "ad_director", label: "Ad Director" },
  { key: "video_translator", label: "Video Translator" },
  { key: "magic_edit", label: "Magic Edit" },
  { key: "upscaler", label: "AI Upscaler" },
  { key: "universal_video_creator", label: "Universal Video Creator" },
];

const THRESHOLD = 3;
const POLL_MS = 30_000;

export const FeatureDiscoveryWatcher = () => {
  const { balance } = useCredits();
  const { trigger } = useUpgradeTrigger();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!balance) return;
    // Power-tier users don't need this prompt
    if (balance.plan_code === "pro" || balance.plan_code === "enterprise") return;

    const check = () => {
      for (const f of FEATURES) {
        if (fired.current.has(f.key)) continue;
        const count = getLocalFeatureCount(f.key);
        if (count >= THRESHOLD) {
          fired.current.add(f.key);
          trigger({
            source: "feature_discovery",
            recommendedPlan: "pro",
            currentPlan: (balance.plan_code as any) ?? "free",
            feature: f.label,
            contextValue: count,
            metadata: {
              feature_key: f.key,
              use_count: count,
            },
          });
          break; // one prompt per check cycle
        }
      }
    };

    check();
    const id = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(id);
  }, [balance, trigger]);

  return null;
};
