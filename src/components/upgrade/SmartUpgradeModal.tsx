import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Lock, Flame, TrendingUp, Zap, Check, Clock, AlertTriangle, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUpgradeTrigger, trackUpgradeClick, UpgradeTriggerSource } from "@/hooks/useUpgradeTrigger";
import { PRICING_V21 } from "@/config/pricing";
import { useTranslation } from "@/hooks/useTranslation";

const SOURCE_ICON: Record<UpgradeTriggerSource, typeof Sparkles> = {
  credit_threshold: Zap,
  feature_wall: Lock,
  streak_milestone: Flame,
  usage_recommendation: TrendingUp,
  trial_progress: Clock,
  feature_discovery: Sparkles,
  manual: Sparkles,
};

const SOURCE_ACCENT: Record<UpgradeTriggerSource, string> = {
  credit_threshold: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  feature_wall: "text-primary bg-primary/10 border-primary/30",
  streak_milestone: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  usage_recommendation: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  trial_progress: "text-rose-500 bg-rose-500/10 border-rose-500/30",
  feature_discovery: "text-violet-500 bg-violet-500/10 border-violet-500/30",
  manual: "text-primary bg-primary/10 border-primary/30",
};

const TRIAL_COUPON = "TRIAL20";

export const SmartUpgradeModal = () => {
  const { active, dismiss } = useUpgradeTrigger();
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  if (!active) return null;

  const plan = PRICING_V21[active.recommendedPlan];
  const Icon = SOURCE_ICON[active.source];
  const accent = SOURCE_ACCENT[active.source];

  const symbol = "$";
  const price = plan.price.USD.toFixed(2);

  // Trial-specific variants get the TRIAL20 coupon attached automatically
  const showCoupon = active.source === "trial_progress";
  const trialVariant = (active.metadata?.variant as string) || "halfway";

  const handleUpgrade = () => {
    trackUpgradeClick(active);
    dismiss();
    const params = new URLSearchParams();
    params.set("plan", active.recommendedPlan);
    if (showCoupon) params.set("coupon", TRIAL_COUPON);
    navigate(`/pricing?${params.toString()}`);
  };

  // Headline + body per source
  const getHeadline = (): string => {
    switch (active.source) {
      case "credit_threshold":
        return t("upgrade.smart.credits.title", { count: active.contextValue ?? 0 });
      case "feature_wall":
        return t("upgrade.smart.feature.title", { feature: active.feature ?? "" });
      case "streak_milestone":
        return t("upgrade.smart.streak.title", { days: active.contextValue ?? 0 });
      case "usage_recommendation":
        return t("upgrade.smart.usage.title");
      case "trial_progress":
        if (trialVariant === "grace") {
          return t("upgrade.smart.trial.graceTitle", { days: active.contextValue ?? 0 });
        }
        if (trialVariant === "last_day") {
          return t("upgrade.smart.trial.lastDayTitle");
        }
        if (trialVariant === "ending_soon") {
          return t("upgrade.smart.trial.endingTitle", { days: active.contextValue ?? 0 });
        }
        return t("upgrade.smart.trial.halfwayTitle", { days: active.contextValue ?? 0 });
      case "feature_discovery":
        return t("upgrade.smart.discovery.title", { feature: active.feature ?? "" });
      default:
        return t("upgrade.smart.manual.title");
    }
  };

  const getBody = (): string => {
    switch (active.source) {
      case "credit_threshold":
        return t("upgrade.smart.credits.body", { plan: plan.name });
      case "feature_wall":
        return t("upgrade.smart.feature.body", { feature: active.feature ?? "", plan: plan.name });
      case "streak_milestone":
        return t("upgrade.smart.streak.body");
      case "usage_recommendation":
        return t("upgrade.smart.usage.body", { plan: plan.name });
      case "trial_progress":
        if (trialVariant === "grace") {
          return t("upgrade.smart.trial.graceBody", { plan: plan.name });
        }
        if (trialVariant === "last_day") {
          return t("upgrade.smart.trial.lastDayBody", { plan: plan.name });
        }
        return t("upgrade.smart.trial.body", { plan: plan.name });
      case "feature_discovery":
        return t("upgrade.smart.discovery.body", {
          feature: active.feature ?? "",
          plan: plan.name,
        });
      default:
        return t("upgrade.smart.manual.body", { plan: plan.name });
    }
  };

  // Annual upsell variant for streak milestones (placeholder discount copy)
  const showAnnualDiscount = active.source === "streak_milestone";

  const benefits: string[] = [
    plan.credits === "unlimited"
      ? t("upgrade.smart.benefit.unlimited")
      : t("upgrade.smart.benefit.credits", { count: plan.credits as number }),
    plan.features.team
      ? t("upgrade.smart.benefit.team")
      : t("upgrade.smart.benefit.posting"),
    plan.features.analytics
      ? t("upgrade.smart.benefit.analytics")
      : t("upgrade.smart.benefit.brands"),
    plan.features.api
      ? t("upgrade.smart.benefit.api")
      : t("upgrade.smart.benefit.priority"),
  ];

  const isGrace = active.source === "trial_progress" && trialVariant === "grace";

  return (
    <Dialog open={!!active} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="sm:max-w-lg overflow-hidden p-0">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            {/* Decorative gradient header */}
            <div className={`relative px-6 pt-6 pb-4 border-b ${accent.split(" ").slice(1).join(" ")}`}>
              <div className="flex items-start gap-4">
                <motion.div
                  initial={{ scale: 0.8, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border ${accent}`}
                >
                  {isGrace ? <AlertTriangle className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <DialogHeader className="space-y-1 text-left">
                    <DialogTitle className="text-xl leading-tight">
                      {getHeadline()}
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                      {getBody()}
                    </DialogDescription>
                  </DialogHeader>
                </div>
              </div>
            </div>

            {/* Plan card */}
            <div className="px-6 py-5 space-y-4">
              {showCoupon && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5"
                >
                  <Tag className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {t("upgrade.smart.trial.couponLabel")}
                    </div>
                    <div className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {TRIAL_COUPON} — {t("upgrade.smart.trial.couponDiscount")}
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{plan.name}</span>
                      {showAnnualDiscount && (
                        <Badge variant="secondary" className="text-[10px]">
                          {t("upgrade.smart.annualSaving")}
                        </Badge>
                      )}
                      {showCoupon && (
                        <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400">
                          -20%
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("upgrade.smart.perfectForYou")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary tabular-nums">
                      {symbol}{price}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {language === "de" ? "pro Monat" : language === "es" ? "por mes" : "per month"}
                    </div>
                  </div>
                </div>

                <ul className="space-y-1.5">
                  {benefits.map((benefit, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <span>{benefit}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>

              {/* CTAs */}
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={dismiss} className="flex-1">
                  {t("upgrade.smart.maybeLater")}
                </Button>
                <Button onClick={handleUpgrade} className="flex-1" size="default">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {showCoupon
                    ? t("upgrade.smart.trial.cta")
                    : t("upgrade.smart.upgradeCta")}
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
