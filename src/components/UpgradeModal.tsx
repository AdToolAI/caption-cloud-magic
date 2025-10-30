import { useNavigate } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pricingPlans, PlanType } from "@/config/pricing";
import { useTranslation } from "@/hooks/useTranslation";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  requiredPlan?: PlanType;
}

export const UpgradeModal = ({ 
  open, 
  onOpenChange, 
  feature,
  requiredPlan = 'basic'
}: UpgradeModalProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const plan = pricingPlans[requiredPlan];

  const handleUpgrade = () => {
    // Track upgrade click
    trackEvent(ANALYTICS_EVENTS.UPGRADE_CLICKED, {
      from_plan: 'free', // Could be enhanced to get actual current plan
      to_plan: requiredPlan,
      feature: feature
    });
    
    onOpenChange(false);
    navigate('/pricing');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-2xl">
            {t('upgradeRequired')}
          </DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-semibold">{feature}</span> is available on the{' '}
            <span className="font-semibold text-primary">{plan.name}</span> plan
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {`${plan.currency}${plan.price}`}
            </p>
            <p className="text-sm text-muted-foreground">per month</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>
                {plan.features.captionsPerMonth === Infinity 
                  ? 'Unlimited' 
                  : plan.features.captionsPerMonth} captions per month
              </span>
            </p>
            {plan.features.analytics && (
              <p className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Advanced analytics</span>
              </p>
            )}
            {plan.features.team && (
              <p className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Team collaboration</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpgrade} className="flex-1">
              {t('upgradePlan')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
